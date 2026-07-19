const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

content = content.replace(
    "const isBaseSol = bestPair.baseToken.address.toLowerCase() === 'so11111111111111111111111111111111111111112';",
    "const isBaseSol = decoded.baseMint.toString().toLowerCase() === 'so11111111111111111111111111111111111111112';"
);

fs.writeFileSync('server.js', content);
