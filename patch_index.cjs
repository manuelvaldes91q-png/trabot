const fs = require('fs');
const content = fs.readFileSync('index.html', 'utf8');

const auditFunction = `
async function loadAuditData(mint) {
  const el = document.getElementById('auditPanel');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--t2);font-size:10px;margin-top:10px;">Obteniendo información del contrato (Auditoría)...</div>';
  
  try {
    const pwd = getAppPwd();
    const res = await fetch('/api/token/audit/' + mint, {
      headers: { 'authorization': pwd }
    });
    const data = await res.json();
    if (!data.available) {
      el.innerHTML = '<div style="color:var(--r);font-size:10px;margin-top:10px;">⚠️ Error de auditoría: ' + (data.error || 'No disponible') + '</div>';
      return;
    }
    
    // UI GMGN-style
    const makeVal = (val, ok) => {
      let color = "var(--t)";
      if (ok === true) color = "var(--g)";
      if (ok === false) color = "var(--r)";
      return \`<span style="color:\${color};font-weight:700;">\${val}</span>\`;
    };
    
    const rugOk = parseFloat(data.rugProb) < 20;
    const isQuemado = data.lpBurned > 80;
    
    el.innerHTML = \`
      <div style="background:#111; border:1px solid #333; border-radius:6px; padding:12px; margin-top:10px; font-family:var(--sans);">
        <div style="font-weight:600; color:#eee; font-size:12px; margin-bottom:10px; display:flex; align-items:center; gap:5px;">
          🛡️ Auditoría del Contrato (RugCheck)
        </div>
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; font-size:10px;">
          <div>
            <div style="color:var(--t2);margin-bottom:2px">Top 10</div>
            <div>\${makeVal(data.top10.toFixed(2) + '%', data.top10 < 30)}</div>
          </div>
          <div>
            <div style="color:var(--t2);margin-bottom:2px">DEV</div>
            <div>\${makeVal(data.dev.toFixed(2) + '%', data.dev < 10)}</div>
          </div>
          <div>
            <div style="color:var(--t2);margin-bottom:2px">Holders</div>
            <div style="font-weight:700;color:var(--t)">\${data.holders}</div>
          </div>
          <div>
            <div style="color:var(--t2);margin-bottom:2px">Insiders</div>
            <div>\${makeVal(data.insiders, data.insiders === '0%')}</div>
          </div>
          
          <div>
            <div style="color:var(--t2);margin-bottom:2px">Phishing</div>
            <div>\${makeVal(data.phishing, data.phishing === '0%')}</div>
          </div>
          <div>
            <div style="color:var(--t2);margin-bottom:2px">Bundler</div>
            <div>\${makeVal(data.bundler, data.bundler === '0%')}</div>
          </div>
          <div>
            <div style="color:var(--t2);margin-bottom:2px">Dex Paid</div>
            <div style="font-weight:700;color:var(--t)">\${data.dexPaid}</div>
          </div>
          <div>
            <div style="color:var(--t2);margin-bottom:2px">No Mint</div>
            <div>\${makeVal(data.noMint ? '✅ Sí' : '❌ No', data.noMint)}</div>
          </div>
          
          <div>
            <div style="color:var(--t2);margin-bottom:2px">No Blacklist</div>
            <div>\${makeVal(data.noBlacklist ? '✅ Sí' : '❌ No', data.noBlacklist)}</div>
          </div>
          <div>
            <div style="color:var(--t2);margin-bottom:2px">Quemado</div>
            <div>\${makeVal(data.lpBurned.toFixed(0) + '% 🔥', isQuemado)}</div>
          </div>
          <div style="grid-column: span 2;">
            <div style="color:var(--t2);margin-bottom:2px">Probabilidad de Rug</div>
            <div>\${makeVal(data.rugProb, rugOk)}</div>
          </div>
        </div>
      </div>
    \`;
  } catch (e) {
    el.innerHTML = '<div style="color:var(--r);font-size:10px;margin-top:10px;">⚠️ Error: ' + e.message + '</div>';
  }
}
`;

const updated1 = content.replace("function renderAP(d,an,cp){", auditFunction + '\n' + "function renderAP(d,an,cp){");

const target2 = `<div id="apanel"></div>`;
const updated2 = updated1.replace(target2, target2 + `\n        <div id="auditPanel"></div>`);

const target3 = `  if (!isSol) loadChart('h1');`;
const updated3 = updated2.replace(target3, `  if (!isSol) loadChart('h1');\n  if (isSol) loadAuditData(d.address);`);

fs.writeFileSync('index.html', updated3);
console.log("Success");
