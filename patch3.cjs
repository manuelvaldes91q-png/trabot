const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const replacement = `
async function moveRpcPriority(url, direction) {
  try {
    const res = await myFetch('/api/solana/rpc-status');
    const data = await res.json();
    let list = data.rpcPriorityList || [];
    
    if (direction === 'add') {
      if (!list.includes(url)) list.push(url);
    } else if (direction === 'remove') {
      list = list.filter(u => u !== url);
    } else {
      const idx = list.indexOf(url);
      if (idx === -1) return;
      if (direction === 'up' && idx > 0) {
        [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
      } else if (direction === 'down' && idx < list.length - 1) {
        [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
      }
    }
    
    await myFetch('/api/solana/update-rpc-priority', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ list })
    });
    
    loadRpcStatus();
  } catch (e) {
    alert('Error actualizando prioridad: ' + e.message);
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
        
        // Sort endpoints: those in priority list first (by their order), then others
        let sortedEndpoints = [...data.endpoints];
        sortedEndpoints.sort((a, b) => {
          const idxA = priorityList.indexOf(a.url);
          const idxB = priorityList.indexOf(b.url);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return 0;
        });

        sortedEndpoints.forEach(ep => {
          const isBad = ep.blacklisted;
          const statusColor = isBad ? 'var(--r)' : (ep.status === 'healthy' ? 'var(--g)' : 'var(--y)');
          const statusText = isBad ? \`Excluido (\${Math.ceil(ep.blacklistRemainingMs / 1000)}s)\` : 'Saludable';
          const isCustom = ep.isCustom;
          
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
            <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg3); padding:8px 12px; border-radius:6px; border:1px solid \${isPriority ? 'var(--b)' : 'var(--bdr)'}; font-family:var(--mono); font-size:11px; margin-bottom:4px;">
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
                <button class="btn btn-sm" style="padding:2px 6px; font-size:9px; background:rgba(255,255,255,0.05); color:var(--t);" onclick="testSingleRpc('\${ep.url}')" title="Probar conexión">⚡ Probar</button>
                \${priorityControls}
                \${isCustom ? \`<button class="btn btn-sm" style="padding:2px 6px; font-size:9px; background:rgba(239,68,68,0.1); color:var(--r);" onclick="removeCustomRpc('\${ep.url}')" title="Eliminar RPC">🗑️</button>\` : ''}
              </div>
            </div>
          \`;
        });
        container.innerHTML = html;
      } else {
        container.innerHTML = '<div style="color:var(--t2); font-size:11px; padding:10px; text-align:center;">No hay endpoints RPC configurados.</div>';
      }
    } else {
      container.innerHTML = '<div style="color:var(--r); font-size:11px; padding:10px; text-align:center;">Error al cargar estado de RPCs. (Requiere sesión de administrador iniciada)</div>';
    }
  } catch (e) {
    container.innerHTML = \`<div style="color:var(--r); font-size:11px; padding:10px; text-align:center;">Error de red: \${e.message}</div>\`;
  }
}
`;

code = code.replace(/async function loadRpcStatus\(\) \{[\s\S]*?container\.innerHTML = `<div style="color:var\(--r\); font-size:11px; padding:10px; text-align:center;">Error de red: \$\{e\.message\}<\/div>`;\n  \}\n\}/, replacement);

fs.writeFileSync('index.html', code);
