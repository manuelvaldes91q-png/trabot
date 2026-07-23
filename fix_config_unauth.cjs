const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

const targetCatch = "} catch(e) {\n    console.error('Error loading config:', e);\n  }";
const newCatch = "} catch(e) {\n    if (e.message !== 'Unauthorized') {\n      console.error('Error loading config:', e);\n    }\n  }";

if (html.includes(targetCatch)) {
  html = html.replace(targetCatch, newCatch);
  fs.writeFileSync('index.html', html);
  console.log('Successfully updated loadConfigData catch in index.html');
} else {
  console.log('Target catch block not found as exact string, inspecting...');
}
