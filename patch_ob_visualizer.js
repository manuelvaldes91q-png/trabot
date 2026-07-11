import fs from 'fs';
let code = fs.readFileSync('index.html', 'utf8');

const oldLogic = `// Asks (descending so cheapest is at bottom of asks)
             const asks = obData.asks.slice(0, 10).reverse();
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
             });`;

const newLogic = `
             let maxQty = 0;
             const asks = obData.asks.slice(0, 12).reverse();
             const bids = obData.bids.slice(0, 12);
             asks.forEach(ask => {
                 let qty = obData.isQuote ? (ask.quantity * ask.price) : ask.quantity;
                 if(qty > maxQty) maxQty = qty;
             });
             bids.forEach(bid => {
                 let qty = obData.isQuote ? (bid.quantity * bid.price) : bid.quantity;
                 if(qty > maxQty) maxQty = qty;
             });

             html += '<div style="position:relative; width:100%; display:flex; flex-direction:column; gap:1px; margin-top: 4px;">';
             asks.forEach(ask => {
                 let price = obData.isQuote ? (1 / ask.price) : ask.price;
                 let qty = obData.isQuote ? (ask.quantity * ask.price) : ask.quantity;
                 let pct = maxQty > 0 ? (qty / maxQty) * 100 : 0;
                 html += \`<div style="display:flex;justify-content:space-between;color:var(--r);padding:2px 4px;position:relative; font-size:10px;">
                     <div style="position:absolute;left:0;top:0;bottom:0;background:rgba(239,68,68,0.2);width:\${pct}%;z-index:0;border-radius:0 2px 2px 0;"></div>
                     <span style="z-index:1">\${price.toFixed(4)}</span><span style="z-index:1">\${qty.toFixed(2)}</span>
                 </div>\`;
             });
             
             html += \`<div style="text-align:center;font-size:11px;color:var(--t);margin:6px 0;font-weight:bold">$ \${fpZ(cp, cp)}</div>\`;
             
             bids.forEach(bid => {
                 let price = obData.isQuote ? (1 / bid.price) : bid.price;
                 let qty = obData.isQuote ? (bid.quantity * bid.price) : bid.quantity;
                 let pct = maxQty > 0 ? (qty / maxQty) * 100 : 0;
                 html += \`<div style="display:flex;justify-content:space-between;color:var(--g);padding:2px 4px;position:relative; font-size:10px;">
                     <div style="position:absolute;left:0;top:0;bottom:0;background:rgba(16,185,129,0.2);width:\${pct}%;z-index:0;border-radius:0 2px 2px 0;"></div>
                     <span style="z-index:1">\${price.toFixed(4)}</span><span style="z-index:1">\${qty.toFixed(2)}</span>
                 </div>\`;
             });
             html += '</div>';
`;

// wait, the oldLogic might have different spacing since the previous patch changed `asks.slice(-10)` to `asks.slice(0, 10)`.

const dynamicRegex = /\/\/ Asks \(descending so cheapest is at bottom of asks\)[\s\S]*?\/\/ Bids \(highest first\)[\s\S]*?html \+\= \`<div style="display:flex;justify-content:space-between;color:var\(--g\);margin-bottom:2px"><span>\$\{price\.toFixed\(4\)\}<\/span><span>\$\{qty\.toFixed\(2\)\}<\/span><\/div>\`;\s*\}\);/g;

if (dynamicRegex.test(code)) {
    code = code.replace(dynamicRegex, newLogic);
    fs.writeFileSync('index.html', code);
    console.log("Patched index.html with bar chart visualizer");
} else {
    console.log("Regex match failed, trying alternative.");
}
