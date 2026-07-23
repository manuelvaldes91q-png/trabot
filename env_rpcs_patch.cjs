const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const replacementRpcEndpoints = `
  const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=9fc11e40-bd50-4889-8d77-628dcd98b3c8";
  const LAVA_RPC = "https://solana.lava.build";
  
  const configured = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL;
  const envRpcs = Object.keys(process.env).filter(k => k.includes('RPC_URL') || k.includes('RPC')).map(k => process.env[k]).filter(v => typeof v === 'string' && v.startsWith('http'));
  const addrs = appConfig.additionalRpcUrls || [];
  
  // Custom user RPCs (from UI and ENV)
  let customRpcs = [...new Set([configured, ...envRpcs, ...addrs].filter(Boolean))];
  
  // Base public RPCs
  let base = RPC_ENDPOINTS_BASE.filter(u => !customRpcs.includes(u) && u !== HELIUS_RPC && u !== LAVA_RPC);
`;

code = code.replace(/  const HELIUS_RPC = "https:\/\/mainnet\.helius-rpc\.com\/\?api-key=9fc11e40-bd50-4889-8d77-628dcd98b3c8";\n  const LAVA_RPC = "https:\/\/solana\.lava\.build";\n  const configured = appConfig\.solanaRpcUrl \|\| process\.env\.SOLANA_RPC_URL;\n  const addrs = appConfig\.additionalRpcUrls \|\| \[\];\n    \n  \/\/ Custom user RPCs\n  let customRpcs = \[\.\.\.new Set\(\[configured, \.\.\.addrs\]\.filter\(Boolean\)\)\];\n  \n  \/\/ Base public RPCs\n  let base = RPC_ENDPOINTS_BASE\.filter\(u => !customRpcs\.includes\(u\) && u !== HELIUS_RPC && u !== LAVA_RPC\);/g, replacementRpcEndpoints);


const rpcStatusReplacement = `
app.get('/api/solana/rpc-status', adminAuth, (req, res) => {
  const rpcs = getRpcEndpoints();
  const criticalRpcs = getRpcEndpoints(true);
  const activeNonCriticalRpc = rpcs.length > 0 ? rpcs[0] : null;
  const activeCriticalRpc = criticalRpcs.length > 0 ? criticalRpcs[0] : null;
  
  const envRpcs = Object.keys(process.env).filter(k => k.includes('RPC_URL') || k.includes('RPC')).map(k => process.env[k]).filter(v => typeof v === 'string' && v.startsWith('http'));
  const addrs = appConfig.additionalRpcUrls || [];
  const allBase = [...new Set([appConfig.solanaRpcUrl, ...envRpcs, ...addrs, ...RPC_ENDPOINTS_BASE, "https://mainnet.helius-rpc.com/?api-key=9fc11e40-bd50-4889-8d77-628dcd98b3c8", "https://solana.lava.build"].filter(Boolean))];
`;

code = code.replace(/app\.get\('\/api\/solana\/rpc-status', adminAuth, \(req, res\) => \{\n  const rpcs = getRpcEndpoints\(\);\n  const criticalRpcs = getRpcEndpoints\(true\);\n  const activeNonCriticalRpc = rpcs\.length > 0 \? rpcs\[0\] : null;\n  const activeCriticalRpc = criticalRpcs\.length > 0 \? criticalRpcs\[0\] : null;\n  \n  const addrs = appConfig\.additionalRpcUrls \|\| \[\];\n  const allBase = \[\.\.\.new Set\(\[appConfig\.solanaRpcUrl, process\.env\.SOLANA_RPC_URL, \.\.\.addrs, \.\.\.RPC_ENDPOINTS_BASE, "https:\/\/mainnet\.helius-rpc\.com\/\?api-key=9fc11e40-bd50-4889-8d77-628dcd98b3c8", "https:\/\/solana\.lava\.build"\]\.filter\(Boolean\)\)\];/g, rpcStatusReplacement);

fs.writeFileSync('server.js', code);
