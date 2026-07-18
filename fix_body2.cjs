const fs = require('fs');
const body = fs.readFileSync('body.html', 'utf8');
const start = body.indexOf('function openWhaleMap');
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
let missingCode = body.substring(endIdx);
// missingCode has </script></body> at the end. We need to strip it.
missingCode = missingCode.replace('</script></body>', '');

let indexContent = fs.readFileSync('index.html', 'utf8');
// Insert before the last </script>
const lastScriptIdx = indexContent.lastIndexOf('</script>');
indexContent = indexContent.substring(0, lastScriptIdx) + missingCode + indexContent.substring(lastScriptIdx);

fs.writeFileSync('index.html', indexContent);
console.log("Restored!");
