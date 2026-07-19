const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const search = `dexData.pairs.forEach(p => {`;
console.log(content.indexOf(search));
