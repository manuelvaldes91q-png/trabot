const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const target = `  if (!amount || +amount <= 0) return;
  
  myFetch('/api/action', {
    method: 'POST', 
    headers: {'Content-Type': 'application/json'}, 
    body: JSON.stringify({
      action: 'quickMarketBuy', 
      payload: { 
        symbol: curDet.symbol, 
        network: curDet.network, 
        address: curDet.address, 
        pair: curDet.pair, 
        amount: +amount 
      }
    })
  }).then(r => r.json()).then(d => {`;

const replacement = `  if (!amount || +amount <= 0) return;
  
  const slStr = prompt('Stop Loss (%)', '10');
  if (slStr === null) return;
  const sl = +slStr;
  
  const tp1Str = prompt('Take Profit 1 (%)', '8');
  if (tp1Str === null) return;
  const tp1 = +tp1Str;
  
  const tp2Str = prompt('Take Profit 2 (%)', '15');
  if (tp2Str === null) return;
  const tp2 = +tp2Str;
  
  myFetch('/api/action', {
    method: 'POST', 
    headers: {'Content-Type': 'application/json'}, 
    body: JSON.stringify({
      action: 'quickMarketBuy', 
      payload: { 
        symbol: curDet.symbol, 
        network: curDet.network, 
        address: curDet.address, 
        pair: curDet.pair, 
        amount: +amount,
        sl: sl,
        tp1: tp1,
        tp2: tp2
      }
    })
  }).then(r => r.json()).then(d => {`;

html = html.replace(target, replacement);
fs.writeFileSync('index.html', html);
