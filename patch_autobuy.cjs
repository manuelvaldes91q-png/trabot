const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const target = `        // Verifica si el precio bajó hasta el punto de entrada
        if (cp <= o.price * 1.005) {
          o.status = 'filled'; 
          o.filledAt = Date.now(); 
          o.filledPrice = cp;
          
          if (!w.filledBuys) w.filledBuys = [];
          w.filledBuys.push({ price: cp, amount: o.amount, level: o.level });
          
          addLog(\`⚡ [Solana Instant] Disparando swap compra para \${w.symbol} a $\${fpZ(cp,cp)}...\`, 'info');
          const realRes = await executeOrder(w, 'BUY', o.amount, cp);
          if (realRes && realRes.ok) {
            o.retryCount = 0;
            if (solMode !== 'wallet' && solMode !== 'pool') {
                SIM.balance -= o.amount;
                SIM.solBalance += o.amount / cp;
            }
            SIM.totalExec++;
          } else {
            o.retryCount = (o.retryCount || 0) + 1;
            o.filledAt = null;
            o.filledPrice = null;
            w.filledBuys.pop();
            if (o.retryCount >= 3) {
              o.status = 'paused';
              addLog(\`🚨 Swap real en Solana para \${w.symbol} falló 3 veces. Orden pausada automáticamente para evitar spam. Por favor, revisa tus fondos, RPC o configuración de red y reactívala.\`, 'warn');
            } else {
              o.status = 'pending';
              addLog(\`⚠️ Falló swap real en Solana para \${w.symbol} (Intento \${o.retryCount}/3). Reintentando en el próximo tick rápido.\`, 'warn');
            }
            continue; 
          }
        }`;

const replace = `        // Verifica si el precio bajó hasta el punto de entrada
        if (cp <= o.price * 1.005) {
          o.status = 'filled'; 
          o.filledAt = Date.now(); 
          
          addLog(\`⚡ [Solana Instant] Disparando swap compra para \${w.symbol} a $\${fpZ(cp,cp)}...\`, 'info');
          const realRes = await executeOrder(w, 'BUY', o.amount, cp);
          if (realRes && realRes.ok) {
            const realFillPrice = realRes.exactPrice || cp;
            o.filledPrice = realFillPrice;
            if (!w.filledBuys) w.filledBuys = [];
            w.filledBuys.push({ price: realFillPrice, amount: realRes.exactAmountUSDT || o.amount, level: o.level });

            o.retryCount = 0;
            if (solMode !== 'wallet' && solMode !== 'pool') {
                SIM.balance -= (realRes.exactAmountUSDT || o.amount);
                SIM.solBalance += (realRes.exactAmountUSDT || o.amount) / realFillPrice;
            }
            SIM.totalExec++;

            if (!w.slPrice) {
               w.slPrice = realFillPrice * (1 - (o.sl || 10)/100);
               w.tp1Price = realFillPrice * (1 + (o.tp1 || 8)/100);
               w.tp2Price = realFillPrice * (1 + (o.tp2 || 15)/100);
            }
            addLog(\`✅ AUTO-COMPRA SOLANA COMPLETADA: \${w.symbol} #\${o.level} · $\${realRes.exactAmountUSDT || o.amount} a $\${fpZ(realFillPrice, realFillPrice)}\`, 'buy');
          } else {
            o.retryCount = (o.retryCount || 0) + 1;
            o.filledAt = null;
            o.filledPrice = null;
            if (o.retryCount >= 3) {
              o.status = 'paused';
              addLog(\`🚨 Swap real en Solana para \${w.symbol} falló 3 veces. Orden pausada automáticamente para evitar spam. Por favor, revisa tus fondos, RPC o configuración de red y reactívala.\`, 'warn');
            } else {
              o.status = 'pending';
              addLog(\`⚠️ Falló swap real en Solana para \${w.symbol} (Intento \${o.retryCount}/3). Reintentando en el próximo tick rápido.\`, 'warn');
            }
            continue; 
          }
          break; // Stop processing more orders for this coin in this tick to allow state updates
        }`;

server = server.replace(target, replace);
fs.writeFileSync('server.js', server);
