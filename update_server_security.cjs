const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. Update Middleware
const oldMiddleware = `// Global session tracking & Security headers
app.use((req, res, next) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : (req.socket.remoteAddress || 'unknown');
  
  // Track active session for the security tab
  if (!req.path.startsWith('/assets') && !req.path.startsWith('/favicon')) {
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

const newMiddleware = `// Global session tracking & Security headers
app.use((req, res, next) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : (req.socket.remoteAddress || 'unknown');
  
  // Check if IP is in blacklist
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

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});`;

code = code.replace(oldMiddleware, newMiddleware);

// 2. Update active-sessions endpoint & add block/unblock/terminate endpoints
const oldEndpoint = `app.get('/api/admin/active-sessions', adminAuth, (req, res) => {
  const sessions = [];
  const now = Date.now();
  // Clean up old sessions (older than 30 mins) while iterating
  for (const [ip, data] of activeSessions.entries()) {
    if (now - data.lastAccess > 30 * 60 * 1000) {
      activeSessions.delete(ip);
      continue;
    }
    sessions.push({ ip, ...data });
  }
  res.json({ success: true, sessions, failedLogins });
});`;

const newEndpoints = `app.get('/api/admin/active-sessions', adminAuth, (req, res) => {
  const sessions = [];
  const now = Date.now();
  // Clean up old sessions (older than 30 mins) while iterating
  for (const [ip, data] of activeSessions.entries()) {
    if (now - data.lastAccess > 30 * 60 * 1000) {
      activeSessions.delete(ip);
      continue;
    }
    sessions.push({ ip, ...data });
  }
  res.json({ 
    success: true, 
    sessions, 
    failedLogins,
    blockedIps: appConfig.blockedIps || []
  });
});

app.post('/api/admin/terminate-session', adminAuth, (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP requerida' });
  activeSessions.delete(ip);
  saveState();
  res.json({ success: true, message: \`Sesión de IP \${ip} eliminada.\` });
});

app.post('/api/admin/block-ip', adminAuth, (req, res) => {
  const { ip, reason } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP requerida' });
  if (!appConfig.blockedIps) appConfig.blockedIps = [];
  
  const exists = appConfig.blockedIps.some(b => (typeof b === 'string' ? b : b.ip) === ip);
  if (!exists) {
    appConfig.blockedIps.push({
      ip,
      reason: reason || 'Bloqueado manualmente desde el panel de seguridad',
      blockedAt: Date.now()
    });
  }
  activeSessions.delete(ip);
  saveState();
  res.json({ success: true, message: \`IP \${ip} bloqueada correctamente.\` });
});

app.post('/api/admin/unblock-ip', adminAuth, (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP requerida' });
  if (!appConfig.blockedIps) appConfig.blockedIps = [];
  appConfig.blockedIps = appConfig.blockedIps.filter(b => (typeof b === 'string' ? b : b.ip) !== ip);
  saveState();
  res.json({ success: true, message: \`IP \${ip} desbloqueada correctamente.\` });
});`;

code = code.replace(oldEndpoint, newEndpoints);

fs.writeFileSync('server.js', code);
console.log('server.js updated successfully!');
