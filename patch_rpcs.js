import fs from 'fs';
let code = fs.readFileSync('server.js', 'utf8');

const regexRpcs = /const rpcs = \[\s*appConfig.solanaRpcUrl \|\| process.env.SOLANA_RPC_URL,\s*'https:\/\/api.mainnet-beta.solana.com',\s*'https:\/\/rpc.ankr.com\/solana'\s*\].filter\(Boolean\);/g;
code = code.replace(regexRpcs, `const rpcs = [
    appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL,
    'https://api.mainnet-beta.solana.com',
    'https://solana-rpc.publicnode.com'
  ].filter(Boolean);`);

fs.writeFileSync('server.js', code);
console.log('Patched RPCs in checkTokenSafety');
