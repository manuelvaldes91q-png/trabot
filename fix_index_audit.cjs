const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const securityFunctions = `
function renderAuditLogs() {
  const list = document.getElementById('auditLogsList');
  if (!list) return;

  const logs = window.lastAuditLogs || [];
  const ipFilter = (document.getElementById('auditIpFilter')?.value || '').trim().toLowerCase();
  const catFilter = document.getElementById('auditCategoryFilter')?.value || 'ALL';

  let filtered = logs.filter(item => {
    const matchesIp = !ipFilter || (item.ip && item.ip.toLowerCase().includes(ipFilter)) || (item.details && item.details.toLowerCase().includes(ipFilter));
    const matchesCat = catFilter === 'ALL' || item.action === catFilter || (catFilter === 'PETICION_API' && !['TRANSFERENCIA', 'LOGIN', 'SWAP', 'CONFIGURACION', 'SEGURIDAD'].includes(item.action));
    return matchesIp && matchesCat;
  });

  const transfers = logs.filter(l => l.action === 'TRANSFERENCIA' || (l.details && l.details.toLowerCase().includes('transfer')));
  const summaryEl = document.getElementById('transferAuditSummary');
  const detailEl = document.getElementById('transferAuditDetail');
  const badgeEl = document.getElementById('transferAuditCountBadge');

  if (ipFilter) {
    const ipTransfers = transfers.filter(t => t.ip && t.ip.toLowerCase().includes(ipFilter));
    if (summaryEl) summaryEl.textContent = \`Auditoría para IP: \${ipFilter}\`;
    if (detailEl) {
      if (ipTransfers.length === 0) {
        detailEl.innerHTML = \`La IP <b style="color:var(--b)">\${escapeHtml(ipFilter)}</b> <span style="color:var(--g); font-weight:bold;">NO ha ejecutado ni solicitado transferencias de fondos</span>.\`;
      } else {
        detailEl.innerHTML = \`La IP <b style="color:var(--b)">\${escapeHtml(ipFilter)}</b> registra <span style="color:var(--r); font-weight:bold;">\${ipTransfers.length} solicitudes/ejecuciones de transferencia</span>.\`;
      }
    }
    if (badgeEl) badgeEl.textContent = \`\${ipTransfers.length} Transferencias (\${ipFilter})\`;
  } else {
    if (summaryEl) summaryEl.textContent = \`Estado Global de Transferencias por IP\`;
    if (detailEl) {
      if (transfers.length === 0) {
        detailEl.innerHTML = \`Ninguna IP ha realizado transferencias no autorizadas. El sistema de doble factor (2FA) está activo.\`;
      } else {
        detailEl.innerHTML = \`Se han registrado <b>\${transfers.length}</b> intentos/solicitudes de transferencia en total.\`;
      }
    }
    if (badgeEl) badgeEl.textContent = \`\${transfers.length} Transferencias Totales\`;
  }

  if (filtered.length === 0) {
    list.innerHTML = \`<tr><td colspan="5" style="padding:25px; text-align:center; color:var(--t2);">No se encontraron acciones registradas para los filtros seleccionados.</td></tr>\`;
    return;
  }

  list.innerHTML = filtered.slice(0, 100).map(item => {
    let catBadge = '';
    if (item.action === 'TRANSFERENCIA') {
      catBadge = '<span class="btn btn-r btn-xs" style="padding:2px 6px; pointer-events:none;">🔴 TRANSFERENCIA</span>';
    } else if (item.action === 'LOGIN') {
      catBadge = '<span class="btn btn-pu btn-xs" style="padding:2px 6px; pointer-events:none;">🟣 AUTENTICACIÓN</span>';
    } else if (item.action === 'SWAP') {
      catBadge = '<span class="btn btn-g btn-xs" style="padding:2px 6px; pointer-events:none;">🟢 SWAP</span>';
    } else if (item.action === 'CONFIGURACION') {
      catBadge = '<span class="btn btn-y btn-xs" style="padding:2px 6px; pointer-events:none;">⚙️ CONFIG</span>';
    } else if (item.action === 'SEGURIDAD') {
      catBadge = '<span class="btn btn-b btn-xs" style="padding:2px 6px; pointer-events:none;">🛡️ SEGURIDAD</span>';
    } else {
      catBadge = '<span class="btn btn-d btn-xs" style="padding:2px 6px; pointer-events:none;">🌐 PETICION API</span>';
    }

    const timeStr = new Date(item.timestamp).toLocaleString();

    return \`
      <tr style="border-bottom:1px solid var(--bdr);">
        <td style="padding:10px; font-family:var(--mono); font-size:11px; color:var(--t2); white-space:nowrap;">\${timeStr}</td>
        <td style="padding:10px; font-family:var(--mono); font-weight:bold;">
          <a href="#" onclick="filterAuditByIp('\${escapeHtml(item.ip)}'); return false;" style="color:var(--b); text-decoration:underline;" title="Filtrar por esta IP">\${escapeHtml(item.ip)}</a>
        </td>
        <td style="padding:10px;">\${catBadge}</td>
        <td style="padding:10px; font-size:11px; max-width:320px; word-break:break-word;">\${escapeHtml(item.details)}</td>
        <td style="padding:10px; font-size:10px; color:var(--t2); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="\${escapeHtml(item.userAgent)}">
          <span class="tag tb">\${escapeHtml(item.path || '/')}</span><br>
          \${escapeHtml(item.userAgent)}
        </td>
      </tr>
    \`;
  }).join('');
}

function filterAuditByIp(ip) {
  const inp = document.getElementById('auditIpFilter');
  if (inp) {
    inp.value = ip;
    renderAuditLogs();
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
}
`;

if (!code.includes('function renderAuditLogs(')) {
  code = code.replace('let quoteTimeout = null;', securityFunctions + '\nlet quoteTimeout = null;');
}

fs.writeFileSync('index.html', code);
console.log('Fixed index.html!');
