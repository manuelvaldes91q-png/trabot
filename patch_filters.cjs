const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const newFilters = `    <div class="scfg-grid">
      <div class="sf"><div class="lbl">Vol mín 24h ($)</div>
        <input type="number" id="cfVol" class="inp" value="50000" min="0" step="1000">
      </div>
      <div class="sf"><div class="lbl">Liquidez mín ($)</div>
        <input type="number" id="cfLiqMin" class="inp" value="1000" min="0" step="1000">
      </div>
      
      <div class="sf"><div class="lbl">Mín MarketCap ($)</div>
        <input type="number" id="cfMinMarketCap" class="inp" value="20000" min="0" step="1000">
      </div>
      <div class="sf"><div class="lbl">Máx MarketCap ($)</div>
        <input type="number" id="cfMaxMarketCap" class="inp" value="100000" min="0" step="1000">
      </div>

      <div class="sf"><div class="lbl">Mín Edad (Horas)</div>
        <input type="number" id="cfMinAge" class="inp" value="12" min="0" step="1">
      </div>
      <div class="sf"><div class="lbl">Máx Edad (Horas)</div>
        <input type="number" id="cfMaxAge" class="inp" value="2000" min="0" step="1">
      </div>

      <div class="sf"><div class="lbl">Cambio 24h mín</div>
        <select id="cfChg" class="inp">
          <option value="-999" selected>Cualquiera</option><option value="0">0%+</option>
          <option value="3">3%+</option><option value="5">5%+</option><option value="10">10%+</option>
        </select>
      </div>
      <div class="sf"><div class="lbl">Tendencia</div>
        <select id="cfTrend" class="inp">
          <option value="any" selected>Cualquiera</option>
          <option value="bull">Alcista</option>
          <option value="strong">Alcista fuerte</option>
          <option value="acc">Acumulación (Post-Crash)</option>
        </select>
      </div>

      <div class="sf"><div class="lbl">Ordenar</div>
        <select id="cfSort" class="inp" onchange="renderScanResults()">
          <option value="score">Score</option><option value="chg">Cambio</option>
          <option value="dist">Dist. dip</option><option value="vol">Volumen</option>
        </select>
      </div>
      <div class="sf"><div class="lbl">Máx monedas</div>
        <select id="cfMax" class="inp">
          <option value="200">200</option><option value="400" selected>400</option>
          <option value="9999">Todas</option>
        </select>
      </div>
      <div class="sf" style="justify-content:center; align-items:flex-start; grid-column: 1 / -1;">
        <label style="display:flex; align-items:center; cursor:pointer; color:var(--t2); font-size:11px; height:100%;">
          <input type="checkbox" id="cfSafeOnly" style="margin-right:4px;"> 🛡️ 100% Seguro (Anti-Rug)
        </label>
      </div>
    </div>`;

content = content.replace(/<div class="scfg-grid">[\s\S]*?<\/label>\s*<\/div>\s*<\/div>/, newFilters);
fs.writeFileSync('index.html', content);
