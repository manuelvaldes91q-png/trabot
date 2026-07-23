const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. Update getRpcEndpoints
const rpcEndpointsReplacement = `
  endpoints = [...new Set(endpoints.filter(Boolean))];

  // Filter by user-defined roles
  const roles = appConfig.rpcRoles || {};
  endpoints = endpoints.filter(url => {
    const r = roles[url] || 'all';
    if (isCritical) return r === 'all' || r === 'critical';
    return r === 'all' || r === 'monitoring';
  });

  const validEndpoints = endpoints.filter(u => !badRpcBlacklist.has(u));
  return validEndpoints.length > 0 ? validEndpoints : endpoints;
`;

code = code.replace(
/  endpoints = \[\.\.\.new Set\(endpoints\.filter\(Boolean\)\)\];\n  const validEndpoints = endpoints\.filter\(u => !badRpcBlacklist\.has\(u\)\);\n  return validEndpoints\.length > 0 \? validEndpoints : endpoints;/g,
rpcEndpointsReplacement
);

// 2. Add app.post('/api/solana/update-rpc-role') and update /api/solana/rpc-status
const rpcStatusReplacement = `
    additionalRpcUrls: addrs,
    rpcPriorityList: appConfig.rpcPriorityList || [],
    rpcRoles: appConfig.rpcRoles || {},
    activeCriticalRpc,
    activeNonCriticalRpc
  });
});

app.post('/api/solana/update-rpc-role', adminAuth, async (req, res) => {
  const { url, role } = req.body;
  if (!url) return res.status(400).json({ error: 'URL requerida' });
  
  if (!appConfig.rpcRoles) {
    appConfig.rpcRoles = {};
  }
  
  if (role === 'all') {
    delete appConfig.rpcRoles[url];
  } else {
    appConfig.rpcRoles[url] = role;
  }
  
  saveState();
  res.json({ success: true, rpcRoles: appConfig.rpcRoles });
});

app.post('/api/solana/test-rpc', adminAuth, async (req, res) => {
`;

code = code.replace(
/    additionalRpcUrls: addrs,\n    rpcPriorityList: appConfig\.rpcPriorityList \|\| \[\],\n    activeCriticalRpc,\n    activeNonCriticalRpc\n  \}\);\n\}\);\n\napp\.post\('\/api\/solana\/test-rpc', adminAuth, async \(req, res\) => \{/g,
rpcStatusReplacement
);

fs.writeFileSync('server.js', code);
