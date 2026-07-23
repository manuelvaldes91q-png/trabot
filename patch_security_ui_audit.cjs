const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

// Insert Audit Table HTML before FAILED LOGINS
const failedLoginsMarker = `<!-- FAILED LOGINS -->`;

const auditSectionHTML = `<!-- AUDITORIA DE ACCIONES POR IP -->
    <div style="background:var(--bg2); border:1px solid var(--bdr); border-radius:12px; padding:25px; margin-bottom:25px; box-shadow:0 4px 15px rgba(0,0,0,0.1);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="font-size:15px; font-weight:bold; color:var(--g); margin-bottom:5px; display:flex; align-items:center; gap:8px;">
            <span>📜</span> Registro de Auditoría de Acciones por IP
          </div>
          <div style="font-size:12px; color:var(--t2);">
            Monitoreo detallado de cada operación ejecutada (transferencias, swaps, logins y llamadas a API).
          </div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <input type="text" id="auditIpFilter" placeholder="🔍 Filtrar por IP (ej: 143.198.55.47)" class="inp" style="width:210px; font-size:11px; padding:6px 10px;" oninput="renderAuditLogs()">
          <select id="auditCategoryFilter" class="inp" style="width:140px; font-size:11px; padding:6px 8px;" onchange="renderAuditLogs()">
            <option value="ALL">Todas las Categorías</option>
            <option value="TRANSFERENCIA">🔴 Transferencias</option>
            <option value="LOGIN">🟣 Logins / Autenticación</option>
            <option value="SWAP">🟢 Swaps / Operaciones</option>
            <option value="CONFIGURACION">⚙️ Configuración</option>
            <option value="SEGURIDAD">🛡️ Seguridad / IP</option>
            <option value="PETICION_API">🌐 API General</option>
          </select>
          <button class="btn btn-b btn-sm" onclick="loadSecurityData()">🔄 Actualizar Audit</button>
        </div>
      </div>

      <!-- BANNER DE VERIFICACION RAPIDA -->
      <div id="transferAuditAlert" style="background:rgba(0,229,160,0.06); border:1px solid rgba(0,229,160,0.25); border-radius:8px; padding:12px 16px; margin-bottom:18px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:18px;">🛡️</span>
          <div>
            <div style="font-size:12px; font-weight:bold; color:var(--g);" id="transferAuditSummary">Estado de Transferencias por IP</div>
            <div style="font-size:11px; color:var(--t2);" id="transferAuditDetail">Verificando registro de transferencias...</div>
          </div>
        </div>
        <div id="transferAuditCountBadge" style="font-family:var(--mono); font-size:10px; background:rgba(0,229,160,0.15); color:var(--g); padding:4px 10px; border-radius:4px; font-weight:bold;">
          0 Transferencias
        </div>
      </div>

      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
          <thead>
            <tr style="border-bottom:2px solid var(--bdr); color:var(--t2);">
              <th style="padding:12px 10px;">Fecha / Hora</th>
              <th style="padding:12px 10px;">Dirección IP</th>
              <th style="padding:12px 10px;">Acción / Categoría</th>
              <th style="padding:12px 10px;">Detalles de la Operación</th>
              <th style="padding:12px 10px;">Ruta / User Agent</th>
            </tr>
          </thead>
          <tbody id="auditLogsList">
            <tr><td colspan="5" style="padding:30px; text-align:center; color:var(--t2);">Cargando registros de auditoría...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- FAILED LOGINS -->`;

code = code.replace(failedLoginsMarker, auditSectionHTML);

// Store lastAuditLogs and trigger renderAuditLogs in loadSecurityData
code = code.replace(
  'const r = await myFetch(\'/api/admin/active-sessions\');',
  'const r = await myFetch(\'/api/admin/active-sessions\');'
);

code = code.replace(
  'if (!blockedList) return;',
  'window.lastAuditLogs = d.ipAuditLogs || [];\n    renderAuditLogs();\n    if (!blockedList) return;'
);

// Add JS helper functions
const auditJsFuncs = `
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
`;

code = code.replace(
  'async function manualBlockIp() {',
  auditJsFuncs + '\nasync function manualBlockIp() {'
);

fs.writeFileSync('index.html', code);
console.log('index.html updated with audit log UI!');
