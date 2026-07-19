const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// Replace "TP1 %" with "Take Profit %" in prompt
content = content.replace(/prompt\(\`TP1 % \(actual: \$\{o\.tp1\}%\)\`,o\.tp1\)/g, "prompt(`Take Profit % (actual: ${o.tp1}%)`,o.tp1)");

// Replace "TP1:" with "TP:" in UI card
content = content.replace(/TP1:</g, "TP:<");

// The card rendering has TP1 logic: w.tp1Price ... just display "TP" instead of "TP1"
// Already handled above with TP1:<

fs.writeFileSync('index.html', content);
