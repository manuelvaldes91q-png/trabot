const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
  'const rpcs = getRpcEndpoints();',
  'const rpcs = getRpcEndpoints(true); // critical for transfers'
);

fs.writeFileSync('server.js', code);
