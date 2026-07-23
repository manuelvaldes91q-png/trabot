const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// Replace table header in Sesiones Activas
const oldHeader = `<tr style="border-bottom:2px solid var(--bdr); color:var(--t2);">
              <th style="padding:12px 10px;">Dirección IP</th>
              <th style="padding:12px 10px;">Última Actividad</th>
              <th style="padding:12px 10px;">Endpoint / Ruta</th>
              <th style="padding:12px 10px;">Dispositivo / User Agent</th>
            </tr>`;

const newHeader = `<tr style="border-bottom:2px solid var(--bdr); color:var(--t2);">
              <th style="padding:12px 10px;">Dirección IP</th>
              <th style="padding:12px 10px;">Última Actividad</th>
              <th style="padding:12px 10px;">Endpoint / Ruta</th>
              <th style="padding:12px 10px;">Dispositivo / User Agent</th>
              <th style="padding:12px 10px;">Acciones</th>
            </tr>`;

code = code.replace(oldHeader, newHeader);

// Add Blacklist Table right after Sesiones Activas table closing div
const activeSessionsEndTag = `</tbody>
        </table>
      </div>
    </div>

    <!-- FAILED LOGINS -->`;

const blacklistTableHTML = `</tbody>
        </table>
      </div>
    </div>

    <!-- IPS BLOQUEADAS (LISTA NEGRA) -->
    <div style="background:rgba(239,68,68,0.03); border:1px solid rgba(239,68,68,0.2); border-radius:12px; padding:25px; margin-bottom:25px; box-shadow:0 4px 15px rgba(0,0,0,0.1);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
        <div>
          <div style="font-size:15px; font-weight:bold; color:var(--r); margin-bottom:5px; display:flex; align-items:center; gap:8px;">
            <span>🚫</span> IPs Bloqueadas (Lista Negra)
          </div>
          <div style="font-size:12px; color:var(--t2);">Direcciones IP que tienen el acceso completamente denegado al servidor.</div>
        </div>
        <div style="display:flex; gap:8px;">
          <input type="text" id="manualBlockIpInput" placeholder="Ej: 143.198.55.47" class="inp" style="width:160px; font-size:11px; padding:4px 8px;">
          <button class="btn btn-r btn-sm" onclick="manualBlockIp()">🚫 Bloquear IP</button>
        </div>
      </div>
      
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
          <thead>
            <tr style="border-bottom:2px solid var(--bdr); color:var(--t2);">
              <th style="padding:12px 10px;">Dirección IP</th>
              <th style="padding:12px 10px;">Fecha Bloqueo</th>
              <th style="padding:12px 10px;">Motivo</th>
              <th style="padding:12px 10px;">Acción</th>
            </tr>
          </thead>
          <tbody id="blockedIpsList">
            <tr><td colspan="4" style="padding:20px; text-align:center; color:var(--t2);">Cargando lista negra...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- FAILED LOGINS -->`;

code = code.replace(activeSessionsEndTag, blacklistTableHTML);

// Replace loadSecurityData function and add helper actions
const oldScript = `async function loadSecurityData() {
  const list = document.getElementById('securitySessionsList');
  const failedList = document.getElementById('failedLoginsList');
  try {
    const r = await myFetch('/api/admin/active-sessions');
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
    
    if (!d.sessions || d.sessions.length === 0) {
      list.innerHTML = '<tr><td colspan="4" style="padding:20px; text-align:center; color:var(--t2);">No hay sesiones activas registradas.</td></tr>';
    } else {
      list.innerHTML = d.sessions.map(s => \`
        <tr style="border-bottom:1px solid var(--bdr);">
          <td style="padding:12px 10px; font-family:var(--mono); color:var(--b); font-weight:bold;">\${escapeHtml(s.ip)}</td>
          <td style="padding:12px 10px;">\${new Date(s.lastAccess).toLocaleTimeString()} <span style="font-size:9px; color:var(--t2);">(\${Math.floor((Date.now()-s.lastAccess)/1000)}s ago)</span></td>
          <td style="padding:12px 10px;"><span class="tag tb">\${s.path}</span></td>
          <td style="padding:12px 10px; font-size:10px; color:var(--t2); max-width:250px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="\${escapeHtml(s.userAgent)}">\${escapeHtml(s.userAgent)}</td>
        </tr>
      \`).join('');
    }`;

const newScript = `async function loadSecurityData() {
  const list = document.getElementById('securitySessionsList');
  const failedList = document.getElementById('failedLoginsList');
  const blockedList = document.getElementById('blockedIpsList');
  try {
    const r = await myFetch('/api/admin/active-sessions');
    const d = await r.json();
    if (!d.success) throw new Error(d.error);
    
    if (!d.sessions || d.sessions.length === 0) {
      list.innerHTML = '<tr><td colspan="5" style="padding:20px; text-align:center; color:var(--t2);">No hay sesiones activas registradas.</td></tr>';
    } else {
      list.innerHTML = d.sessions.map(s => \`
        <tr style="border-bottom:1px solid var(--bdr);">
          <td style="padding:12px 10px; font-family:var(--mono); color:var(--b); font-weight:bold;">\${escapeHtml(s.ip)}</td>
          <td style="padding:12px 10px;">\${new Date(s.lastAccess).toLocaleTimeString()} <span style="font-size:9px; color:var(--t2);">(\${Math.floor((Date.now()-s.lastAccess)/1000)}s ago)</span></td>
          <td style="padding:12px 10px;"><span class="tag tb">\${s.path}</span></td>
          <td style="padding:12px 10px; font-size:10px; color:var(--t2); max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="\${escapeHtml(s.userAgent)}">\${escapeHtml(s.userAgent)}</td>
          <td style="padding:12px 10px;">
            <div style="display:flex; gap:6px;">
              <button class="btn btn-r btn-xs" onclick="blockIp('\${escapeHtml(s.ip)}')">🚫 Bloquear</button>
              <button class="btn btn-d btn-xs" onclick="terminateSession('\${escapeHtml(s.ip)}')">❌ Cerrar</button>
            </div>
          </td>
        </tr>
      \`).join('');
    }

    if (!blockedList) return;
    if (!d.blockedIps || d.blockedIps.length === 0) {
      blockedList.innerHTML = '<tr><td colspan="4" style="padding:20px; text-align:center; color:var(--t2);">No hay direcciones IP bloqueadas en la lista negra.</td></tr>';
    } else {
      blockedList.innerHTML = d.blockedIps.map(b => {
        const ip = typeof b === 'string' ? b : b.ip;
        const reason = typeof b === 'object' && b.reason ? b.reason : 'Bloqueado';
        const dateStr = typeof b === 'object' && b.blockedAt ? new Date(b.blockedAt).toLocaleDateString() : '—';
        return \`
          <tr style="border-bottom:1px solid var(--bdr);">
            <td style="padding:12px 10px; font-family:var(--mono); color:var(--r); font-weight:bold;">\${escapeHtml(ip)}</td>
            <td style="padding:12px 10px; color:var(--t2);">\${dateStr}</td>
            <td style="padding:12px 10px; color:var(--t); font-size:11px;">\${escapeHtml(reason)}</td>
            <td style="padding:12px 10px;">
              <button class="btn btn-g btn-xs" onclick="unblockIp('\${escapeHtml(ip)}')">🟢 Desbloquear</button>
            </td>
          </tr>
        \`;
      }).join('');
    }`;

code = code.replace(oldScript, newScript);

// Append actions functions before end of script
const scriptEndMatch = `} catch (e) {
    list.innerHTML = \`<tr><td colspan="4" style="padding:20px; text-align:center; color:var(--r);">Error al cargar sesiones: \${e.message}</td></tr>\`;
  }
}`;

const scriptEndReplacement = `} catch (e) {
    if (list) list.innerHTML = \`<tr><td colspan="5" style="padding:20px; text-align:center; color:var(--r);">Error al cargar sesiones: \${e.message}</td></tr>\`;
  }
}

async function terminateSession(ip) {
  if (!confirm(\`¿Eliminar la sesión activa para la IP \${ip}?\`)) return;
  try {
    const res = await myFetch('/api/admin/terminate-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Error al eliminar sesión');
    alert(d.message || 'Sesión eliminada');
    loadSecurityData();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

async function blockIp(ip) {
  const reason = prompt(\`Motivo para bloquear la IP \${ip}:\`, 'Bloqueada por seguridad');
  if (reason === null) return;
  try {
    const res = await myFetch('/api/admin/block-ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, reason })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Error al bloquear IP');
    alert(d.message || 'IP bloqueada con éxito');
    loadSecurityData();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

async function unblockIp(ip) {
  if (!confirm(\`¿Desbloquear la IP \${ip} y permitirle volver a acceder?\`)) return;
  try {
    const res = await myFetch('/api/admin/unblock-ip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip })
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Error al desbloquear IP');
    alert(d.message || 'IP desbloqueada');
    loadSecurityData();
  } catch(e) {
    alert('Error: ' + e.message);
  }
}

async function manualBlockIp() {
  const input = document.getElementById('manualBlockIpInput');
  const ip = input ? input.value.trim() : '';
  if (!ip) { alert('Ingresa una dirección IP válida.'); return; }
  await blockIp(ip);
  if (input) input.value = '';
}`;

code = code.replace(scriptEndMatch, scriptEndReplacement);

fs.writeFileSync('index.html', code);
console.log('index.html updated successfully!');
