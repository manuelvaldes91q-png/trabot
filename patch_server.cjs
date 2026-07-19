const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

content = content.replace(
    /if \(o\.status !== 'pending'\) continue;/g,
    `if (o.status !== 'pending') continue;
        
        if (o.expireAt && Date.now() > o.expireAt) {
          o.status = 'cancelled';
          o.note = 'Expiró (tiempo)';
          addLog(\`⏱️ Orden de \${w.symbol} expirada (límite alcanzado)\`, 'warn');
          continue;
        }`
);

fs.writeFileSync('server.js', content);
