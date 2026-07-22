const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(/Es9vMFrzaCERmJfrF4H2FYD4CoNkY11McCe8BenwNYB/g, 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
fs.writeFileSync('server.js', code);
console.log('Fixed USDT mint');
