const fs = require('fs');

try {
  const stateStr = fs.readFileSync('bot-state.json', 'utf8');
  const state = JSON.parse(stateStr);
  let changed = false;

  for (const w of state.watchItems) {
    if (w.symbol.toLowerCase() === 'cope') {
      console.log('Encontrada posición cope. Filtrando órdenes...');
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
        w.orders[0].note = 'Compra Manual (Fijada)';
      }
      
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync('bot-state.json', JSON.stringify(state, null, 2));
    console.log('¡Estado de cope arreglado en bot-state.json! Ahora reinicia el bot con: pm2 restart all');
  } else {
    console.log('No se encontró la moneda cope en estado abierto, o no hubieron cambios.');
  }
} catch (e) {
  console.log('Error leyendo bot-state.json:', e.message);
}
