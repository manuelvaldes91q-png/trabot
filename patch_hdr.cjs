const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const replacement = `
  <span id="phantomWallet" style="display:none;font-family:var(--mono);font-size:8px;background:rgba(153,69,255,0.12);padding:4px 8px;border-radius:4px;border:1px solid rgba(153,69,255,0.3);color:#a855f7;align-items:center;gap:4px;margin-left:8px">
    🟣 <span id="phantomAddress">No conectada</span>
  </span>

  <span id="activeRpcIndicator" style="display:flex; font-family:var(--mono);font-size:8px;background:rgba(0,180,216,0.1);padding:4px 8px;border-radius:4px;border:1px solid rgba(0,180,216,0.3);color:var(--b);align-items:center;gap:6px;margin-left:8px;flex-direction:column;align-items:flex-start;">
    <span style="font-size:7px;color:var(--t2)">📡 ENRUTAMIENTO RPC</span>
    <span style="display:flex;gap:8px;">
      <span title="Crítico (Swaps/Transfers)">⚡ <span id="hdrCriticalRpc">--</span></span>
      <span title="Secundario (Cotizaciones)">👁️ <span id="hdrMonitorRpc">--</span></span>
    </span>
  </span>
`;

code = code.replace(
  /<span id="phantomWallet"[\s\S]*?<\/span>/,
  replacement
);

fs.writeFileSync('index.html', code);
