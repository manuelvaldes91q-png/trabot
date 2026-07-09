const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// Replace checkTokenSafety
const newFunc = `async function checkTokenSafety(tokenMint) {
  const result = { safe: true, warnings: [], details: {} };
  try {
    const rcRes = await fetchWithRetry(\`https://api.rugcheck.xyz/v1/tokens/\${tokenMint}/report/summary\`, { timeout: 8000 }, 2, 1000);
    if (rcRes && rcRes.ok) {
      const rc = await rcRes.json();
      const score = rc.score_normalised ?? rc.score ?? 0;
      result.details.rugcheckScore = score;
      result.details.rugcheckRisks = (rc.risks || []).map(r => r.name);
      const dangerRisks = (rc.risks || []).filter(r => r.level === 'danger');
      if (dangerRisks.length > 0) {
        result.safe = false;
        dangerRisks.forEach(r => result.warnings.push(\`RugCheck: \${r.name}\`));
      }
      if (score > 50) {
        result.safe = false;
        result.warnings.push(\`RugCheck score de riesgo alto: \${score}/100\`);
      }
    } else {
      result.warnings.push('RugCheck no devolvió reporte (token muy nuevo o no indexado aún).');
    }
  } catch (e) {
    result.warnings.push(\`RugCheck no disponible: \${e.message}\`);
  }

  const rpcs = [
    appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL,
    'https://api.mainnet-beta.solana.com',
    'https://rpc.ankr.com/solana'
  ].filter(Boolean);

  let mintInfo = null;
  let authorityCheckSuccess = false;
  
  for (const rpc of rpcs) {
    try {
      const connection = new Connection(rpc, 'confirmed');
      mintInfo = await getMint(connection, new PublicKey(tokenMint));
      authorityCheckSuccess = true;
      break;
    } catch (e) {
      console.log(\`Error checking authority with \${rpc}: \${e.message}\`);
    }
  }

  if (authorityCheckSuccess && mintInfo) {
    result.details.mintAuthorityRevoked = mintInfo.mintAuthority === null;
    result.details.freezeAuthorityRevoked = mintInfo.freezeAuthority === null;
    if (mintInfo.mintAuthority !== null) {
      result.safe = false;
      result.warnings.push('Mint authority NO revocada: el creador puede imprimir más tokens de la nada (dilución/rug).');
    }
    if (mintInfo.freezeAuthority !== null) {
      result.safe = false;
      result.warnings.push('Freeze authority NO revocada: el creador puede congelar tu wallet e impedirte vender (honeypot clásico).');
    }
  } else {
    result.warnings.push(\`Chequeo on-chain de autoridades falló en todos los RPCs.\`);
    // Omitimos invalidar el token si el RPC falla, asumiremos que RugCheck nos salva
  }

  try {
    result.details.sellSimulation = { attempted: false, success: false, error: null };
    
    let largestAccounts = null;
    let simConnection = null;
    
    for (const rpc of rpcs) {
      try {
        const conn = new Connection(rpc, 'confirmed');
        largestAccounts = await conn.getTokenLargestAccounts(new PublicKey(tokenMint));
        simConnection = conn;
        break; // Éxito
      } catch (e) {
         console.log(\`Error getTokenLargestAccounts con \${rpc}: \${e.message}\`);
      }
    }

    if (largestAccounts && largestAccounts.value && largestAccounts.value.length > 0) {
      let owner = null;
      let amount = 1000;
      for (const acc of largestAccounts.value) {
         try {
             const info = await getAccount(simConnection, acc.address);
             if (info.amount > 0) {
                 owner = info.owner;
                 amount = Math.min(Number(info.amount), 1000000000);
                 break;
             }
         } catch(e) {}
      }
      
      if (owner) {
        result.details.sellSimulation.attempted = true;
        const quoteUrl = \`https://api.jup.ag/swap/v1/quote?inputMint=\${tokenMint}&outputMint=So11111111111111111111111111111111111111112&amount=\${amount}&slippageBps=1000\`;
        const qr = await fetchWithRetry(quoteUrl, { timeout: 8000 }, 2, 1000);
        if (qr && qr.ok) {
           const quoteResponse = await qr.json();
           if (quoteResponse.routePlan) {
              const sr = await fetchWithRetry('https://api.jup.ag/swap/v1/swap', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  timeout: 10000,
                  body: JSON.stringify({
                      quoteResponse,
                      userPublicKey: owner.toString(),
                      wrapAndUnwrapSol: true
                  })
              }, 2, 1000);
              if (sr && sr.ok) {
                 const swapRes = await sr.json();
                 if (swapRes.swapTransaction) {
                    const txBuf = Buffer.from(swapRes.swapTransaction, 'base64');
                    const tx = VersionedTransaction.deserialize(txBuf);
                    const simRes = await simConnection.simulateTransaction(tx, { sigVerify: false });
                    
                    if (simRes.value && simRes.value.err) {
                        result.details.sellSimulation.success = false;
                        result.details.sellSimulation.error = JSON.stringify(simRes.value.err);
                        result.safe = false;
                        result.warnings.push(\`Simulación de VENTA falló (posible Honeypot): \${JSON.stringify(simRes.value.err)}\`);
                    } else {
                        result.details.sellSimulation.success = true;
                    }
                 }
              }
           }
        }
      }
    }
  } catch (simErr) {
    result.warnings.push(\`Simulación de venta omitida: \${simErr.message}\`);
  }

  return result;
}
`;

content = content.replace(/async function checkTokenSafety\(tokenMint\) \{[\s\S]*?\nasync function ensureGasFunding/, newFunc + '\nasync function ensureGasFunding');

fs.writeFileSync('server.js', content);
console.log('Patched checkTokenSafety successfully!');
