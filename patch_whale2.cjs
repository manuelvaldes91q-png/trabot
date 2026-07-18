const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf-8');

const regex = /function openWhaleMap\(mint, symbol\) \{[\s\S]*?cacheData = d\.data;[\s\S]*?renderWhaleContent\(\);[\s\S]*?\}\)[\s\S]*?\}/;
let matched = content.match(regex);
if (matched) {
  console.log(matched[0]);
} else {
  console.log("no match");
}
