const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const targetStr = `const bondingCurveInfo = await solanaWsConnection.getAccountInfo(bondingCurve);`;
const replaceStr = `const bondingCurveInfo = await withRpcFallback(c => c.getAccountInfo(bondingCurve));`;

code = code.replace(targetStr, replaceStr);

fs.writeFileSync('server.js', code);
console.log('Patched getAccountInfo to use withRpcFallback');
