const fs = require('fs');
const state = JSON.parse(fs.readFileSync('state.json', 'utf8'));

let changed = false;
for (const w of state.watchItems) {
  if (w.symbol.toLowerCase() === 'cope') {
    // Remove paused/error orders
    w.orders = w.orders.filter(o => o.status !== 'error' && o.status !== 'paused' && o.status !== 'pending');
    
    // Fix the DCA order and filled buys
    // 4.5 USDC -> 245,409.20079 cope
    // Price = 4.5 / 245409.20079 = 0.00001833672
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

    // Since it's the only order, change its type to entry
    if (w.orders.length > 0 && w.orders[0].type === 'dca') {
      w.orders[0].type = 'entry';
    }
    
    changed = true;
    console.log('Fixed cope position.');
  }
}

if (changed) {
  fs.writeFileSync('state.json', JSON.stringify(state, null, 2));
  console.log('State updated.');
} else {
  console.log('No changes made.');
}
