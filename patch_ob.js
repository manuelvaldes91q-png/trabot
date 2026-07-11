import fs from 'fs';

let code = fs.readFileSync('index.html', 'utf8');

const newOBLogic = `
    const obDiv = document.getElementById('obDiv');
    if (obDiv) {
      obDiv.innerHTML = '<div style="color:var(--t2);font-size:8px;font-family:var(--mono)">Cargando Order Book de Phoenix...</div>';
      try {
         const obRes = await fetch(\`/api/orderbook/\${d.address}\`, { headers: { 'Authorization': \`Bearer \${document.getElementById('pwd').value}\`} });
         const obData = await obRes.json();
         if (obData.available) {
             let html = '<div style="padding:10px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.1);border-radius:4px;font-family:var(--mono);font-size:9px">';
             html += '<div style="color:#fcd34d;font-weight:700;margin-bottom:6px;display:flex;justify-content:space-between"><span>🔥 PHOENIX CLOB</span><span style="font-size:8px;color:var(--t2)">On-Chain Orderbook</span></div>';
             html += '<div style="display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px;margin-bottom:4px;color:var(--t2)"><span>Precio (USDC)</span><span>Cantidad</span></div>';
             
             // Asks (descending so cheapest is at bottom of asks)
             const asks = obData.asks.slice(-10).reverse();
             asks.forEach(ask => {
                 let price = obData.isQuote ? (1 / ask.price) : ask.price;
                 let qty = obData.isQuote ? (ask.quantity * ask.price) : ask.quantity;
                 html += \`<div style="display:flex;justify-content:space-between;color:var(--r);margin-bottom:2px"><span>\${price.toFixed(4)}</span><span>\${qty.toFixed(2)}</span></div>\`;
             });
             
             html += \`<div style="text-align:center;font-size:10px;color:var(--t);margin:6px 0;font-weight:bold">$ \${fpZ(cp, cp)}</div>\`;
             
             // Bids (highest first)
             const bids = obData.bids.slice(0, 10);
             bids.forEach(bid => {
                 let price = obData.isQuote ? (1 / bid.price) : bid.price;
                 let qty = obData.isQuote ? (bid.quantity * bid.price) : bid.quantity;
                 html += \`<div style="display:flex;justify-content:space-between;color:var(--g);margin-bottom:2px"><span>\${price.toFixed(4)}</span><span>\${qty.toFixed(2)}</span></div>\`;
             });
             html += '</div>';
             obDiv.innerHTML = html;
         } else {
             // Fallback to AMM view
             obDiv.innerHTML = \`
               <div style="padding:10px;background:rgba(153,69,255,0.03);border:1px solid rgba(153,69,255,0.15);border-radius:4px;font-family:var(--mono);font-size:9px">
                 <div style="color:#a855f7;font-weight:700;margin-bottom:6px">🟣 AMM LIQUIDITY POOL</div>
                 <div style="margin-bottom:4px;color:var(--t2)">Dirección Token:</div>
                 <div style="font-size:8px;word-break:break-all;color:var(--t);margin-bottom:8px">\${d.address}</div>
                 <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                   <span style="color:var(--t2)">Liquidez (USD):</span>
                   <span style="color:var(--g);font-weight:700">\${d.liq ? fv(d.liq) : 'N/A'}</span>
                 </div>
                 <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                   <span style="color:var(--t2)">Volumen 24h:</span>
                   <span style="color:var(--b);font-weight:700">\${fv(d.vol)}</span>
                 </div>
                 <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                   <span style="color:var(--t2)">Red / DEX:</span>
                   <span style="color:var(--y)">Solana / Jupiter</span>
                 </div>
             \`;
         }
      } catch (e) {
          obDiv.innerHTML = '<div style="color:var(--r);font-size:8px;">Error cargando Order Book</div>';
      }
    }
`;

// wait, the original has `const obDiv = document.getElementById('obDiv'); if(obDiv) { obDiv.innerHTML = ... }`
// let's replace everything from `const obDiv = document.getElementById('obDiv');` up to `const simulatedOBAnalysis = {`

const regex = /const obDiv = document\.getElementById\('obDiv'\);\s*if \(obDiv\) \{[\s\S]*?\}\s*const simulatedOBAnalysis = \{/;

if (regex.test(code)) {
    code = code.replace(regex, newOBLogic + '\n    const simulatedOBAnalysis = {');
    fs.writeFileSync('index.html', code);
    console.log("Patched index.html with new OB logic");
} else {
    console.log("Could not match regex for index.html");
}

