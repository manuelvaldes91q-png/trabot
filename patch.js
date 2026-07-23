const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const replacement = `
  const now = Date.now();
  for (const [url, ts] of badRpcBlacklist.entries()) {
    if (now - ts > 15000) badRpcBlacklist.delete(url);
  }

  // If user defined a strict priority list in appConfig, use it
  if (appConfig.rpcPriorityList && appConfig.rpcPriorityList.length > 0) {
    let endpoints = [...appConfig.rpcPriorityList];
    const validEndpoints = endpoints.filter(u => !badRpcBlacklist.has(u));
    return validEndpoints.length > 0 ? validEndpoints : endpoints;
  }

  const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=9fc11e40-bd50-4889-8d77-628dcd98b3c8";
  const LAVA_RPC = "https://solana.lava.build";
`;

code = code.replace(/  const now = Date.now\(\);\n  for \(const \[url, ts\] of badRpcBlacklist\.entries\(\)\) \{\n    if \(now - ts > 15000\) badRpcBlacklist\.delete\(url\); \/\/ 15s expire for rate limits \/ errors\n  \}\n\n  const HELIUS_RPC = "https:\/\/mainnet\.helius-rpc\.com\/\?api-key=9fc11e40-bd50-4889-8d77-628dcd98b3c8";\n  const LAVA_RPC = "https:\/\/solana\.lava\.build";/, replacement);

fs.writeFileSync('server.js', code);
