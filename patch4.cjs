const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const target = `      addLog(\`⚡ [Compra Mercado Rápida] Disparando swap compra para \${w.symbol} de $\${amount}...\`, 'info');
      const realRes = await executeOrder(w, 'BUY', amount, cp);
      if (realRes && realRes.ok) {
        const order = {
          level: w.orders.length + 1,
          price: cp,
          amount: amount,
          sl, tp1, tp2,
          note: 'Compra de Mercado Rápida',
          status: 'filled',
          type: 'dca',
          filledAt: Date.now(),
          filledPrice: cp
        };`;

const replacement = `      addLog(\`⚡ [Compra Mercado Rápida] Disparando swap compra para \${w.symbol} de $\${amount}...\`, 'info');
      const realRes = await executeOrder(w, 'BUY', amount, cp);
      if (realRes && realRes.ok) {
        const finalPrice = realRes.exactPrice || cp;
        w.currentPrice = finalPrice;
        
        const order = {
          level: w.orders.length + 1,
          price: finalPrice,
          amount: realRes.exactAmountUSDT || amount,
          sl, tp1, tp2,
          note: 'Compra de Mercado Rápida',
          status: 'filled',
          type: 'dca',
          filledAt: Date.now(),
          filledPrice: finalPrice
        };`;

server = server.replace(target, replacement);
fs.writeFileSync('server.js', server);
