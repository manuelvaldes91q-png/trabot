const fs = require('fs');

// 1. Update server.js
let serverCode = fs.readFileSync('server.js', 'utf8');

const targetEndpoint = "app.get('/api/admin/active-sessions', adminAuth, (req, res) => {";
const replacementEndpoint = `app.get('/api/admin/active-sessions', adminAuth, (req, res) => {
  const forwarded = req.headers['x-forwarded-for'];
  const yourIp = forwarded ? forwarded.split(',')[0].trim() : (req.socket.remoteAddress || 'unknown');
  const sessions = [];
  const now = Date.now();
  for (const [ip, data] of activeSessions.entries()) {
    if (now - data.lastAccess > 30 * 60 * 1000) {
      activeSessions.delete(ip);
      continue;
    }
    sessions.push({ ip, ...data });
  }
  res.json({ 
    success: true, 
    yourIp,
    sessions, 
    failedLogins,
    blockedIps: appConfig.blockedIps || [],
    ipAuditLogs: ipAuditLogs || []
  });
});

const _dummyOldEndpoint = `;

if (serverCode.includes(targetEndpoint)) {
  const endIdx = serverCode.indexOf("app.post('/api/admin/terminate-session'", serverCode.indexOf(targetEndpoint));
  if (endIdx !== -1) {
    const oldPart = serverCode.substring(serverCode.indexOf(targetEndpoint), endIdx);
    serverCode = serverCode.replace(oldPart, replacementEndpoint);
    fs.writeFileSync('server.js', serverCode);
    console.log('Successfully updated server.js to return yourIp!');
  }
} else {
  console.log('Target endpoint not found as exact string in server.js, searching pattern...');
}

// 2. Update index.html
let htmlCode = fs.readFileSync('index.html', 'utf8');

const oldLoadSecStart = "async function loadSecurityData() {";
const oldLoadSecEnd = "window.lastAuditLogs = d.ipAuditLogs || [];";

const newLoadSecBlock = `async function loadSecurityData() {
  const list = document.getElementById('securitySessionsList');
  const failedList = document.getElementById('failedLoginsList');
  const blockedList = document.getElementById('blockedIpsList');
  try {
    const r = await myFetch('/api/admin/active-sessions');
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
    
    const myIp = d.yourIp || '';
    if (!d.sessions || d.sessions.length === 0) {
      list.innerHTML = '<tr><td colspan="5" style="padding:20px; text-align:center; color:var(--t2);">No hay sesiones activas registradas.</td></tr>';
    } else {
      list.innerHTML = d.sessions.map(s => {
        const isMySession = Boolean(myIp && s.ip === myIp);
        const ipDisplay = isMySession 
          ? \`<span style="color:#10b981; font-weight:bold;">\${escapeHtml(s.ip)}</span> <span class="tag tg" style="margin-left:6px; font-size:10px; padding:2px 6px; background:rgba(16,185,129,0.15); color:#10b981; border:1px solid rgba(16,185,129,0.3);">🟢 TU SESIÓN (Tú)</span>\`
          : \`<span style="color:var(--b); font-weight:bold;">\${escapeHtml(s.ip)}</span> <span class="tag tr" style="margin-left:6px; font-size:10px; padding:2px 6px; background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);">⚠️ Externa / Escáner</span>\`;
        
        return \`
        <tr style="border-bottom:1px solid var(--bdr); \${isMySession ? 'background: rgba(16,185,129,0.06);' : ''}">
          <td style="padding:12px 10px; font-family:var(--mono);">\${ipDisplay}</td>
          <td style="padding:12px 10px;">\${new Date(s.lastAccess).toLocaleTimeString()} <span style="font-size:9px; color:var(--t2);">(\${Math.floor((Date.now()-s.lastAccess)/1000)}s ago)</span></td>
          <td style="padding:12px 10px;"><span class="tag tb">\${escapeHtml(s.path)}</span></td>
          <td style="padding:12px 10px; font-size:10px; color:var(--t2); max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="\${escapeHtml(s.userAgent)}">\${escapeHtml(s.userAgent)}</td>
          <td style="padding:12px 10px;">
            <div style="display:flex; gap:6px; align-items:center;">
              \${isMySession ? '<span style="font-size:11px; color:#10b981; font-weight:bold;">🛡️ Sesión Activa</span>' : \`
                <button class="btn btn-r btn-xs" onclick="blockIp('\${escapeHtml(s.ip)}')">🚫 Bloquear IP</button>
                <button class="btn btn-d btn-xs" onclick="terminateSession('\${escapeHtml(s.ip)}')">❌ Cerrar</button>
              \`}
            </div>
          </td>
        </tr>
      \`;
      }).join('');
    }

    window.lastAuditLogs = d.ipAuditLogs || [];`;

const sIdx = htmlCode.indexOf(oldLoadSecStart);
const eIdx = htmlCode.indexOf(oldLoadSecEnd);

if (sIdx !== -1 && eIdx !== -1) {
  htmlCode = htmlCode.substring(0, sIdx) + newLoadSecBlock + '\n    ' + htmlCode.substring(eIdx);
  fs.writeFileSync('index.html', htmlCode);
  console.log('Successfully updated index.html with Tu Sesion badge!');
} else {
  console.error('Could not find loadSecurityData block in index.html');
}
