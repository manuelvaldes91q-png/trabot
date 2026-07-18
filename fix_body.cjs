const fs = require('fs');
const body = fs.readFileSync('body.html', 'utf8');
const start = body.indexOf('function openWhaleMap');
if (start === -1) {
  console.log("Not found in body.html");
  process.exit(1);
}
// Find the end of openWhaleMap
let braceCount = 0;
let endIdx = -1;
for (let i = start + 'function openWhaleMap'.length; i < body.length; i++) {
  if (body[i] === '{') braceCount++;
  if (body[i] === '}') {
    braceCount--;
    if (braceCount === 0) {
      endIdx = i + 1;
      break;
    }
  }
}
const missingCode = body.substring(endIdx);
console.log("Missing code length: ", missingCode.length);

let indexContent = fs.readFileSync('index.html', 'utf8');
// Remove everything after openWhaleMap's new implementation
// Wait, index.html currently has the new openWhaleMap, and ends with:
// document.body.appendChild(modal);
// }
// </script></body></html>

indexContent = indexContent.replace('</script></body></html>', missingCode);
fs.writeFileSync('index.html', indexContent);
console.log("Restored missing code!");
