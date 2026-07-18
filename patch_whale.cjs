const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf-8');

const regex = /function openWhaleMap\(mint, symbol\) \{[\s\S]*?\}\)[\s\S]*?\}/;
if (regex.test(content)) {
  console.log("Matched openWhaleMap");
} else {
  console.log("Did not match");
}
