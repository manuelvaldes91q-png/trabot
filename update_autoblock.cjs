const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// List of scanner / exploit probe paths to automatically block
const scannerPaths = [
  '/mcp', '/xxx', '/.env', '/wp-admin', '/phpmyadmin', '/admin.php',
  '/config.json', '/.git', '/actuator', '/api/v1/pod', '/shell', '/eval'
];

const newMiddleware = `// Global session tracking & Security headers
app.use((req, res, next) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : (req.socket.remoteAddress || 'unknown');
  
  // 1. Check if IP is in blacklist
  const blockedList = appConfig.blockedIps || [];
  const isBlocked = blockedList.some(b => (typeof b === 'string' ? b : b.ip) === ip);
  if (isBlocked) {
    return res.status(403).json({ error: 'Acceso Denegado: Dirección IP bloqueada por seguridad.' });
  }

  // 2. Auto-block suspicious scanners probing bad paths
  const reqPathLower = req.path.toLowerCase();
  const isScannerPath = ['/mcp', '/xxx', '/.env', '/wp-admin', '/phpmyadmin', '/.git', '/actuator', '/shell', '/eval', '/config.php'].some(p => reqPathLower.startsWith(p));
  
  if (isScannerPath) {
    if (!appConfig.blockedIps) appConfig.blockedIps = [];
    appConfig.blockedIps.push({
      ip,
      reason: \`Bloqueo Automático: Intento de escaneo en ruta sospechosa (\${req.path})\`,
      blockedAt: Date.now()
    });
    activeSessions.delete(ip);
    saveState();
    logIpAction(ip, 'SEGURIDAD', \`🚫 AUTO-BLOQUEO: Escaneo detectado en \${req.path}\`, req.path, req);
    return res.status(403).json({ error: 'IP bloqueada por detección de escaneo malicioso.' });
  }

  // 3. Track active session ONLY for admin API or real panel activity (exclude automated bot user-agents and assets)
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const isBot = ua.includes('infrawatch') || ua.includes('bot') || ua.includes('crawler') || ua.includes('spider') || ua.includes('headless');
  
  if (!req.path.startsWith('/assets') && !req.path.startsWith('/favicon') && !isBot) {
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

// Find existing app.use middleware block and replace
const middlewareStartIndex = code.indexOf('// Global session tracking & Security headers');
const middlewareEndIndex = code.indexOf('function rateLimiter(');

if (middlewareStartIndex !== -1 && middlewareEndIndex !== -1) {
  code = code.slice(0, middlewareStartIndex) + newMiddleware + '\n\n' + code.slice(middlewareEndIndex);
  fs.writeFileSync('server.js', code);
  console.log('Successfully updated server.js with scanner auto-block and bot filter!');
} else {
  console.error('Could not find middleware bounds in server.js');
}
