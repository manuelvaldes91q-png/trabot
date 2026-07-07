const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

content = content.replace(
  /async function transferAdminCommission\(inv, amountUSDC\) \{([\s\S]*?)const latestBlockHash = await connection.getLatestBlockhash\(\);\n    tx.recentBlockhash = latestBlockHash.blockhash;\n    tx.feePayer = keypair.publicKey;\n    \n    tx.sign\(keypair\);\n    const txid = await connection.sendRawTransaction\(tx.serialize\(\), \{ skipPreflight: false \}\);/g,
  `async function transferAdminCommission(inv, amountUSDC) {$1
    const adminPk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
    const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminPk));

    const latestBlockHash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockHash.blockhash;
    tx.feePayer = adminKeypair.publicKey; // Admin pays the SOL fee
    
    tx.sign(keypair, adminKeypair); // Both sign
    const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });`
);


content = content.replace(
  /async function executeSolanaTradeInternal\(w, side, amountUSDT, price, pk\) \{/,
  `async function executeSolanaTradeInternal(w, side, amountUSDT, price, pk, feePayerPk = null) {`
);

const jupCallReplaced = `
    const bodyPayload = {
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: priorityFee
    };

    let adminKeypair = null;
    if (feePayerPk) {
       try {
           adminKeypair = Keypair.fromSecretKey(bs58.decode(feePayerPk));
           bodyPayload.feePayer = adminKeypair.publicKey.toString();
       } catch(e) {}
    }

    const sr = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify(bodyPayload)
    });
`;

content = content.replace(
  /const sr = await fetch\('https:\/\/quote-api.jup.ag\/v6\/swap', \{[\s\S]*?body: JSON.stringify\(\{[\s\S]*?\}\)\n    \}\);/g,
  jupCallReplaced
);


content = content.replace(
  /const \{ swapTransaction \} = await sr.json\(\);\n    \n    const swapTransactionBuf = Buffer.from\(swapTransaction, 'base64'\);\n    const transaction = VersionedTransaction.deserialize\(swapTransactionBuf\);\n    transaction.sign\(\[keypair\]\);/g,
  `const { swapTransaction } = await sr.json();
    
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    if (adminKeypair) {
       transaction.sign([keypair, adminKeypair]);
    } else {
       transaction.sign([keypair]);
    }`
);

content = content.replace(
  /const res = await executeSolanaTradeInternal\(w, side, invAmountUSDT, price, inv.depositWalletPk\);/g,
  `const adminPk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
        const res = await executeSolanaTradeInternal(w, side, invAmountUSDT, price, inv.depositWalletPk, adminPk);`
);

fs.writeFileSync('server.js', content);
