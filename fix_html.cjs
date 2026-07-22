const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// The replacement was:
// html = html.replace(targetDash, repDash);
// where repDash had \`... dBal.textContent = '$' + bal.toFixed(2); ... dBal.textContent = '$' + (SIM.balance || 0).toFixed(2); ...\`

// Let's find the string we injected. We can search for:
const marker = "if ((solMode === 'wallet' || solMode === 'pool') && lastVpsSolWallet) {";
const splitAt = html.indexOf(marker);

if (splitAt !== -1) {
    console.log('Found marker at', splitAt);
    // The problem happened at `dBal.textContent = '$' + bal.toFixed(2);`
    // Let's find the first `dBal.textContent = '` after marker
    const firstBad = html.indexOf("dBal.textContent = '", splitAt);
    if (firstBad !== -1) {
        console.log('Found first bad string at', firstBad);
        // The original string we wanted was `dBal.textContent = '$' + bal.toFixed(2);`
        // But instead it inserted `dBal.textContent = '` + suffix + `' + bal.toFixed(2);`
        // Wait, `$'` inserts the suffix. So the result was:
        // dBal.textContent = ' + SUFFIX + ' + bal.toFixed(2);
        
        // Let's just find where the suffix ends. The suffix is the exact string that followed `const dBal = document.getElementById('dBal');\n  if (dBal) dBal.textContent = '$' + SIM.balance.toFixed(2);` in the original file.
        // It starts with `\n  const pnl=SIM.pnl,pct...`
        
        // Let's find `\n  const pnl=SIM.pnl`
        const pnlIndex = html.indexOf("  const pnl=SIM.pnl", firstBad);
        console.log('pnlIndex is', pnlIndex);
        
        // Let's just find the end of the first duplicated suffix.
        // The suffix ends at the end of the file, then we have `' + bal.toFixed(2);`
        const endOfSuffix = html.indexOf("' + bal.toFixed(2);", firstBad);
        console.log('endOfSuffix is', endOfSuffix);
        
        if (endOfSuffix !== -1) {
            // Remove the suffix
            // Wait, there's a second `$'` in `dBal.textContent = '$' + (SIM.balance || 0).toFixed(2);`
            // Let's just restore the file up to `updateDash`, then take the original suffix.
            
            // The original file is:
            // 1. Everything up to `function updateDash(){`
            // 2. The original `updateDash` code
            
            // Fortunately, the suffix *is* the exact remainder of the file!
            // Wait, the suffix starts at `\n  const pnl=SIM.pnl,pct=SIM.initBal>0?pnl/SIM.initBal*100:0;`
            
            // Let's extract everything up to `function updateDash(){`
            const updateDashIndex = html.indexOf("function updateDash(){");
            const prefix = html.substring(0, updateDashIndex);
            
            // The rest of the file starts with:
            const restText = "\n  const pnl=SIM.pnl";
            const restIndex = html.indexOf(restText, updateDashIndex); // But wait, this rest text is inside the duplicated suffix!
            
            // Actually, we can just extract the pure suffix.
            // Wait, the first time the suffix appears is inside the first `dBal.textContent = '`
            // The suffix is EXACTLY the original suffix.
            // Let's verify by looking at the first duplicated suffix.
            
            const startOfSuffix = firstBad + "dBal.textContent = '".length;
            const endOfFirstSuffix = endOfSuffix; // up to but not including `' + bal.toFixed(2);`
            
            const originalSuffix = html.substring(startOfSuffix, endOfFirstSuffix);
            console.log('originalSuffix length:', originalSuffix.length);
            
            // The original file is:
            // prefix + "function updateDash(){\n  const dBal = document.getElementById('dBal');\n  if (dBal) dBal.textContent = '$' + SIM.balance.toFixed(2);" + originalSuffix
            
            const originalFile = prefix + "function updateDash(){\n  const dBal = document.getElementById('dBal');\n  if (dBal) dBal.textContent = '$' + SIM.balance.toFixed(2);" + originalSuffix;
            
            fs.writeFileSync('index.html.restored', originalFile);
            console.log('Saved to index.html.restored. Line count:', originalFile.split('\n').length);
        }
    }
}
