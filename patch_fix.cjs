const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const rep = `    <div style="margin-top: 12px;">
      <button class="btn btn-g btn-sm" id="btnScan" onclick="startScan()" style="width:100%; padding:8px; font-weight:700;">⚡ ESCANEAR SOLANA</button>
    </div>
    <div style="margin-top:6px">
      <div class="pb"><div class="pbf" id="pbf"></div></div>
      <div class="stxt" id="stxt"></div>
    </div>
  </div>`;

content = content.replace(/    <div style="margin-top: 12px;">\n      <button class="btn btn-g btn-sm" id="btnScan" onclick="startScan\(\)" style="width:100%; padding:8px; font-weight:700;">⚡ ESCANEAR SOLANA<\/button>\n    <\/div>\n  <\/div>/, rep);

fs.writeFileSync('index.html', content);
