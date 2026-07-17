const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const target1 = `            o.status = 'filled';
            o.filledAt = Date.now();
            o.filledPrice = cp;`;

const replacement1 = `            o.status = 'filled';
            o.filledAt = Date.now();
            o.filledPrice = realRes.exactPrice || cp;
            const executedAmount = realRes.exactAmountUSDT || amount;`;

// But wait, there are multiple occurrences of this! 
