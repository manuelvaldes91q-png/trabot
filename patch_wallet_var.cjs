const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const targetUI = 'function updateSolanaVpsWalletUI(vpsSolWallet) {';
const repUI = 'let lastVpsSolWallet = null;\nfunction updateSolanaVpsWalletUI(vpsSolWallet) {\n  lastVpsSolWallet = vpsSolWallet;';

html = html.replace(targetUI, () => repUI);
fs.writeFileSync('index.html', html);
console.log('Patched var');
