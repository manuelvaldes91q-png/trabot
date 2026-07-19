const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const marker = 'value="${bestDip?\'pared ';
const p = content.indexOf(marker);

const targetSnippet = ' style="font-size:7px;font-family:var(--mono);color:var(--t2);margin-bottom:5px"></div>';

const allIndexes = [];
let i = -1;
while ((i = content.indexOf(targetSnippet, i + 1)) !== -1) {
    allIndexes.push(i);
}

console.log('All indexes:', allIndexes);
console.log('p:', p);

if (allIndexes.length >= 2) {
    // The second index should be the one after the garbage
    const correctIndex = allIndexes[allIndexes.length - 1]; // last one
    
    const fixedContent = content.substring(0, p) +
        `value="\${bestDip?'pared $'+fpZ(bestDip.price,cp):''}"></div>\n    </div>\n    <div id="af_dist"` +
        content.substring(correctIndex);
    
    fs.writeFileSync('index.html', fixedContent);
    console.log('Fixed file written to index.html');
}

