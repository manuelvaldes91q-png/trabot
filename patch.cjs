const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const replacement = `<!-- ══ COL 3: DETALLE + DASH ══ -->
<div class="col-right" style="display:flex; flex-direction:column; height: 100%; overflow: hidden;">
  <!-- MAIN TABS -->
  <div style="display:flex;gap:6px;margin-bottom:10px;border-bottom:1px solid var(--bdr);padding-bottom:10px;flex-shrink:0;">
    <button class="net-tab active" id="tabDetail" onclick="switchMainTab('detail')">📊 Análisis</button>
    <button class="net-tab" id="tabDashboard" onclick="switchMainTab('dashboard')">💰 Dashboard</button>
    <button class="net-tab" id="tabOrders" onclick="switchMainTab('orders')">👁 Gestión de Órdenes</button>
    <button class="net-tab" id="tabLogs" onclick="switchMainTab('logs')">🤖 Logs</button>
  </div>

  <div id="view-detail" style="display:block; flex:1; overflow-y:auto; padding-right:10px;">
    <!-- CHART DETAIL -->
    <div class="det" id="det">
      <div class="det-hdr" id="detHdr">
        <span style="font-family:var(--mono);font-size:9px;color:var(--t2)">Haz click en resultado o moneda vigilada para analizar</span>
      </div>
      <div id="detContent">
        <div class="empty" style="height:230px"><div style="font-size:26px">📊</div><div>Selecciona una moneda</div></div>
      </div>
    </div>
  </div>

  <div id="view-dashboard" style="display:none; flex:1; overflow-y:auto; padding-right:10px;">
    <!-- DASH -->
    <div class="dash" style="margin-bottom:15px;">
      <div class="dc" id="dc0"><div class="dc-l">💰 Balance</div><div class="dc-v" id="dBal" style="color:var(--b)">$100</div><div class="dc-s" id="dBalS">disponible</div></div>
      <div class="dc" id="dc1"><div class="dc-l">📈 P&L</div><div class="dc-v" id="dPnL">$0.00</div><div class="dc-s" id="dPnLS">+0.00%</div></div>
      <div class="dc"><div class="dc-l">✅ Wins</div><div class="dc-v" id="dWins" style="color:var(--g)">0</div><div class="dc-s" id="dAvgW">avg +0%</div></div>
      <div class="dc"><div class="dc-l">❌ Losses</div><div class="dc-v" id="dLoss" style="color:var(--r)">0</div><div class="dc-s" id="dAvgL">avg 0%</div></div>
      <div class="dc"><div class="dc-l">⚡ Ejecutadas</div><div class="dc-v" id="dExec" style="color:var(--y)">0</div><div class="dc-s">órdenes auto</div></div>
      <button class="btn btn-d" style="font-size:10px;padding:4px 8px;margin:auto" onclick="resetSim()">♻️ Reset</button>
    </div>
    
    <!-- ALERTAS -->
    <div class="alert-area" id="alertArea"></div>
  </div>

  <div id="view-orders" style="display:none; flex:1; overflow-y:auto; padding-right:10px; flex-direction:column;">
    <!-- Monitor status -->
    <div class="mon-bar">
      <div class="mb-row">
        <div>
          <div style="font-size:7px;color:var(--t2);font-family:var(--mono)">PRÓXIMO CICLO</div>
          <div class="countdown" id="countdown">—</div>
        </div>
        <div style="flex:1;padding-left:5px">
          <div class="mb-stat">Ciclo: <span class="mb-val" id="dCycle">0</span> · Vigiladas: <span class="mb-val" id="watchN">0</span></div>
          <div class="mb-stat">Ejecutadas: <span class="mb-val" id="execN" style="color:var(--g)">0</span> · Intervalo:
            <select id="cfInterval" class="inp" style="display:inline;width:auto;padding:1px 4px;font-size:8px" onchange="myFetch('/api/action', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'updateInterval', payload: {interval: +this.value}})})">
              <option value="1">1s⚡⚡</option><option value="2">2s⚡⚡</option><option value="3">3s⚡</option>
              <option value="5">5s⚡</option><option value="10">10s</option><option value="15" selected>15s</option>
              <option value="30">30s</option><option value="60">60s</option>
            </select>
          </div>
        </div>
      </div>
    </div>
    <div class="sec-hdr">
      👁 Vigilancia activa
      <div style="display:flex;gap:3px">
        <button class="btn btn-d btn-xs" onclick="clearDone()">Limpiar cerradas</button>
        <button class="btn btn-r btn-xs" onclick="clearAll()">Limpiar todo</button>
      </div>
    </div>
    <div class="wlist" id="wlist" style="flex:1;">
      <div class="empty"><div style="font-size:22px">👁</div><div>Sin monedas vigiladas</div><div style="font-size:8px;color:var(--t3)">Click en resultado → configurar → Agregar</div></div>
    </div>
  </div>

  <div id="view-logs" style="display:none; flex:1; overflow-y:auto; padding-right:10px; flex-direction:column; gap:10px;">
    <!-- LOG -->
    <div class="logbox">
      <div class="log-hdr">🤖 Log del Bot
        <div style="display:flex;gap:6px;align-items:center">
          <label style="font-size:7px;cursor:pointer"><input type="checkbox" id="logFilter" onchange="renderLog()"> Solo compras/ventas</label>
          <span style="cursor:pointer" onclick="clearLog()">limpiar</span>
        </div>
      </div>
      <div class="log-body" id="logbody" style="max-height: 300px;"></div>
    </div>
    
    <!-- SOLANA SWAP LOGS -->
    <div class="logbox">
      <div class="log-hdr">🚀 Swaps Solana
        <span style="cursor:pointer" onclick="renderSolanaLogs()">refresh</span>
      </div>
      <div class="log-body" id="solanaLogBody" style="max-height: 300px;"></div>
    </div>
  </div>
</div>
</div>
</div>

<!-- FLASH -->
<div class="flash" id="flash">
  <div class="fttl" id="fttl">—</div>
  <div class="fsub" id="fsub">—</div>
  <button class="btn btn-d btn-xs" style="margin-top:5px" onclick="document.getElementById('flash').style.display='none'">✕</button>
</div>

<script>
function switchMainTab(tab) {
  document.getElementById('view-detail').style.display = tab === 'detail' ? 'block' : 'none';
  document.getElementById('view-dashboard').style.display = tab === 'dashboard' ? 'block' : 'none';
  document.getElementById('view-orders').style.display = tab === 'orders' ? 'flex' : 'none';
  document.getElementById('view-logs').style.display = tab === 'logs' ? 'flex' : 'none';

  document.getElementById('tabDetail').className = tab === 'detail' ? 'net-tab active' : 'net-tab';
  document.getElementById('tabDashboard').className = tab === 'dashboard' ? 'net-tab active' : 'net-tab';
  document.getElementById('tabOrders').className = tab === 'orders' ? 'net-tab active' : 'net-tab';
  document.getElementById('tabLogs').className = tab === 'logs' ? 'net-tab active' : 'net-tab';
}`;

const startIndex = html.indexOf('<!-- ══ COL 2: WATCHLIST ══ -->');
const endIndex = html.indexOf('}// ══════════════════════════════════════════════════════════') + 1;

if(startIndex > -1 && endIndex > -1) {
  const newHtml = html.substring(0, startIndex) + replacement + html.substring(endIndex);
  fs.writeFileSync('index.html', newHtml);
  console.log('Successfully patched index.html');
} else {
  console.log('Could not find start or end index', startIndex, endIndex);
}
