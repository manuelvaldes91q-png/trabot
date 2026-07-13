const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// The JS functions create strings. I will extract them.
const poolMatch = html.match(/<div style="background:var\(--bg2\);width:500px;[^`]+/);
const configMatch = html.match(/<div style="background:var\(--bg2\);width:450px;[^`]+/);

console.log("Pool Match:", !!poolMatch);
console.log("Config Match:", !!configMatch);
