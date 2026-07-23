const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
  "const { blockhash } = await withRpcFallback(c => c.getLatestBlockhash('confirmed'));",
  "const { blockhash } = await withRpcFallback(c => c.getLatestBlockhash('confirmed'), true);"
);

code = code.replace(
  "const txid = await withRpcFallback(c => c.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 3 }));",
  "const txid = await withRpcFallback(c => c.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 3 }), true);"
);

code = code.replace(
  "await withRpcFallback(c => c.confirmTransaction(txid, 'confirmed'));",
  "await withRpcFallback(c => c.confirmTransaction(txid, 'confirmed'), true);"
);

fs.writeFileSync('server.js', code);
