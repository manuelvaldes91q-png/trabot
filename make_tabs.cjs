const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

function extractFunctionAndHtml(html, funcName) {
  const startIdx = html.indexOf(`async function ${funcName}() {`);
  if (startIdx === -1) return null;
  
  let braceCount = 0;
  let endIdx = -1;
  for (let i = startIdx + `async function ${funcName}() {`.length; i < html.length; i++) {
    if (html[i] === '{') braceCount++;
    if (html[i] === '}') {
      if (braceCount === 0) {
        endIdx = i + 1;
        break;
      }
      braceCount--;
    }
  }
  
  const funcBody = html.substring(startIdx, endIdx);
  const regex = /p\.innerHTML = `([\s\S]*?)`;/;
  const match = funcBody.match(regex);
  return { funcBody, htmlStr: match ? match[1] : '', startIdx, endIdx };
}

const poolData = extractFunctionAndHtml(html, 'openPoolModal');
const configData = extractFunctionAndHtml(html, 'openConfigModal');

// 1. Add the Tab Bar and the CSS/JS
const tabScript = `
<style>
  .tab-nav { display:flex; gap:10px; padding:10px 20px; background:var(--bg2); border-bottom:1px solid var(--bdr); flex-wrap:wrap; }
  .tab-btn { font-size:12px; padding:8px 16px; border:none; background:transparent; color:var(--t2); cursor:pointer; font-weight:600; border-bottom:2px solid transparent; }
  .tab-btn:hover { color:var(--t); }
  .tab-btn.active { color:var(--pu); border-bottom:2px solid var(--pu); }
</style>
<script>
function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(el => el.style.display = 'none');
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  const panel = document.getElementById('tab-' + tabId);
  if (panel) panel.style.display = 'block';
  const btn = document.getElementById('tabbtn-' + tabId);
  if (btn) btn.classList.add('active');
  localStorage.setItem('activeTab', tabId);
}
window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('activeTab') || 'dashboard';
  switchTab(saved);
});
</script>
<div class="tab-nav">
  <button id="tabbtn-dashboard" class="tab-btn active" onclick="switchTab('dashboard')">📊 Dashboard</button>
  <button id="tabbtn-pool" class="tab-btn" onclick="switchTab('pool')">🏦 Pool / Inversores</button>
  <button id="tabbtn-copilot" class="tab-btn" onclick="switchTab('copilot')">🤖 Copiloto</button>
  <button id="tabbtn-config" class="tab-btn" onclick="switchTab('config')">⚙️ Configuración</button>
  <button id="tabbtn-history" class="tab-btn" onclick="switchTab('history')">📜 Historial</button>
</div>
`;

html = html.replace('<!-- HEADER -->', tabScript + '\n<!-- HEADER -->');

// 2. Wrap .body in tab-dashboard
html = html.replace('<div class="body">', '<div class="tab-panel" id="tab-dashboard" style="display:block;">\n<div class="body">');
html = html.replace('</body>', '</div>\n</body>');

// 3. Split Config HTML into config and copilot
let configHtml = configData.htmlStr;
let configPart1 = configHtml.split('<!-- SECCIÓN COPILOTO AUTO-TRADING -->')[0];
let configPart2 = '<!-- SECCIÓN COPILOTO AUTO-TRADING -->' + configHtml.split('<!-- SECCIÓN COPILOTO AUTO-TRADING -->')[1];
let copilotHtml = configPart2.split('<!-- SECCIÓN TELEGRAM ALERTS -->')[0];
let configPart3 = '<!-- SECCIÓN TELEGRAM ALERTS -->' + configPart2.split('<!-- SECCIÓN TELEGRAM ALERTS -->')[1];

configHtml = configPart1 + configPart3;

// 4. Create the tabs
const tabsHtml = `
<div class="tab-panel" id="tab-pool" style="display:none; padding:20px;">
  ${poolData.htmlStr.replace('width:500px;max-width:95%;', 'width:100%;max-width:800px;margin:0 auto;').replace("document.getElementById('poolModalOverlay').remove()", "switchTab('dashboard')")}
</div>
<div class="tab-panel" id="tab-copilot" style="display:none; padding:20px;">
  <div style="background:var(--bg2);width:100%;max-width:800px;margin:0 auto;border:1px solid var(--bdr);border-radius:8px;padding:25px;font-family:var(--sans);">
    ${copilotHtml}
  </div>
</div>
<div class="tab-panel" id="tab-config" style="display:none; padding:20px;">
  <div style="background:var(--bg2);width:100%;max-width:800px;margin:0 auto;border:1px solid var(--bdr);border-radius:8px;padding:25px;font-family:var(--sans);">
    ${configHtml.replace("document.getElementById('configModalOverlay').remove()", "switchTab('dashboard')")}
  </div>
</div>
<div class="tab-panel" id="tab-history" style="display:none; padding:20px;">
  <div style="background:var(--bg2);width:100%;max-width:800px;margin:0 auto;border:1px solid var(--bdr);border-radius:8px;padding:25px;font-family:var(--sans);">
    <div style="font-weight:700;margin-bottom:15px;color:var(--t);font-size:16px;">📜 Historial de Trades</div>
    <div id="historyContent"></div>
    <div style="margin-top:30px;border-top:1px solid var(--bdr);padding-top:15px">
      <div style="font-weight:700;margin-bottom:15px;color:var(--t);font-size:16px;">🔍 Escáner Buscar Estafa</div>
      <div style="font-size:11px;color:var(--t2);margin-bottom:15px;">Busca en X (Twitter) posibles alertas de rug pull para un token.</div>
      <div style="display:flex;gap:10px;">
        <input type="text" id="manualScamSearch" class="inp" placeholder="Ej: Dirección del contrato o símbolo" style="flex:1">
        <button class="btn btn-y" onclick="if(document.getElementById('manualScamSearch').value) window.open('https://x.com/search?q=' + encodeURIComponent(document.getElementById('manualScamSearch').value + ' scam OR rug'), '_blank')">Buscar en X</button>
      </div>
    </div>
  </div>
</div>
`;

html = html.replace('</body>', tabsHtml + '\n</body>');

// 5. Replace the original JS functions
html = html.replace(poolData.funcBody, 'function openPoolModal() { switchTab("pool"); }');
html = html.replace(configData.funcBody, 'function openConfigModal() { switchTab("config"); }');

// Replace showTrades
const showTradesStartIdx = html.indexOf('function showTrades()');
let showTradesEndIdx = html.indexOf('}', showTradesStartIdx) + 1;
const historyJs = `
function showTrades() { switchTab("history"); renderHistoryTab(); }
function renderHistoryTab() {
  const c = document.getElementById('historyContent');
  if(!c) return;
  if(!SIM.trades || !SIM.trades.length) {
    c.innerHTML = '<div style="padding:20px;color:var(--t2)">Sin operaciones en el historial.</div>';
    return;
  }
  let h = '<div style="padding:20px;font-family:var(--mono);font-size:12px;">';
  SIM.trades.forEach((t, i) => {
    h += \`<div style="margin-bottom:4px">#\${i+1} \${t.symbol}: \${t.pnl>=0?'+':''}\$(\${(+t.pnl).toFixed(2)}) (\${t.pnlPct}%) · \${t.at?new Date(t.at).toLocaleString('es'):''}</div>\`;
  });
  h += '</div>';
  c.innerHTML = h;
}
`;
html = html.replace(html.substring(showTradesStartIdx, showTradesEndIdx), historyJs);

fs.writeFileSync('index.html', html);
console.log('Modified index.html');
