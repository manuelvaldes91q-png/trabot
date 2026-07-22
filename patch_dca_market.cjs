const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const newAction = `
    } else if (action === 'dcaMarketBuy') {
      const { wi, amount, note } = payload;
      let w = watchItems[wi];
      if (w) {
        let cp = 0;
        if (w.network === 'solana') {
          cp = await getSolanaPrice(w.address);
        } else {
          cp = await mxPrice(w.symbol);
        }
        if (!cp || cp <= 0) cp = w.currentPrice || 1;

        addLog(\`⚡ [DCA Mercado] Comprando \${w.symbol} de \${amount}...\`, 'info');
        const realRes = await executeOrder(w, 'BUY', amount, cp);
        if (realRes && realRes.ok) {
          const finalPrice = realRes.exactPrice || cp;
          w.currentPrice = finalPrice;
          
          const order = {
            level: w.orders.length + 1,
            price: finalPrice,
            amount: realRes.exactAmountUSDT || amount,
            note: note || 'DCA a Mercado',
            status: 'filled',
            type: 'dca',
            filledAt: Date.now(),
            filledPrice: finalPrice
          };
          w.orders.push(order);
          
          if (!w.filledBuys) w.filledBuys = [];
          w.filledBuys.push({ price: finalPrice, amount: realRes.exactAmountUSDT || amount, tokens: realRes.exactTokens, level: order.level });
          
          recalculateTargets(w);
          
          if (w.network === 'solana') {
             const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
             const conn = new require('@solana/web3.js').Connection(rpcUrl, 'confirmed');
             const bal = await getTokenUiBalance(conn, solanaWalletAddress, w.address);
             w.onChainBalance = bal;
          }
          addLog(\`✅ [DCA Mercado] Completado \${w.symbol} a $\${fpZ(finalPrice, finalPrice)}\`, 'info');
        } else {
          addLog(\`❌ [DCA Mercado] Falló compra en \${w.symbol}\`, 'error');
        }
      }
`;

code = code.replace("} else if (action === 'quickMarketBuy') {", newAction + "} else if (action === 'quickMarketBuy') {");
fs.writeFileSync('server.js', code);
console.log('Patched server.js');
