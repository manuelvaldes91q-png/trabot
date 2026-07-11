import fs from 'fs';
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
    "const RPC_ENDPOINTS_BASE = [\n  'https://solana-rpc.publicnode.com',\n  'https://rpc.ankr.com/solana'\n];",
    "const RPC_ENDPOINTS_BASE = [\n  'https://api.mainnet-beta.solana.com',\n  'https://solana.drpc.org',\n  'https://solana-rpc.publicnode.com'\n];"
);

fs.writeFileSync('server.js', code);
console.log('Patched RPC_ENDPOINTS_BASE');
