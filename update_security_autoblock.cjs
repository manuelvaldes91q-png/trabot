const fs = require('fs');

let serverCode = fs.readFileSync('server.js', 'utf8');

// 1. Ensure logIpAction, suspiciousActivityMap and blockIpAddress are defined
const securityHelpers = `
const suspiciousActivityMap = new Map(); // IP -> { count, firstTime, paths: [] }

function logIpAction(ip, action, details, reqPath, req) {
  try {
    const entry = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      timestamp: Date.now(),
      ip: ip || 'unknown',
      action: action || 'ACCION',
      details: details || '',
      path: reqPath || (req ? req.path : ''),
      userAgent: req ? (req.headers['user-agent'] || 'unknown') : 'system'
    };
    if (!Array.isArray(ipAuditLogs)) ipAuditLogs = [];
    ipAuditLogs.unshift(entry);
    if (ipAuditLogs.length > 500) ipAuditLogs.pop();
    saveState();
  } catch(e) {
    console.error('Error recording IP action audit:', e);
  }
}

function blockIpAddress(ip, reason, reqPath, req) {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') return;
  if (!appConfig.blockedIps) appConfig.blockedIps = [];
  
  const exists = appConfig.blockedIps.some(b => (typeof b === 'string' ? b : b.ip) === ip);
  if (!exists) {
    appConfig.blockedIps.push({
      ip,
      reason: reason || 'Bloqueo Automático por escaneo / actividad sospechosa',
      blockedAt: Date.now()
    });
  }
  activeSessions.delete(ip);
  saveState();
  logIpAction(ip, 'SEGURIDAD', \`🚫 AUTO-BLOQUEO: \${reason}\`, reqPath || '', req);
}

function recordSuspiciousActivity(ip, reqPath, reason, req) {
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1') return;
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutos
  let record = suspiciousActivityMap.get(ip) || { count: 0, firstTime: now, paths: [] };
  
  if (now - record.firstTime > windowMs) {
    record = { count: 0, firstTime: now, paths: [] };
  }
  
  record.count += 1;
  if (!record.paths.includes(reqPath)) record.paths.push(reqPath);
  suspiciousActivityMap.set(ip, record);
  
  logIpAction(ip, 'ESCANEO', \`⚠️ Detección Sospechosa (\${record.count}/3): \${reason} en \${reqPath}\`, reqPath, req);
  
  if (record.count >= 3) {
    blockIpAddress(ip, \`Bloqueo Automático: \${record.count} intentos de escaneo/peticiones sospechosas (\${record.paths.join(', ')})\`, reqPath, req);
    return true;
  }
  return false;
}
`;

// Insert securityHelpers before app.use((req, res, next) => {
const oldMiddlewareStart = "// Global session tracking & Security headers";
if (!serverCode.includes('function logIpAction(')) {
  serverCode = serverCode.replace(oldMiddlewareStart, securityHelpers + '\n\n' + oldMiddlewareStart);
}

// 2. Replace the global middleware block
const middlewareRegex = /\/\/ Global session tracking & Security headers[\s\S]*?res\.setHeader\('X-XSS-Protection', '1; mode=block'\);\s*next\(\);\s*}\);/;

const newMiddlewareCode = `// Global session tracking & Security headers
app.use((req, res, next) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : (req.socket.remoteAddress || 'unknown');
  
  // 1. Check if IP is in blacklist
  const blockedList = appConfig.blockedIps || [];
  const isBlocked = blockedList.some(b => (typeof b === 'string' ? b : b.ip) === ip);
  if (isBlocked) {
    return res.status(403).json({ error: 'Acceso Denegado: Dirección IP bloqueada por seguridad.' });
  }

  const reqPathLower = req.path.toLowerCase();
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const isBotUserAgent = ['infrawatch', 'masscan', 'zgrab', 'nmap', 'censys', 'nikto', 'sqlmap', 'python-requests', 'go-http-client', 'netsparker'].some(bot => ua.includes(bot));

  // 2. Direct scanner path probe (immediate auto-block)
  const explicitScannerPaths = [
    '/mcp', '/xxx', '/.env', '/wp-admin', '/phpmyadmin', '/.git', '/actuator', 
    '/shell', '/eval', '/config.php', '/admin.php', '/setup.php', '/xmlrpc.php',
    '/vendor', '/cgi-bin', '/swagger', '/api-docs', '/stuck', '/solana', '/eth', '/jsonrpc'
  ];
  const isExplicitScanner = explicitScannerPaths.some(p => reqPathLower.startsWith(p) || reqPathLower === p);

  if (isExplicitScanner || (isBotUserAgent && (req.method === 'POST' || reqPathLower !== '/'))) {
    blockIpAddress(ip, \`Bloqueo Automático: Escaneo malicioso/bot detectado (\${req.method} \${req.path}, UA: \${req.headers['user-agent'] || 'desconocido'})\`, req.path, req);
    return res.status(403).json({ error: 'IP bloqueada por detección de escaneo malicioso.' });
  }

  // 3. Auto-log non-GET API requests and track 404/403/invalid responses
  if (!req.path.startsWith('/assets') && !req.path.startsWith('/favicon')) {
    res.on('finish', () => {
      // If endpoint returned 404 on POST/PUT or non-existent route, record suspicious activity
      if (res.statusCode === 404 && (req.method !== 'GET' || reqPathLower.startsWith('/api/') || reqPathLower.startsWith('/mcp'))) {
        recordSuspiciousActivity(ip, req.path, \`Respuesta 404 en endpoint no existente (\${req.method})\`, req);
      } else if (req.method !== 'GET') {
        let category = 'PETICION_API';
        if (req.path.includes('transfer')) category = 'TRANSFERENCIA';
        else if (req.path.includes('swap')) category = 'SWAP';
        else if (req.path.includes('login')) category = 'LOGIN';
        else if (req.path.includes('config')) category = 'CONFIGURACION';
        else if (req.path.includes('block') || req.path.includes('terminate')) category = 'SEGURIDAD';
        
        let bodyStr = '';
        if (req.body && typeof req.body === 'object') {
          const safe = { ...req.body };
          delete safe.password;
          delete safe.secret;
          delete safe.privateKey;
          delete safe.twoFactorCode;
          bodyStr = JSON.stringify(safe);
          if (bodyStr.length > 120) bodyStr = bodyStr.slice(0, 120) + '...';
        }
        logIpAction(
          ip,
          category,
          \`\${req.method} \${req.path} -> Status \${res.statusCode} | Body: \${bodyStr || '{}'}\`,
          req.path,
          req
        );
      }
    });
  }

  // 4. Track active session ONLY for real panel user activity
  const isKnownBot = ua.includes('infrawatch') || ua.includes('bot') || ua.includes('crawler') || ua.includes('spider') || ua.includes('headless');
  if (!req.path.startsWith('/assets') && !req.path.startsWith('/favicon') && !isKnownBot) {
    activeSessions.set(ip, {
      lastAccess: Date.now(),
      userAgent: req.headers['user-agent'] || 'unknown',
      path: req.path
    });
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});`;

if (middlewareRegex.test(serverCode)) {
  serverCode = serverCode.replace(middlewareRegex, newMiddlewareCode);
  fs.writeFileSync('server.js', serverCode);
  console.log('Successfully updated server.js with auto-blocking security system!');
} else {
  console.error('Middleware pattern not matched!');
}
