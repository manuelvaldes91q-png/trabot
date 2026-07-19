const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

content = content.replace(
    /\$\{o\.level===1\?\` · SL−\$\{o\.sl\}% TP\+\$\{o\.tp1\}%\` :''\}/g,
    `\${o.level===1?\` · SL−\${o.sl}% TP+\${o.tp1}%\` :''}
                \${o.expireAt && o.status === 'pending' ? \` · <span style="color:var(--y);font-size:9px">Exp:\${new Date(o.expireAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>\` : ''}`
);

fs.writeFileSync('index.html', content);
