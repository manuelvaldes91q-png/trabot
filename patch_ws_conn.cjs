const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const target1 = `      if (!solanaWsConnection) {
        const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
        try {
          solanaWsConnection = new Connection(rpcUrl, { commitment: 'processed', disableRetryOnRateLimit: true });
        } catch (e) {}
      }`;

const replace1 = `      if (!solanaWsConnection) {
        const rpcs = getRpcEndpoints();
        for (const rpc of rpcs) {
          try {
            solanaWsConnection = new Connection(rpc, { commitment: 'processed', disableRetryOnRateLimit: true });
            break;
          } catch (e) {}
        }
      }`;

code = code.replace(target1, replace1);

const target2 = `  if (!appConfig.solanaRpcUrl || addresses.length === 0) return;
  if (!solanaWsConnection) {
    solanaWsConnection = new Connection(appConfig.solanaRpcUrl, { commitment: 'processed', disableRetryOnRateLimit: true });
  }`;

const replace2 = `  if (addresses.length === 0) return;
  if (!solanaWsConnection) {
    const rpcs = getRpcEndpoints();
    for (const rpc of rpcs) {
      try {
        solanaWsConnection = new Connection(rpc, { commitment: 'processed', disableRetryOnRateLimit: true });
        break;
      } catch (e) {}
    }
  }`;

code = code.replace(target2, replace2);
fs.writeFileSync('server.js', code);
console.log('Patched solanaWsConnection fallbacks');
