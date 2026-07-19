const fs = require('fs');
let content = fs.readFileSync('index.html_fixed', 'utf8');

const targetStr = `<!-- ORDEN ENTRADA -->`;
const endStr = `</select>
      </div>
    </div>`;

const startIndex = content.indexOf(targetStr);
const endIndex = content.indexOf(endStr, startIndex) + endStr.length;

if (startIndex !== -1 && endIndex !== -1) {
    const replacement = `<!-- ORDEN ENTRADA -->
    <div style="font-size:7px;font-weight:700;color:var(--g);font-family:var(--mono);margin-bottom:3px">🎯 Entrada #1</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-bottom:3px">
      <div><div class="lbl">Precio $</div><input type="number" id="af_price" class="inp" value="\${bestDip?bestDip.price:cp}" step="any" onkeyup="updateAfDist()" onchange="updateAfDist()"></div>
      <div><div class="lbl">Monto $</div><input type="number" id="af_amount" class="inp" value="40" min="1"></div>
      <div><div class="lbl">Expira(h)</div><input type="number" id="af_expire" class="inp" placeholder="24" value="24" min="0"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-bottom:3px">
      <div><div class="lbl">Stop Loss %</div><input type="number" id="af_sl" class="inp" value="10" min="1"></div>
      <div><div class="lbl">Take Profit %</div><input type="number" id="af_tp1" class="inp" value="15" min="0.5"></div>
      <input type="hidden" id="af_tp2" value="0">
      <input type="hidden" id="af_note" value="\${bestDip?'pared $'+fpZ(bestDip.price,cp):''}">
    </div>
    <div id="af_dist" style="font-size:7px;font-family:var(--mono);color:var(--t2);margin-bottom:5px"></div>

    <!-- DCA -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
      <div style="font-size:7px;font-weight:700;color:var(--pu);font-family:var(--mono)">🔄 DCA (opcional)</div>
      <div style="display:flex;gap:3px">
        <button class="btn btn-pu btn-xs" onclick="addAfDCA()">+ Nivel</button>
        <select id="af_preset" class="inp" style="font-size:7px;padding:1px 4px;width:auto" onchange="applyAfPreset()">
          <option value="">Preset DCA...</option>
          <option value="a">−3% / −6% / −9%</option>
          <option value="b">−5% / −10% / −15%</option>
          <option value="c">−5% doble monto</option>
          <option value="d">Martingale ×1.5</option>
        </select>
      </div>
    </div>`;
    
    const newContent = content.substring(0, startIndex) + replacement + content.substring(endIndex);
    fs.writeFileSync('index.html', newContent);
    console.log("Fixed successfully!");
}
