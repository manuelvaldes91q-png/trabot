const fs = require('fs');
const state = JSON.parse(fs.readFileSync('bot-state.json', 'utf8'));

let changed = false;
for (const w of state.watchItems) {
  if (w.symbol.toLowerCase() === 'cope') {
    w.orders = w.orders.filter(o => o.status !== 'error' && o.status !== 'paused' && o.status !== 'pending');
    
    const realTokens = 245409.20079;
    const realAmount = 4.5;
    const realPrice = realAmount / realTokens;

    for (const o of w.orders) {
      if (o.type === 'dca' || o.type === 'entry') {
        o.price = realPrice;
        o.filledPrice = realPrice;
      }
    }
    
    if (w.filledBuys && w.filledBuys.length > 0) {
      w.filledBuys[0].price = realPrice;
      w.filledBuys[0].tokens = realTokens;
    }

    if (w.orders.length > 0 && w.orders[0].type === 'dca') {
      w.orders[0].type = 'entry';
      w.orders[0].note = 'Compra Manual';
    }
    
    changed = true;
    console.log('Fixed cope position.');
  }
}

if (changed) {
  fs.writeFileSync('bot-state.json', JSON.stringify(state, null, 2));
  console.log('State updated.');
} else {
  console.log('No changes made.');
}
