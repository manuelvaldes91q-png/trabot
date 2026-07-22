const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// I know that the duplication starts around "function updateDash(){"
// Let's find "function updateDash(){"
const idx = html.indexOf("function updateDash(){");
const prefix = html.substring(0, idx);

// Now we want the rest of the file without the duplicated junk.
// Let's search for "function updateDash(){" from the end of the file backwards, because the suffix might have been inserted.
// Actually, the suffix starts with "\n  const pnl=SIM.pnl"
// The last occurrence of "const pnl=SIM.pnl" in the file should be the REAL one (or the first one?).
// Since the suffix was inserted IN PLACE of the string, the end of the file is the end of the FIRST inserted suffix... wait.
// If the replacement was:
// dBal.textContent = '$' + bal.toFixed(2);
// It inserted the suffix after the match.

// Let's just split by "const pnl=SIM.pnl"
const parts = html.split("  const pnl=SIM.pnl");
console.log('Found "  const pnl=SIM.pnl" times:', parts.length - 1);

// We know the correct suffix starts with "  const pnl=SIM.pnl" and goes to the end of the file.
// If the file ends with </body></html>, we can just take the LAST "  const pnl=SIM.pnl" part.
const lastPart = parts[parts.length - 1];

// Let's construct the original file:
const originalHTML = prefix + "function updateDash(){\n  const dBal = document.getElementById('dBal');\n  if (dBal) dBal.textContent = '$' + SIM.balance.toFixed(2);\n  const pnl=SIM.pnl" + lastPart;

fs.writeFileSync('index.html.restored2', originalHTML);
console.log('Saved index.html.restored2. Line count:', originalHTML.split('\n').length);
