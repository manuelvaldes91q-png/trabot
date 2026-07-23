const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
  'const allBase = [...new Set([appConfig.solanaRpcUrl, process.env.SOLANA_RPC_URL, ...addrs, ...RPC_ENDPOINTS_BASE].filter(Boolean))];',
  'const allBase = [...new Set([appConfig.solanaRpcUrl, process.env.SOLANA_RPC_URL, ...addrs, ...RPC_ENDPOINTS_BASE, "https://mainnet.helius-rpc.com/?api-key=9fc11e40-bd50-4889-8d77-628dcd98b3c8", "https://solana.lava.build"].filter(Boolean))];'
);

fs.writeFileSync('server.js', code);
