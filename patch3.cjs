const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const target1 = `      const baseBalBefore = await getTokenBalance(connection, userPublicKey, baseMint);`;
const replacement1 = `      const baseBalBefore = await getTokenBalance(connection, userPublicKey, baseMint);
      const tokenBalBefore = await getTokenUiBalance(connection, userPublicKey, targetMint);`;

const target2 = `      const baseBalAfter = await getTokenBalance(connection, userPublicKey, baseMint);
      const diffRaw = side === 'SELL' ? (baseBalAfter - baseBalBefore) : (baseBalBefore - baseBalAfter);
      let exactAmountUSDT = 0;
      if (isSOL) {
        const solPrice = await mxPrice('SOL') || 140;
        exactAmountUSDT = (diffRaw / 1e9) * solPrice;
      } else {
        exactAmountUSDT = diffRaw / 1e6;
      }

      addLog(\`🎉 Solana trade \${side} confirmado con éxito para \${w.symbol}! TxID: \${txid}\`, side==='BUY'?'buy':'sell');
      solanaSwapLogs.unshift({ txid, symbol: w.symbol, side, amountUSDT, time: Date.now() });
      if(solanaSwapLogs.length > 50) solanaSwapLogs.pop();

      return { ok: true, txid, exactAmountUSDT };`;
const replacement2 = `      const baseBalAfter = await getTokenBalance(connection, userPublicKey, baseMint);
      const tokenBalAfter = await getTokenUiBalance(connection, userPublicKey, targetMint);
      
      const diffRaw = side === 'SELL' ? (baseBalAfter - baseBalBefore) : (baseBalBefore - baseBalAfter);
      let exactAmountUSDT = 0;
      if (isSOL) {
        const solPrice = await mxPrice('SOL') || 140;
        exactAmountUSDT = (diffRaw / 1e9) * solPrice;
      } else {
        exactAmountUSDT = diffRaw / 1e6;
      }
      
      const tokenDiff = side === 'BUY' ? (tokenBalAfter - tokenBalBefore) : (tokenBalBefore - tokenBalAfter);
      let exactPrice = price; // default to passed price
      if (tokenDiff > 0 && exactAmountUSDT > 0) {
        exactPrice = exactAmountUSDT / tokenDiff;
      }

      addLog(\`🎉 Solana trade \${side} confirmado con éxito para \${w.symbol}! TxID: \${txid}\`, side==='BUY'?'buy':'sell');
      solanaSwapLogs.unshift({ txid, symbol: w.symbol, side, amountUSDT, time: Date.now() });
      if(solanaSwapLogs.length > 50) solanaSwapLogs.pop();

      return { ok: true, txid, exactAmountUSDT, exactPrice, exactTokens: tokenDiff };`;

server = server.replace(target1, replacement1);
server = server.replace(target2, replacement2);
fs.writeFileSync('server.js', server);
