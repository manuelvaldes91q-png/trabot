const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

content = content.replace(
    /const solTip = entry\?\.landed_tips_75th_percentile \|\| 0\.0001;\s*return Math\.max\(Math\.floor\(solTip \* 1e9\), 1000\);/,
    `const solTip = entry?.landed_tips_75th_percentile || 0.0001;\n      return Math.max(Math.floor(solTip * 1e9), 100000);`
);

content = content.replace(
    /return 10000;/,
    `return 100000;`
);

fs.writeFileSync('server.js', content);
