const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

let targetStr = `const poolInfo = await solanaWsConnection.getAccountInfo(poolAddress);`;
let replaceStr = `const poolInfo = await withRpcFallback(c => c.getAccountInfo(poolAddress));`;
code = code.replace(targetStr, replaceStr);

targetStr = `          solanaWsConnection.getAccountInfo(new PublicKey(baseVault)),
          solanaWsConnection.getAccountInfo(new PublicKey(quoteVault))`;
replaceStr = `          withRpcFallback(c => c.getAccountInfo(new PublicKey(baseVault))),
          withRpcFallback(c => c.getAccountInfo(new PublicKey(quoteVault)))`;
code = code.replace(targetStr, replaceStr);

fs.writeFileSync('server.js', code);
console.log('Patched pool info to use withRpcFallback');
