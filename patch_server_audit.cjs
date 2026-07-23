const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. Declare ipAuditLogs at top
if (!code.includes('let ipAuditLogs = [];')) {
  code = code.replace(
    'const activeSessions = new Map();',
    'const activeSessions = new Map();\nlet ipAuditLogs = []; // Audit log of actions by IP'
  );
}

// 2. Add logIpAction function
const logIpActionFunc = `
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
    ipAuditLogs.unshift(entry);
    if (ipAuditLogs.length > 500) ipAuditLogs.pop();
    saveState();
  } catch(e) {
    console.error('Error recording IP action audit:', e);
  }
}
`;

if (!code.includes('function logIpAction(')) {
  code = code.replace(
    'function rateLimiter(',
    logIpActionFunc + '\nfunction rateLimiter('
  );
}

// 3. Update global middleware to auto-log POST/PUT/DELETE requests
const oldMiddleware = `// Check if IP is in blacklist
  const blockedList = appConfig.blockedIps || [];
  const isBlocked = blockedList.some(b => (typeof b === 'string' ? b : b.ip) === ip);
  if (isBlocked) {
    return res.status(403).json({ error: 'Acceso Denegado: Dirección IP bloqueada por seguridad.' });
  }

  // Track active session for the security tab
  if (!req.path.startsWith('/assets') && !req.path.startsWith('/favicon')) {
    activeSessions.set(ip, {
      lastAccess: Date.now(),
      userAgent: req.headers['user-agent'] || 'unknown',
      path: req.path
    });
  }`;

const newMiddleware = `// Check if IP is in blacklist
  const blockedList = appConfig.blockedIps || [];
  const isBlocked = blockedList.some(b => (typeof b === 'string' ? b : b.ip) === ip);
  if (isBlocked) {
    return res.status(403).json({ error: 'Acceso Denegado: Dirección IP bloqueada por seguridad.' });
  }

  // Track active session for the security tab
  if (!req.path.startsWith('/assets') && !req.path.startsWith('/favicon')) {
    activeSessions.set(ip, {
      lastAccess: Date.now(),
      userAgent: req.headers['user-agent'] || 'unknown',
      path: req.path
    });
  }

  // Auto-log POST / PUT / DELETE API requests
  if (req.method !== 'GET' && !req.path.startsWith('/assets') && !req.path.startsWith('/favicon')) {
    res.on('finish', () => {
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
    });
  }`;

code = code.replace(oldMiddleware, newMiddleware);

// 4. Update saveState & loadState to persist ipAuditLogs
code = code.replace(
  'fs.writeFileSync(tmp, JSON.stringify({ SIM, watchItems, autopilotTradedMints, autopilotRejectedMints, logs, monitorOn, monitorInterval, mode, solMode, appConfig: safeAppConfig, poolConfig: safePoolConfig }));',
  'fs.writeFileSync(tmp, JSON.stringify({ SIM, watchItems, autopilotTradedMints, autopilotRejectedMints, logs, monitorOn, monitorInterval, mode, solMode, ipAuditLogs, appConfig: safeAppConfig, poolConfig: safePoolConfig }));'
);

if (!code.includes('if (data.ipAuditLogs) ipAuditLogs = data.ipAuditLogs;')) {
  code = code.replace(
    'if (data.logs) logs = data.logs;',
    'if (data.logs) logs = data.logs;\n      if (data.ipAuditLogs) ipAuditLogs = data.ipAuditLogs;'
  );
}

// 5. Update active-sessions endpoint to return ipAuditLogs
code = code.replace(
  'blockedIps: appConfig.blockedIps || []\n  });',
  'blockedIps: appConfig.blockedIps || [],\n    ipAuditLogs: ipAuditLogs || []\n  });'
);

fs.writeFileSync('server.js', code);
console.log('server.js updated with IP Audit Logs system!');
