const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Undo the mistake
code = code.replace(
  'const rpcs = getRpcEndpoints(true); // critical for transfers',
  'const rpcs = getRpcEndpoints();'
);

// Do it properly in transfer-funds
code = code.replace(
  /const userPublicKey = keypair\.publicKey;\n    const rpcs = getRpcEndpoints\(\);/g,
  'const userPublicKey = keypair.publicKey;\n    const rpcs = getRpcEndpoints(true);'
);

fs.writeFileSync('server.js', code);
