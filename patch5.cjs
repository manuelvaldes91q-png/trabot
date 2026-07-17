const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const target = `     let allOk = true;
     let totalExactAmountUSDT = 0;
     const mainTxid = 'pool_multi';

     addLog(\`👥 Ejecutando trade \${side} en \${activeInvestors.length} wallets del pool...\`, 'info');

     for (const inv of activeInvestors) {
        const invShare = inv.deposit / totalDeposit;
        const invAmountUSDT = amountUSDT * invShare;
        if (invAmountUSDT < 0.5) { 
           addLog(\`⏭️ Saltando \${inv.name} por monto muy pequeño ($\${invAmountUSDT.toFixed(2)})\`, 'info');
           continue;
        }

        const adminPk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
        const res = await executeSolanaTradeInternal(w, side, invAmountUSDT, price, inv.depositWalletPk, adminPk);
        if (res.ok) {
           if (res.exactAmountUSDT) totalExactAmountUSDT += res.exactAmountUSDT;
        } else {
           allOk = false;
        }

        await new Promise(r => setTimeout(r, 500)); // avoid rate limits
     }

     return { ok: allOk, txid: mainTxid, exactAmountUSDT: totalExactAmountUSDT };`;

const replacement = `     let allOk = true;
     let totalExactAmountUSDT = 0;
     let totalTokens = 0;
     const mainTxid = 'pool_multi';

     addLog(\`👥 Ejecutando trade \${side} en \${activeInvestors.length} wallets del pool...\`, 'info');

     for (const inv of activeInvestors) {
        const invShare = inv.deposit / totalDeposit;
        const invAmountUSDT = amountUSDT * invShare;
        if (invAmountUSDT < 0.5) { 
           addLog(\`⏭️ Saltando \${inv.name} por monto muy pequeño ($\${invAmountUSDT.toFixed(2)})\`, 'info');
           continue;
        }

        const adminPk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
        const res = await executeSolanaTradeInternal(w, side, invAmountUSDT, price, inv.depositWalletPk, adminPk);
        if (res.ok) {
           if (res.exactAmountUSDT) totalExactAmountUSDT += res.exactAmountUSDT;
           if (res.exactTokens) totalTokens += res.exactTokens;
        } else {
           allOk = false;
        }

        await new Promise(r => setTimeout(r, 500)); // avoid rate limits
     }

     let avgExactPrice = price;
     if (totalTokens > 0 && totalExactAmountUSDT > 0) avgExactPrice = totalExactAmountUSDT / totalTokens;

     return { ok: allOk, txid: mainTxid, exactAmountUSDT: totalExactAmountUSDT, exactPrice: avgExactPrice, exactTokens: totalTokens };`;

server = server.replace(target, replacement);
fs.writeFileSync('server.js', server);
