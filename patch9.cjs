const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

// Using a regex to replace exit: cp with exit: (realRes.exactPrice || cp)
server = server.replace(/exit:\s*cp\s*,/g, "exit: (realRes.exactPrice || cp),");

fs.writeFileSync('server.js', server);
