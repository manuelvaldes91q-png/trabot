const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

code = code.replace(
  /\s*\/\/ Sort endpoints: those in priority list first \(by their order\), then others\s*\/\/ Sort endpoints: those in priority list first \(by their order\), then others/g,
  '\n        // Sort endpoints: those in priority list first (by their order), then others'
);

fs.writeFileSync('index.html', code);
