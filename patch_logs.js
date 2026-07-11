import fs from 'fs';
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(/console\.log\(\`Error checking authority with \$\{rpc\}: \$\{e\.message\}\`\);/g, '// console.error(`Error checking authority with ${rpc}: ${e.message}`);');
code = code.replace(/console\.log\(\`Error getTokenLargestAccounts con \$\{rpc\}: \$\{e\.message\}\`\);/g, '// console.error(`Error getTokenLargestAccounts con ${rpc}: ${e.message}`);');

fs.writeFileSync('server.js', code);
console.log('Removed RPC error logs');
