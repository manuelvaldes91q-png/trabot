const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

html = html.replace(
  'function updateSolanaVpsWalletUI(vpsSolWallet) {',
  'let lastVpsSolWallet = null;\nfunction updateSolanaVpsWalletUI(vpsSolWallet) {\n  lastVpsSolWallet = vpsSolWallet;'
);

const targetDash = `function updateDash(){
  const dBal = document.getElementById('dBal');
  if (dBal) dBal.textContent = '$' + SIM.balance.toFixed(2);`;

const repDash = `function updateDash(){
  const dBal = document.getElementById('dBal');
  if (dBal) {
    const solModeEl = document.getElementById('solModeSel');
    const solMode = solModeEl ? solModeEl.value : 'simulated';
    if ((solMode === 'wallet' || solMode === 'pool') && lastVpsSolWallet) {
      const isUsdc = (lastVpsSolWallet.baseToken || 'SOL').toUpperCase() === 'USDC';
      const bal = isUsdc ? (lastVpsSolWallet.usdc || 0) : (lastVpsSolWallet.usdt || 0);
      dBal.textContent = '$' + bal.toFixed(2);
    } else {
      dBal.textContent = '$' + (SIM.balance || 0).toFixed(2);
    }
  }`;

html = html.replace(targetDash, repDash);
fs.writeFileSync('index.html', html);
console.log('Patched');
