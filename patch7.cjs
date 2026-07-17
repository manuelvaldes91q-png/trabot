const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const target1 = `        // Verifica si el precio bajó hasta el punto de entrada
        if (cp <= o.price * 1.005) {
          o.status = 'filled'; 
          o.filledAt = Date.now(); 
          o.filledPrice = cp;
          
          if (!w.filledBuys) w.filledBuys = [];
          w.filledBuys.push({ price: cp, amount: o.amount, level: o.level });
          const realRes = await executeOrder(w, 'BUY', o.amount, cp);
          if (realRes && realRes.ok) {
            if (mode !== 'real') {
              SIM.balance -= o.amount;
            }
            SIM.totalExec++;
            addLog(\`✅ COMPRA COMPLETADA: \${w.symbol} (Nivel \${o.level}) a $\${fpZ(cp,cp)}\`, 'buy');
          } else {
            o.status = 'pending';
            o.filledAt = null;
            o.filledPrice = null;
            w.filledBuys.pop();
          }
        }`;

const replacement1 = `        // Verifica si el precio bajó hasta el punto de entrada
        if (cp <= o.price * 1.005) {
          const realRes = await executeOrder(w, 'BUY', o.amount, cp);
          if (realRes && realRes.ok) {
            const finalPrice = realRes.exactPrice || cp;
            w.currentPrice = finalPrice;
            o.status = 'filled'; 
            o.filledAt = Date.now(); 
            o.filledPrice = finalPrice;
            
            if (!w.filledBuys) w.filledBuys = [];
            w.filledBuys.push({ price: finalPrice, amount: realRes.exactAmountUSDT || o.amount, level: o.level });
            
            if (mode !== 'real') {
              SIM.balance -= (realRes.exactAmountUSDT || o.amount);
            }
            SIM.totalExec++;
            addLog(\`✅ COMPRA COMPLETADA: \${w.symbol} (Nivel \${o.level}) a $\${fpZ(finalPrice,finalPrice)}\`, 'buy');
          } else {
            // failed, leave pending
          }
        }`;

server = server.replace(target1, replacement1);
fs.writeFileSync('server.js', server);
