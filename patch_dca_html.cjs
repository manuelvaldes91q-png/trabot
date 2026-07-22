const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const target = "action: 'quickMarketBuy',";
const rep = "action: 'dcaMarketBuy',";

// We only want to replace the second one, which is in addOrderToWatch.
// The first one is in quickMarketBuy() function.
// Let's replace only inside submitAddOrder

const fnStart = html.indexOf("window.submitAddOrder = function(wi) {");
if (fnStart !== -1) {
   const before = html.substring(0, fnStart);
   const after = html.substring(fnStart).replace("action: 'quickMarketBuy',", "action: 'dcaMarketBuy',");
   html = before + after;
   fs.writeFileSync('index.html', html);
   console.log('Patched html');
}
