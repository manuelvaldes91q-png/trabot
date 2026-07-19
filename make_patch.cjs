const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

if (!content.includes('@raydium-io/raydium-sdk-v2')) {
    content = content.replace(
        "import bs58 from 'bs58';",
        "import bs58 from 'bs58';\nimport raydiumPkg from '@raydium-io/raydium-sdk-v2';\nconst { LIQUIDITY_VERSION_TO_STATE_LAYOUT } = raydiumPkg;"
    );
}

const customVaultLogic = `
// --- RAYDIUM VAULT WS TRACKING ---
const activeVaultSubs = new Map(); // tokenAddress -> { pool, baseVault, quoteVault, baseSubId, quoteSubId }
let solanaWsConnection = null;

async function trackRaydiumVaults(addresses) {
  if (!appConfig.solanaRpcUrl || addresses.length === 0) return;
  if (!solanaWsConnection) {
    solanaWsConnection = new Connection(appConfig.solanaRpcUrl, 'processed');
  }

  for (const token of addresses) {
    if (activeVaultSubs.has(token) || token.toLowerCase() === 'so11111111111111111111111111111111111111112') continue;
    
    // We mark it as pending so we don't fire multiple requests
    activeVaultSubs.set(token, { pending: true });

    try {
      // 1. Get the pool address from DexScreener
      const url = \`https://api.dexscreener.com/latest/dex/tokens/\${token}\`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) continue;
      const data = await res.json();
      
      const raydiumPairs = data.pairs?.filter(p => p.chainId === 'solana' && p.dexId === 'raydium');
      if (!raydiumPairs || raydiumPairs.length === 0) continue;
      
      // Get the pair with highest liquidity
      raydiumPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const bestPair = raydiumPairs[0];
      
      const poolAddress = new PublicKey(bestPair.pairAddress);
      
      // 2. Fetch pool data to get vaults using official decoder
      const poolInfo = await solanaWsConnection.getAccountInfo(poolAddress);
      if (!poolInfo || !poolInfo.data) continue;
      
      const layout = LIQUIDITY_VERSION_TO_STATE_LAYOUT[4];
      // Only decode if it's V4 AMM (data size 752)
      if (poolInfo.data.length !== 752) continue;
      
      const decoded = layout.decode(poolInfo.data);
      const baseVault = decoded.baseVault.toString();
      const quoteVault = decoded.quoteVault.toString();
      const baseDecimals = decoded.baseDecimal.toNumber();
      const quoteDecimals = decoded.quoteDecimal.toNumber();
      
      const isBaseSol = bestPair.baseToken.address.toLowerCase() === 'so11111111111111111111111111111111111111112';
      
      let baseBalance = 0;
      let quoteBalance = 0;
      
      const updatePrice = () => {
         if (baseBalance > 0 && quoteBalance > 0) {
            let priceInSol = 0;
            if (isBaseSol) {
                // quote is token, base is SOL
                priceInSol = (baseBalance / Math.pow(10, baseDecimals)) / (quoteBalance / Math.pow(10, quoteDecimals));
            } else {
                // base is token, quote is SOL
                priceInSol = (quoteBalance / Math.pow(10, quoteDecimals)) / (baseBalance / Math.pow(10, baseDecimals));
            }
            
            // Get SOL price
            const solPrice = solanaPricesCache['So11111111111111111111111111111111111111112']?.price || 140;
            const finalPrice = priceInSol * solPrice;
            
            // Write directly to the cache that runSolanaCycle uses
            const existingLiq = solanaPricesCache[token]?.liquidity || 0;
            solanaPricesCache[token] = { price: finalPrice, liquidity: existingLiq, lastFetch: Date.now() };
            
            // Also write the SOL price itself if it's not the token
            solanaPricesCache[token.toLowerCase()] = { price: finalPrice, liquidity: existingLiq, lastFetch: Date.now() };
         }
      };

      const baseSubId = solanaWsConnection.onAccountChange(new PublicKey(baseVault), (info) => {
          // Read token balance from token account data
          // Token balance is at offset 64 (uint64) in standard SPL Token Account
          baseBalance = Number(info.data.readBigUInt64LE(64));
          updatePrice();
      }, 'processed');

      const quoteSubId = solanaWsConnection.onAccountChange(new PublicKey(quoteVault), (info) => {
          quoteBalance = Number(info.data.readBigUInt64LE(64));
          updatePrice();
      }, 'processed');
      
      activeVaultSubs.set(token, { poolAddress, baseVault, quoteVault, baseSubId, quoteSubId });
      
    } catch (e) {
      // console.error("Error setting up vault ws", e);
      activeVaultSubs.delete(token); // allow retry
    }
  }
}
// --- END RAYDIUM VAULT WS TRACKING ---
`;

if (!content.includes('trackRaydiumVaults')) {
    content = content.replace(
        "async function runSolanaCycle() {",
        customVaultLogic + "\nasync function runSolanaCycle() {"
    );
}

// Inject into getSolanaPrices
const getSolanaPricesLogic = `
    // Check which addresses need a refresh (older than 2 seconds or not in cache)
    for (const addr of uniqueAddresses) {
      const cached = solanaPricesCache[addr];
      if (cached && (now - cached.lastFetch < 2000)) {
        results[addr] = { price: cached.price, liquidity: cached.liquidity };
      } else {
        toFetch.push(addr);
      }
    }
    
    // START RAYDIUM VAULTS
    trackRaydiumVaults(uniqueAddresses).catch(() => {});
    // END RAYDIUM VAULTS
`;

content = content.replace(
    /for \(const addr of uniqueAddresses\) \{[\s\S]*?toFetch\.push\(addr\);\s*\}\s*\}/,
    getSolanaPricesLogic.trim()
);

fs.writeFileSync('server.js', content);
console.log("Done");
