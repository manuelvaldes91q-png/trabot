const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const scriptMatch = html.match(/<script>(.*?)<\/script>/s);
if (scriptMatch) {
    const code = scriptMatch[1];
    fs.writeFileSync('script.js', code);
    console.log("Extracted script");
}
