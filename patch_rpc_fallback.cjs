const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const targetFunc = `async function getTokenUiBalance`;

const fallbackCode = `
async function withRpcFallback(actionFn) {
  const rpcs = getRpcEndpoints();
  let lastError = null;
  for (const rpc of rpcs) {
    try {
      const connection = new Connection(rpc, { commitment: 'confirmed', disableRetryOnRateLimit: true });
      return await actionFn(connection);
    } catch (e) {
      lastError = e;
      // Continue to next RPC on error
      continue;
    }
  }
  throw lastError;
}

async function getTokenUiBalance`;

code = code.replace(targetFunc, fallbackCode);

fs.writeFileSync('server.js', code);
console.log('Added withRpcFallback');
