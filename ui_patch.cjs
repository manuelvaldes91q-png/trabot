const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const uiReplacement = `
        html += \`
          <div style="background:rgba(0,180,216,0.05); border:1px solid rgba(0,180,216,0.2); border-radius:6px; padding:12px; margin-bottom:12px; font-size:11px;">
            <div style="font-weight:bold; color:var(--b); margin-bottom:6px;">🔹 Estado Actual de Enrutamiento (Failover Activo)</div>
            <div style="display:flex; flex-direction:column; gap:4px; color:var(--t);">
              <div><strong style="color:var(--g)">Nodo Crítico (Swaps, Transferencias):</strong> <span style="font-family:var(--mono);">\${data.activeCriticalRpc || 'Ninguno'}</span></div>
              <div><strong style="color:var(--y)">Nodo Secundario (Cotizaciones, Monitoreo):</strong> <span style="font-family:var(--mono);">\${data.activeNonCriticalRpc || 'Ninguno'}</span></div>
            </div>
            <div style="margin-top:8px; color:var(--t2); font-size:10px;">
              <i>Nota:</i> Si configuras una lista de prioridad, el sistema intentará usar el nodo #1 para <b>todo</b>. Si falla y entra a la lista negra (blacklist), saltará al #2, y así sucesivamente. También incluye automáticamente cualquier RPC agregado en tu archivo <code>.env</code>.
            </div>
          </div>
        \`;
`;

code = code.replace(/        html \+= `\n          <div style="background:rgba\(0,180,216,0\.05\); border:1px solid rgba\(0,180,216,0\.2\); border-radius:6px; padding:12px; margin-bottom:12px; font-size:11px;">\n            <div style="font-weight:bold; color:var\(--b\); margin-bottom:6px;">🔹 Estado Actual de Enrutamiento \(Failover Activo\)<\/div>\n            <div style="display:flex; flex-direction:column; gap:4px; color:var\(--t\);">\n              <div><strong style="color:var\(--g\)">Nodo Crítico \(Swaps, Transferencias\):<\/strong> <span style="font-family:var\(--mono\);">\$\{data\.activeCriticalRpc \|\| 'Ninguno'\}<\/span><\/div>\n              <div><strong style="color:var\(--y\)">Nodo Secundario \(Cotizaciones, Monitoreo\):<\/strong> <span style="font-family:var\(--mono\);">\$\{data\.activeNonCriticalRpc \|\| 'Ninguno'\}<\/span><\/div>\n            <\/div>\n            <div style="margin-top:8px; color:var\(--t2\); font-size:10px;">\n              <i>Nota:<\/i> Si configuras una lista de prioridad, el sistema intentará usar el nodo #1 para <b>todo<\/b>\. Si falla y entra a la lista negra \(blacklist\), saltará al #2, y así sucesivamente\.\n            <\/div>\n          <\/div>\n        `;/g, uiReplacement);

code = code.replace(
  'Agrega tus nodos RPC personalizados (ej. Alchemy, Quicknode, Helius) y establécelos como prioritarios en el orden deseado. Los nodos de la lista de prioridad se usarán secuencialmente; el resto actuará como failover en rotación.',
  'Agrega tus nodos RPC personalizados (incluidos los de tu archivo <b>.env</b>, ej. Alchemy, Quicknode) y establécelos como prioritarios en el orden deseado. Los nodos de la lista de prioridad se usarán secuencialmente; el resto actuará como failover en rotación.'
);

fs.writeFileSync('index.html', code);
