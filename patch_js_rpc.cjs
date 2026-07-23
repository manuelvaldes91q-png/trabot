const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const rpcUpdateCode = `
    if (data.vpsSolWallet) {
      updateSolanaVpsWalletUI(data.vpsSolWallet);
    }

    const hdrRpcInd = document.getElementById('activeRpcIndicator');
    const hdrCrit = document.getElementById('hdrCriticalRpc');
    const hdrMon = document.getElementById('hdrMonitorRpc');
    if (hdrRpcInd && hdrCrit && hdrMon && currentNetwork === 'solana') {
       hdrRpcInd.style.display = 'flex';
       
       let cRpc = data.activeCriticalRpc || 'Ninguno';
       let mRpc = data.activeNonCriticalRpc || 'Ninguno';
       
       const simplifyRpc = (url) => {
         if (url === 'Ninguno') return url;
         try {
           const parsed = new URL(url);
           let res = parsed.hostname;
           if (res.includes('helius')) return 'Helius';
           if (res.includes('alchemy')) return 'Alchemy';
           if (res.includes('lava')) return 'Lava';
           if (res.includes('quicknode') || res.includes('quiknode')) return 'QuickNode';
           return res;
         } catch(e) { return url; }
       };

       hdrCrit.textContent = simplifyRpc(cRpc);
       hdrMon.textContent = simplifyRpc(mRpc);
    } else if (hdrRpcInd) {
       hdrRpcInd.style.display = 'none';
    }
`;

code = code.replace(
  /    if \(data\.vpsSolWallet\) \{\n      updateSolanaVpsWalletUI\(data\.vpsSolWallet\);\n    \}/g,
  rpcUpdateCode
);

fs.writeFileSync('index.html', code);
