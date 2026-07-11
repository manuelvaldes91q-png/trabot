import fs from 'fs';

let code = fs.readFileSync('server.js', 'utf8');

if (!code.includes('@ellipsis-labs/phoenix-sdk')) {
    code = code.replace(
        "import bs58 from 'bs58';",
        "import bs58 from 'bs58';\nimport * as phoenix from '@ellipsis-labs/phoenix-sdk';"
    );
}

const phoenixInit = `
let phoenixClient = null;
async function initPhoenix() {
  try {
     const connection = new Connection(appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
     phoenixClient = await phoenix.Client.create(connection);
     console.log(\`Phoenix client initialized with \${phoenixClient.marketStates.size} markets.\`);
  } catch (e) {
     console.error("Phoenix init error:", e);
  }
}
setTimeout(initPhoenix, 2000);

`;

if (!code.includes('let phoenixClient = null;')) {
    code = code.replace('let wsConnection = null;', phoenixInit + 'let wsConnection = null;');
}

const obRoute = `
app.get('/api/orderbook/:tokenMint', adminAuth, async (req, res) => {
   const mint = req.params.tokenMint;
   if (!phoenixClient) {
       return res.status(500).json({ error: "Phoenix client not initialized" });
   }
   
   let targetMarketKey = null;
   let isQuote = false;
   for (const [address, market] of phoenixClient.marketStates.entries()) {
       const base = market.data.header.baseParams.mintKey.toBase58();
       const quote = market.data.header.quoteParams.mintKey.toBase58();
       if (base === mint || quote === mint) {
           targetMarketKey = address;
           isQuote = (quote === mint);
           break;
       }
   }
   
   if (!targetMarketKey) {
       return res.json({ available: false, message: "No on-chain CLOB market found on Phoenix for this token." });
   }
   
   try {
       await phoenixClient.refreshMarket(targetMarketKey);
       const ladder = phoenixClient.getUiLadder(targetMarketKey, 15);
       res.json({ available: true, asks: ladder.asks, bids: ladder.bids, market: targetMarketKey, isQuote });
   } catch(e) {
       res.status(500).json({ error: e.message });
   }
});
`;

if (!code.includes('app.get(\'/api/orderbook/:tokenMint\'')) {
    code = code.replace('app.get(\'/api/config\',', obRoute + '\napp.get(\'/api/config\',');
}

fs.writeFileSync('server.js', code);
console.log('Phoenix patched in server');
