const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const replacement = `
        let html = '';
        const priorityList = data.rpcPriorityList || [];
        
        html += \`
          <div style="background:rgba(0,180,216,0.05); border:1px solid rgba(0,180,216,0.2); border-radius:6px; padding:12px; margin-bottom:12px; font-size:11px;">
            <div style="font-weight:bold; color:var(--b); margin-bottom:6px;">🔹 Estado Actual de Enrutamiento (Failover Activo)</div>
            <div style="display:flex; flex-direction:column; gap:4px; color:var(--t);">
              <div><strong style="color:var(--g)">Nodo Crítico (Swaps, Transferencias):</strong> <span style="font-family:var(--mono);">\${data.activeCriticalRpc || 'Ninguno'}</span></div>
              <div><strong style="color:var(--y)">Nodo Secundario (Cotizaciones, Monitoreo):</strong> <span style="font-family:var(--mono);">\${data.activeNonCriticalRpc || 'Ninguno'}</span></div>
            </div>
            <div style="margin-top:8px; color:var(--t2); font-size:10px;">
              <i>Nota:</i> Si configuras una lista de prioridad, el sistema intentará usar el nodo #1 para <b>todo</b>. Si falla y entra a la lista negra (blacklist), saltará al #2, y así sucesivamente.
            </div>
          </div>
        \`;

        // Sort endpoints: those in priority list first (by their order), then others
`;

code = code.replace(/        let html = '';\n        const priorityList = data\.rpcPriorityList \|\| \[\];/g, replacement);

fs.writeFileSync('index.html', code);
