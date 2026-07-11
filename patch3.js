import fs from 'fs';
let code = fs.readFileSync('server.js', 'utf8');

const realDetect = `
const SNIPE_WINDOW_SECONDS = 60;
const MAX_MINT_SIGNATURES_FOR_SNIPE_CHECK = 2000;

async function detectSnipersAndBundlers(connection, tokenMint, currentHoldersMap) {
  const result = { snipers: 0, bundlers: 0, sniperWalletsCount: 0, bundlerGroups: 0, note: "" };
  try {
    const pubkey = new PublicKey(tokenMint);
    let allSigs = [];
    let before = undefined;
    while (allSigs.length < MAX_MINT_SIGNATURES_FOR_SNIPE_CHECK) {
       const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 1000, before });
       if (sigs.length === 0) break;
       allSigs.push(...sigs);
       before = sigs[sigs.length - 1].signature;
       if (sigs.length < 1000) break;
    }

    if (allSigs.length === 0) return result;
    allSigs.reverse(); // Oldest first
    const creationTime = allSigs[0].blockTime;
    if (!creationTime) return result;

    const earlySigs = allSigs.filter(s => s.blockTime != null && s.blockTime <= creationTime + SNIPE_WINDOW_SECONDS);
    if (earlySigs.length === 0) {
        result.note = "Sin transacciones en los primeros 60s.";
        return result;
    }

    const earlyTransactions = [];
    const CHUNK_SIZE = 50;
    for (let i = 0; i < earlySigs.length; i += CHUNK_SIZE) {
        const chunk = earlySigs.slice(i, i + CHUNK_SIZE).map(s => s.signature);
        const txs = await connection.getParsedTransactions(chunk, { maxSupportedTransactionVersion: 0 });
        earlyTransactions.push(...txs);
        if (i + CHUNK_SIZE < earlySigs.length) await new Promise(r => setTimeout(r, 200));
    }

    const earlyBuyers = new Set();
    for (const tx of earlyTransactions) {
        if (!tx || !tx.meta || tx.meta.err) continue;
        const preBalances = tx.meta.preTokenBalances || [];
        const postBalances = tx.meta.postTokenBalances || [];
        for (const post of postBalances) {
           if (post.mint === tokenMint) {
               const pre = preBalances.find(p => p.accountIndex === post.accountIndex);
               const preAmount = pre ? (pre.uiTokenAmount.uiAmount || 0) : 0;
               const postAmount = post.uiTokenAmount.uiAmount || 0;
               if (postAmount > preAmount && post.owner) {
                   earlyBuyers.add(post.owner);
               }
           }
        }
    }

    if (earlyBuyers.size === 0) return result;

    let snipeTotalPct = 0;
    let snipeWalletsCount = 0;
    const earlyBuyersHolding = [];

    for (const buyer of earlyBuyers) {
       if (currentHoldersMap.has(buyer)) {
           const pct = currentHoldersMap.get(buyer);
           if (pct > 0) {
               snipeTotalPct += pct;
               snipeWalletsCount++;
               earlyBuyersHolding.push(buyer);
           }
       }
    }

    result.snipers = +(snipeTotalPct.toFixed(2));
    result.sniperWalletsCount = snipeWalletsCount;

    if (earlyBuyersHolding.length === 0) {
        result.note = "Snipers detectados, pero ya vendieron todo.";
        return result;
    }

    const fundingSources = {};
    for (const buyer of earlyBuyersHolding) {
       try {
           const sigs = await connection.getSignaturesForAddress(new PublicKey(buyer), { limit: 50 });
           if (sigs.length === 0) continue;
           sigs.reverse();
           const oldestTxSig = sigs[0].signature;
           const parsedTx = await connection.getParsedTransaction(oldestTxSig, { maxSupportedTransactionVersion: 0 });
           if (!parsedTx || !parsedTx.meta || parsedTx.meta.err) continue;
           
           const instructions = parsedTx.transaction.message.instructions;
           let funder = null;
           for (const ix of instructions) {
               if (ix.program === 'system' && ix.parsed && ix.parsed.type === 'transfer') {
                   const info = ix.parsed.info;
                   if (info.destination === buyer) {
                       funder = info.source;
                       break;
                   }
               }
           }
           if (funder) {
               if (!fundingSources[funder]) fundingSources[funder] = [];
               fundingSources[funder].push(buyer);
           }
           await new Promise(r => setTimeout(r, 100));
       } catch (e) { }
    }

    let bundlerGroups = 0;
    let bundlersCount = 0;
    for (const source in fundingSources) {
        const group = fundingSources[source];
        if (group.length > 2) {
            bundlerGroups++;
            bundlersCount += group.length;
        }
    }

    result.bundlerGroups = bundlerGroups;
    result.bundlers = bundlersCount;
    return result;
  } catch (e) {
    result.note = \`Error local snipe detection: \${e.message}\`;
    return result;
  }
}
`;

const replaceTarget = 'async function detectSnipersAndBundlers(connection, tokenMint, currentHoldersMap) {\n  return { snipers: 0, bundlers: 0, sniperWalletsCount: 0, bundlerGroups: 0, note: "Fallback local detection not implemented yet" };\n}';

code = code.replace(replaceTarget, realDetect);

const trackerInject = `
        const currentHoldersMap = new Map(allHolders.map(h => [h.address, h.pct || 0]));
        const trackerData = await fetchSolanaTrackerData(tokenMint);

        if (trackerData) {
          result.details.solanaTrackerRaw = trackerData;
          result.warnings.push('ℹ️ Datos de Solana Tracker recibidos — revisa result.details.solanaTrackerRaw para confirmar los nombres exactos de campos de snipers/bundlers y terminar de conectarlos.');
        } else {
          const snipeResult = await detectSnipersAndBundlers(simConnection, tokenMint, currentHoldersMap);
          result.details.snipers = snipeResult.snipers;
          result.details.bundlers = snipeResult.bundlers;
          result.details.sniperWalletsCount = snipeResult.sniperWalletsCount;
          result.details.bundlerGroups = snipeResult.bundlerGroups;
          if (snipeResult.note) result.warnings.push(\`ℹ️ \${snipeResult.note}\`);
          if (snipeResult.bundlers !== null && snipeResult.bundlers > 30) {
            result.warnings.push(\`⚠️ Posible bundling detectado: \${snipeResult.bundlerGroups} grupo(s) de wallets fondeadas desde el mismo origen antes de comprar.\`);
          }
        }
`;

code = code.replace('if (top10Pct !== null && top10Pct > 80) {', trackerInject + '\n        if (top10Pct !== null && top10Pct > 80) {');

fs.writeFileSync('server.js', code);
console.log('Patched checkTokenSafety successfully!');
