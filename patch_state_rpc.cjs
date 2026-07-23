const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
  '    solanaSwapLogs\n  });',
  "    solanaSwapLogs,\n    activeCriticalRpc: getRpcEndpoints(true)[0] || null,\n    activeNonCriticalRpc: getRpcEndpoints()[0] || null\n  });"
);

fs.writeFileSync('server.js', code);
