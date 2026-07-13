const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

content = content.replace("const pwd = getAppPwd();", "");
content = content.replace(
  "const res = await fetch('/api/token/audit/' + mint, {",
  "const res = await myFetch('/api/token/audit/' + mint, {"
);
content = content.replace("headers: { 'authorization': pwd }", "");

content = content.replace("const pwd = getAppPwd();", "");
content = content.replace(
  "const res = await fetch('/api/ai/twitter-analysis', {",
  "const res = await myFetch('/api/ai/twitter-analysis', {"
);
content = content.replace("headers: { 'Content-Type': 'application/json', 'authorization': pwd },", "");

fs.writeFileSync('index.html', content);
