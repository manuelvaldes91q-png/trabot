const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const uiReplacement = `
async function updateRpcRole(url, role) {
  try {
    await myFetch('/api/solana/update-rpc-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, role })
    });
    loadRpcStatus();
  } catch (e) {
    alert('Error al actualizar función del RPC: ' + e.message);
  }
}

async function loadRpcStatus() {
  const container = document.getElementById('rpcStatusList');
  if (!container) return;
  container.innerHTML = '<div style="color:var(--t2); font-size:11px; padding:10px; text-align:center;">Verificando estado de los nodos RPC en tiempo real...</div>';
  try {
    const res = await myFetch('/api/solana/rpc-status');
    if (res.ok) {
      const data = await res.json();
      if (data.endpoints && data.endpoints.length > 0) {
        let html = '';
        const priorityList = data.rpcPriorityList || [];
        const rpcRoles = data.rpcRoles || {};
        
        html += \`
          <div style="background:rgba(0,180,216,0.05); border:1px solid rgba(0,180,216,0.2); border-radius:6px; padding:12px; margin-bottom:12px; font-size:11px;">
            <div style="font-weight:bold; color:var(--b); margin-bottom:6px;">🔹 Estado Actual de Enrutamiento (Failover Activo)</div>
            <div style="display:flex; flex-direction:column; gap:4px; color:var(--t);">
              <div><strong style="color:var(--g)">Nodo Crítico (Swaps, Transferencias):</strong> <span style="font-family:var(--mono);">\${data.activeCriticalRpc || 'Ninguno'}</span></div>
              <div><strong style="color:var(--y)">Nodo Secundario (Cotizaciones, Monitoreo):</strong> <span style="font-family:var(--mono);">\${data.activeNonCriticalRpc || 'Ninguno'}</span></div>
            </div>
            <div style="margin-top:8px; color:var(--t2); font-size:10px;">
              <i>Nota:</i> Puedes configurar la prioridad de uso y la función específica de cada nodo (ej. usar uno rápido y de pago para Swaps, y uno gratuito para Cotizaciones). También se incluyen automáticamente los nodos configurados en tu archivo <code>.env</code>.
            </div>
          </div>
        \`;
`;

code = code.replace(
/async function loadRpcStatus\(\) \{[\s\S]*?También incluye automáticamente cualquier RPC agregado en tu archivo <code>\.env<\/code>\.\n            <\/div>\n          <\/div>\n        `;/g,
uiReplacement
);


const endpointLoopReplacement = `
        sortedEndpoints.forEach(ep => {
          const isBad = ep.blacklisted;
          const statusColor = isBad ? 'var(--r)' : (ep.status === 'healthy' ? 'var(--g)' : 'var(--y)');
          const statusText = isBad ? \`Excluido (\${Math.ceil(ep.blacklistRemainingMs / 1000)}s)\` : 'Saludable';
          const isCustom = ep.isCustom;
          const epRole = rpcRoles[ep.url] || 'all';
          
          const pIdx = priorityList.indexOf(ep.url);
          const isPriority = pIdx !== -1;
          
          let priorityControls = '';
          if (isPriority) {
            priorityControls += \`
              <button class="btn btn-sm" style="padding:2px 6px; font-size:9px;" onclick="moveRpcPriority('\${ep.url}', 'up')" \${pIdx === 0 ? 'disabled' : ''}>⬆️</button>
              <button class="btn btn-sm" style="padding:2px 6px; font-size:9px;" onclick="moveRpcPriority('\${ep.url}', 'down')" \${pIdx === priorityList.length - 1 ? 'disabled' : ''}>⬇️</button>
              <button class="btn btn-sm" style="padding:2px 6px; font-size:9px; background:rgba(239,68,68,0.1); color:var(--r);" onclick="moveRpcPriority('\${ep.url}', 'remove')">❌</button>
            \`;
          } else {
            priorityControls += \`<button class="btn btn-sm" style="padding:2px 6px; font-size:9px; background:rgba(0,180,216,0.1); color:var(--b);" onclick="moveRpcPriority('\${ep.url}', 'add')">➕ Priorizar</button>\`;
          }

          html += \`
            <div style="display:flex; flex-direction:column; gap:6px; background:var(--bg3); padding:8px 12px; border-radius:6px; border:1px solid \${isPriority ? 'var(--b)' : 'var(--bdr)'}; font-family:var(--mono); font-size:11px; margin-bottom:4px;">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex; align-items:center; gap:8px; overflow:hidden; flex:1;">
                  <div style="width:8px; height:8px; border-radius:50%; background:\${statusColor}; flex-shrink:0;" title="\${statusText}"></div>
                  <span style="color:var(--t); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="\${ep.url}">
                    \${isPriority ? \`<span style="color:var(--b); font-weight:bold; margin-right:4px;">#\${pIdx + 1}</span>\` : ''}
                    \${ep.url} 
                    \${isCustom ? '<span style="color:var(--b); font-size:9px; background:rgba(0,180,216,0.1); padding:1px 4px; border-radius:3px; margin-left:4px;">Personalizado</span>' : ''}
                  </span>
                </div>
                <div style="display:flex; align-items:center; gap:6px; font-size:10px; color:var(--t2); flex-shrink:0; margin-left:8px;">
                  <span>Éx: <strong style="color:var(--g)">\${ep.successes}</strong></span>
                  <span>Err: <strong style="color:var(--r)">\${ep.errors}</strong></span>
                  <span>Lat: <strong>\${ep.lastLatency}ms</strong></span>
                  <span style="padding:2px 6px; border-radius:4px; background:\${isBad ? 'rgba(239,68,68,0.1)' : 'rgba(0,229,160,0.1)'}; color:\${statusColor}; font-weight:600;">\${statusText}</span>
                  <button class="btn btn-sm" style="padding:2px 6px; font-size:9px; background:rgba(255,255,255,0.05); color:var(--t);" onclick="testSingleRpc('\${ep.url}')" title="Probar conexión">⚡</button>
                  \${isCustom ? \`<button class="btn btn-sm" style="padding:2px 6px; font-size:9px; background:rgba(239,68,68,0.1); color:var(--r);" onclick="removeCustomRpc('\${ep.url}')" title="Eliminar RPC">🗑️</button>\` : ''}
                </div>
              </div>
              <div style="display:flex; align-items:center; justify-content:space-between; padding-top:4px; border-top:1px dashed rgba(255,255,255,0.05);">
                <div style="display:flex; align-items:center; gap:8px;">
                  <span style="color:var(--t2); font-size:10px;">Función:</span>
                  <select onchange="updateRpcRole('\${ep.url}', this.value)" style="background:rgba(0,0,0,0.2); border:1px solid var(--bdr); color:var(--t); padding:2px 6px; border-radius:4px; font-size:10px; cursor:pointer; outline:none;">
                    <option value="all" \${epRole === 'all' ? 'selected' : ''}>Todas (Críticas y Secundarias)</option>
                    <option value="critical" \${epRole === 'critical' ? 'selected' : ''}>Solo Críticas (Swaps, Transfers)</option>
                    <option value="monitoring" \${epRole === 'monitoring' ? 'selected' : ''}>Solo Secundarias (Cotizaciones)</option>
                  </select>
                </div>
                <div style="display:flex; gap:4px;">
                  \${priorityControls}
                </div>
              </div>
            </div>
          \`;
        });
`;

code = code.replace(
/        sortedEndpoints\.forEach\(ep => \{[\s\S]*?            <\/div>\n          `;\n        \}\);/g,
endpointLoopReplacement
);

fs.writeFileSync('index.html', code);
