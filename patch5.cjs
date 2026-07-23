const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const replacement = `
  const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=9fc11e40-bd50-4889-8d77-628dcd98b3c8";
  const LAVA_RPC = "https://solana.lava.build";
  const configured = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL;
  const addrs = appConfig.additionalRpcUrls || [];
  
  let customRpcs = [...new Set([configured, ...addrs].filter(Boolean))];
  let base = RPC_ENDPOINTS_BASE.filter(u => !customRpcs.includes(u) && u !== HELIUS_RPC && u !== LAVA_RPC);

  let endpoints = [];

  // If user defined a strict priority list, use it directly (respecting their exact order), then append others
  if (appConfig.rpcPriorityList && appConfig.rpcPriorityList.length > 0) {
    let prioritySet = new Set(appConfig.rpcPriorityList);
    let fallback = [HELIUS_RPC, LAVA_RPC, ...customRpcs, ...base].filter(u => !prioritySet.has(u));
    endpoints = [...appConfig.rpcPriorityList, ...fallback];
  } else {
    if (isCritical) {
      endpoints = [HELIUS_RPC, LAVA_RPC, ...customRpcs, ...base];
    } else {
      endpoints = [LAVA_RPC, ...customRpcs, ...base, HELIUS_RPC];
    }
  }

  endpoints = [...new Set(endpoints.filter(Boolean))];
  const validEndpoints = endpoints.filter(u => !badRpcBlacklist.has(u));
  return validEndpoints.length > 0 ? validEndpoints : endpoints;
`;

code = code.replace(/  \/\/ If user defined a strict priority list, use it directly \(respecting their exact order\)[\s\S]*?return validEndpoints\.length > 0 \? validEndpoints : endpoints;\n/m, replacement);

fs.writeFileSync('server.js', code);
