const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const target2 = `        // Verifica si el precio bajó hasta el punto de entrada
        if (cp <= o.price * 1.005) {
          o.status = 'filled'; 
          o.filledAt = Date.now(); 
          o.filledPrice = cp;
          
          if (!w.filledBuys) w.filledBuys = [];
          w.filledBuys.push({ price: cp, amount: o.amount, level: o.level });
          
          addLog(\`⚡ [Solana Instant] Disparando swap compra para \${w.symbol} a $\${fpZ(cp,cp)}...\`, 'info');
          const realRes = await executeOrder(w, 'BUY', o.amount, cp);
          if (realRes && realRes.ok) {
            if (solMode !== 'wallet' && solMode !== 'pool') {
                SIM.balance -= o.amount;
                SIM.solBalance += (o.amount / cp);
            }
            SIM.totalExec++;
            addLog(\`✅ COMPRA SOLANA COMPLETADA: \${w.symbol} (Nivel \${o.level}) a $\${fpZ(cp,cp)}\`, 'buy');
          } else {
            o.status = 'pending';
            o.filledAt = null;
            o.filledPrice = null;
            w.filledBuys.pop();
            addLog(\`⚠️ Falló la orden real en Solana. Volviendo a pendiente.\`, 'warn');
          }
        }`;

const replacement2 = `        // Verifica si el precio bajó hasta el punto de entrada
        if (cp <= o.price * 1.005) {
          addLog(\`⚡ [Solana Instant] Disparando swap compra para \${w.symbol} a $\${fpZ(cp,cp)}...\`, 'info');
          const realRes = await executeOrder(w, 'BUY', o.amount, cp);
          if (realRes && realRes.ok) {
            const finalPrice = realRes.exactPrice || cp;
            w.currentPrice = finalPrice;
            o.status = 'filled'; 
            o.filledAt = Date.now(); 
            o.filledPrice = finalPrice;
            const executedAmount = realRes.exactAmountUSDT || o.amount;
            
            if (!w.filledBuys) w.filledBuys = [];
            w.filledBuys.push({ price: finalPrice, amount: executedAmount, level: o.level });
            
            if (solMode !== 'wallet' && solMode !== 'pool') {
                SIM.balance -= executedAmount;
                SIM.solBalance += (executedAmount / finalPrice);
            }
            SIM.totalExec++;
            addLog(\`✅ COMPRA SOLANA COMPLETADA: \${w.symbol} (Nivel \${o.level}) a $\${fpZ(finalPrice,finalPrice)}\`, 'buy');
          } else {
             addLog(\`⚠️ Falló la orden real en Solana.\`, 'warn');
          }
        }`;

server = server.replace(target2, replacement2);
fs.writeFileSync('server.js', server);
