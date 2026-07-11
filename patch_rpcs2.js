import fs from 'fs';
let code = fs.readFileSync('server.js', 'utf8');

const regexRpcs = /const rpcs = \[\s*appConfig.solanaRpcUrl \|\| process.env.SOLANA_RPC_URL,\s*'https:\/\/api.mainnet-beta.solana.com',\s*'https:\/\/solana-rpc.publicnode.com'\s*\].filter\(Boolean\);/g;

code = code.replace(regexRpcs, `const rpcs = [
    appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL,
    'https://api.mainnet-beta.solana.com',
    'https://solana-rpc.publicnode.com',
    'https://solana.drpc.org',
    'https://mainnet.helius-rpc.com/?api-key=d0c15cd5-8664-4bf8-be58-39e2402dd1d4' // Using a community/free helius key if possible, or just drpc
  ].filter(Boolean);`);

fs.writeFileSync('server.js', code);
console.log('Patched RPCs in checkTokenSafety');
