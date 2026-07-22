const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const targetStr = `        const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
        const connection = new Connection(rpcUrl, { commitment: 'confirmed', disableRetryOnRateLimit: true });`;

const replaceStr = `        const rpcs = getRpcEndpoints();
        let connection = null;
        for (const rpc of rpcs) {
          try {
            connection = new Connection(rpc, { commitment: 'confirmed', disableRetryOnRateLimit: true });
            await connection.getSlot(); // Test connection
            break;
          } catch (e) {
            connection = null;
          }
        }
        if (!connection) {
          console.error("All RPCs failed for solanaUsdcBalance SIM branch.");
          return;
        }`;

// We have this block twice in `updateSolanaWalletInfo`.
// Let's replace both.
code = code.replaceAll(targetStr, replaceStr);

// Let's check for the second one without the `try` block
const targetStr2 = `    const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
    const connection = new Connection(rpcUrl, { commitment: 'confirmed', disableRetryOnRateLimit: true });`;

const replaceStr2 = `    const rpcs = getRpcEndpoints();
    let connection = null;
    for (const rpc of rpcs) {
      try {
        connection = new Connection(rpc, { commitment: 'confirmed', disableRetryOnRateLimit: true });
        await connection.getSlot(); // Test connection
        break;
      } catch (e) {
        connection = null;
      }
    }
    if (!connection) {
      console.error("All RPCs failed for updateSolanaWalletInfo.");
      return;
    }`;

code = code.replaceAll(targetStr2, replaceStr2);
fs.writeFileSync('server.js', code);
console.log('Patched RPC fallback in updateSolanaWalletInfo');
