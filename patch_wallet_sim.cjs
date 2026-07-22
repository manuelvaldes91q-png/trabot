const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const targetStr = `        try {
          const rpcs = getRpcEndpoints();
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
          }

          for (let w of watchItems) {
            if (w.network === 'solana' && w.address) {
              await new Promise(r => setTimeout(r, 600));
              const bal = await getTokenUiBalance(connection, solanaWalletAddress, w.address);
              w.onChainBalance = bal;
            }
          }
        } catch (e) {}`;

const replaceStr = `        try {
          for (let w of watchItems) {
            if (w.network === 'solana' && w.address) {
              await new Promise(r => setTimeout(r, 600));
              const bal = await withRpcFallback(c => getTokenUiBalance(c, solanaWalletAddress, w.address));
              w.onChainBalance = bal;
            }
          }
        } catch (e) {
          console.error("Error updating SIM custom token balances:", e.message);
        }`;

code = code.replace(targetStr, replaceStr);

fs.writeFileSync('server.js', code);
console.log('Patched SIM mode updateSolanaWalletInfo to use withRpcFallback');
