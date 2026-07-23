const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// For /api/login
code = code.replace(
  /    if \(String\(code\)\.trim\(\) !== active2FA\.code\) \{\n      failedLogins\.unshift\(\{ ip, userAgent, reason: '2FA incorrecto', timestamp: Date\.now\(\) \}\);/g,
  `    if (String(code).trim() !== active2FA.code) {
      active2FA.attempts = (active2FA.attempts || 0) + 1;
      if (active2FA.attempts >= 3) {
         pending2FACodes.delete('admin_2fa');
      }
      failedLogins.unshift({ ip, userAgent, reason: '2FA incorrecto', timestamp: Date.now() });`
);

// For /api/transfer-funds
code = code.replace(
  /      if \(String\(twoFactorCode\)\.trim\(\) !== active2FA\.code\) \{\n        sendTelegram\(/g,
  `      if (String(twoFactorCode).trim() !== active2FA.code) {
        active2FA.attempts = (active2FA.attempts || 0) + 1;
        if (active2FA.attempts >= 3) {
           pending2FACodes.delete('transfer_2fa');
        }
        sendTelegram(`
);

fs.writeFileSync('server.js', code);
