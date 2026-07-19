const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// Also make .wc-info font-size slightly larger: 12px for better readability
content = content.replace(
    /\.wc-info\{font-size:11px;color:var\(--t2\);font-family:var\(--mono\);margin-bottom:5px\}/,
    '.wc-info{font-size:12px;color:var(--t2);font-family:var(--mono);margin-bottom:6px}'
);

content = content.replace(
    /font-size:11px">\(Est:/g,
    'font-size:12px">(Est:'
);

fs.writeFileSync('index.html', content);
