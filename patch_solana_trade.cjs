const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

// 1. Extract executeSolanaTrade logic to executeSolanaTradeInternal
content = content.replace(
  /async function executeSolanaTrade\(w, side, amountUSDT, price\) \{([\s\S]*?)function fpZ/g,
  `async function executeSolanaTradeInternal(w, side, amountUSDT, price, pk) {$1function fpZ`
);

// We need to replace the pk usage inside executeSolanaTradeInternal
content = content.replace(
  /const pk = poolConfig\.privateKey \|\| appConfig\.solanaPrivateKey \|\| process\.env\.SOLANA_PRIVATE_KEY;\n  if \(!pk\) \{([\s\S]*?)\}/,
  `if (!pk) {
    addLog(\`⚠️ No se puede ejecutar orden real en Solana para \${w.symbol}: Falta llave privada.\`, 'warn');
    return { ok: false };
  }`
);

content = content.replace(
  /async function executeSolanaTradeInternal\(w, side, amountUSDT, price, pk\) \{\n  if \(solMode !== 'wallet' && solMode !== 'pool'\) return \{ ok: true, txid: 'simulated' \};\n/,
  `async function executeSolanaTradeInternal(w, side, amountUSDT, price, pk) {\n`
);

// 2. Add the new executeSolanaTrade wrapper
const wrapper = `
async function executeSolanaTrade(w, side, amountUSDT, price) {
  if (solMode !== 'wallet' && solMode !== 'pool') return { ok: true, txid: 'simulated' };

  if (solMode === 'pool') {
     const activeInvestors = poolConfig.investors.filter(i => i.depositStatus === 'active' && i.deposit > 0 && i.depositWalletPk);
     const totalDeposit = activeInvestors.reduce((s, i) => s + (i.deposit || 0), 0);
     if (totalDeposit <= 0) {
        addLog(\`⚠️ Pool vacía, trade abortado.\`, 'warn');
        return { ok: false };
     }

     let allOk = true;
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

        const res = await executeSolanaTradeInternal(w, side, invAmountUSDT, price, inv.depositWalletPk);
        if (res.ok) {
           if (res.exactAmountUSDT) totalExactAmountUSDT += res.exactAmountUSDT;
        } else {
           allOk = false;
        }

        await new Promise(r => setTimeout(r, 500)); // avoid rate limits
     }

     return { ok: allOk, txid: mainTxid, exactAmountUSDT: totalExactAmountUSDT };
  } else {
     const pk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
     return await executeSolanaTradeInternal(w, side, amountUSDT, price, pk);
  }
}

async function transferAdminCommission(inv, amountUSDC) {
  if (amountUSDC <= 0) return;
  const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(inv.depositWalletPk));
    const adminPubKey = new PublicKey(poolConfig.walletAddress);
    
    const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    const sourceTokenAccount = await getAssociatedTokenAddress(usdcMint, keypair.publicKey);
    const destTokenAccount = await getAssociatedTokenAddress(usdcMint, adminPubKey);

    const decimals = 6;
    const rawAmount = Math.floor(amountUSDC * (10 ** decimals));

    const tx = new Transaction().add(
       createTransferInstruction(
          sourceTokenAccount,
          destTokenAccount,
          keypair.publicKey,
          rawAmount
       )
    );

    const latestBlockHash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockHash.blockhash;
    tx.feePayer = keypair.publicKey;
    
    tx.sign(keypair);
    const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    
    addLog(\`💸 Comisión Admin $\${amountUSDC.toFixed(2)} enviada desde \${inv.name} (Tx: \${txid.slice(0,8)}...)\`, 'info');
  } catch (err) {
    addLog(\`⚠️ Fallo al enviar comisión Admin desde \${inv.name}: \${err.message}\`, 'warn');
  }
}

function fpZ`;

content = content.replace(/function fpZ/, wrapper);

// 3. Update distributePnL to call transferAdminCommission
content = content.replace(
  /inv\.profit = \(inv\.profit \|\| 0\) \+ finalInvProfit;/g,
  `inv.profit = (inv.profit || 0) + finalInvProfit;
    if (solMode === 'pool' && invAdminFee > 0 && inv.depositWalletPk && poolConfig.walletAddress) {
      transferAdminCommission(inv, invAdminFee).catch(e => console.error(e));
    }`
);

// 4. Add the 10-minute auto-sync
const autoSyncCode = `
setInterval(async () => {
  if (solMode !== 'pool') return;
  const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  const baseMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  let updated = false;

  for (let inv of poolConfig.investors) {
    if (inv.depositStatus === 'active' && inv.depositWallet) {
      try {
        const invTokenAccountAddress = await getAssociatedTokenAddress(baseMint, new PublicKey(inv.depositWallet));
        const accountInfo = await connection.getTokenAccountBalance(invTokenAccountAddress);
        const balance = Number(accountInfo.value.amount) / 1e6;
        if (Math.abs(inv.deposit - balance) > 0.05) {
            inv.deposit = balance;
            updated = true;
        }
      } catch (e) { }
    }
  }
  if (updated) saveState();
}, 10 * 60 * 1000);
`;

content = content + '\n' + autoSyncCode;

fs.writeFileSync('server.js', content);
