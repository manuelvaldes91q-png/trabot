const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

content = content.replace(
    /<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-bottom:3px">([\s\S]*?)<\/div>\s*<div id="af_dist"/,
    `<div style="display:grid;grid-template-columns:2fr 2fr 2fr 3fr;gap:3px;margin-bottom:3px">
      <div><div class="lbl">TP1 %</div><input type="number" id="af_tp1" class="inp" value="8" min="0.5"></div>
      <div><div class="lbl">TP2 %</div><input type="number" id="af_tp2" class="inp" value="15" min="0.5"></div>
      <div><div class="lbl">Expira(h)</div><input type="number" id="af_expire" class="inp" placeholder="24" value="24" min="1"></div>
      <div><div class="lbl">Nota</div><input type="text" id="af_note" class="inp" value="\${bestDip?'pared $'+fpZ(bestDip.price,cp):''}"></div>
    </div>
    <div id="af_dist"`
);

fs.writeFileSync('index.html', content);
