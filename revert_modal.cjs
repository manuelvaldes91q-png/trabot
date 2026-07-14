const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// Remove modal from end of body
content = content.replace(/<!-- FILTERS MODAL -->[\s\S]*?<\/div>\n<\/div>\n<\/body>/, '</body>');

// Restore the filters in the sidebar
const filtersHTML = `
  <style>
    .ds-filters {
      background: #111;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.05);
      margin-bottom: 12px;
      padding: 10px;
    }
    .ds-filter-row {
      display: flex;
      align-items: center;
      margin-bottom: 6px;
    }
    .ds-filter-label {
      width: 75px;
      font-size: 10px;
      color: #a0a0a0;
      text-align: right;
      margin-right: 8px;
      font-weight: 600;
    }
    .ds-filter-inputs {
      display: flex;
      gap: 4px;
      flex: 1;
    }
    .ds-input-wrap {
      display: flex;
      flex: 1;
      background: #1a1a24;
      border: 1px solid #2a2a35;
      border-radius: 4px;
      align-items: center;
      overflow: hidden;
      height: 22px;
    }
    .ds-prefix, .ds-suffix {
      padding: 0 4px;
      color: #6b7280;
      font-size: 9px;
      background: #14141a;
      height: 100%;
      display: flex;
      align-items: center;
      font-family: var(--mono);
    }
    .ds-prefix { border-right: 1px solid #2a2a35; }
    .ds-suffix { border-left: 1px solid #2a2a35; }
    .ds-input {
      flex: 1;
      background: transparent;
      border: none;
      color: #fff;
      padding: 0 4px;
      font-size: 10px;
      outline: none;
      width: 100%;
      min-width: 0;
    }
    .ds-input::placeholder { color: #4b5563; }
    .ds-bot-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 8px;
      border-top: 1px solid rgba(255,255,255,0.05);
      padding-top: 8px;
    }
    .ds-bot-select {
      background: #1a1a24;
      border: 1px solid #2a2a35;
      color: #fff;
      font-size: 9px;
      padding: 2px 4px;
      border-radius: 3px;
      margin-left: 4px;
    }
  </style>
  
  <div class="ds-filters">
    <div class="ds-filter-row">
      <div class="ds-filter-label">Liquidity:</div>
      <div class="ds-filter-inputs">
        <div class="ds-input-wrap"><span class="ds-prefix">$</span><input type="number" id="f_liqMin" class="ds-input" placeholder="Min" value="100"></div>
        <div class="ds-input-wrap"><span class="ds-prefix">$</span><input type="number" id="f_liqMax" class="ds-input" placeholder="Max"></div>
      </div>
    </div>
    <div class="ds-filter-row">
      <div class="ds-filter-label">Market cap:</div>
      <div class="ds-filter-inputs">
        <div class="ds-input-wrap"><span class="ds-prefix">$</span><input type="number" id="f_mcMin" class="ds-input" placeholder="Min" value="200"></div>
        <div class="ds-input-wrap"><span class="ds-prefix">$</span><input type="number" id="f_mcMax" class="ds-input" placeholder="Max" value="100"></div>
      </div>
    </div>
    <div class="ds-filter-row">
      <div class="ds-filter-label">FDV:</div>
      <div class="ds-filter-inputs">
        <div class="ds-input-wrap"><span class="ds-prefix">$</span><input type="number" id="f_fdvMin" class="ds-input" placeholder="Min"></div>
        <div class="ds-input-wrap"><span class="ds-prefix">$</span><input type="number" id="f_fdvMax" class="ds-input" placeholder="Max"></div>
      </div>
    </div>
    <div class="ds-filter-row">
      <div class="ds-filter-label">Pair age:</div>
      <div class="ds-filter-inputs">
        <div class="ds-input-wrap"><input type="number" id="f_ageMin" class="ds-input" placeholder="Min"><span class="ds-suffix">hours</span></div>
        <div class="ds-input-wrap"><input type="number" id="f_ageMax" class="ds-input" placeholder="Max"><span class="ds-suffix">hours</span></div>
      </div>
    </div>
    <div class="ds-filter-row">
      <div class="ds-filter-label">24H txns:</div>
      <div class="ds-filter-inputs">
        <div class="ds-input-wrap"><input type="number" id="f_txnsMin" class="ds-input" placeholder="Min"></div>
        <div class="ds-input-wrap"><input type="number" id="f_txnsMax" class="ds-input" placeholder="Max"></div>
      </div>
    </div>
    <div class="ds-filter-row">
      <div class="ds-filter-label">24H buys:</div>
      <div class="ds-filter-inputs">
        <div class="ds-input-wrap"><input type="number" id="f_buysMin" class="ds-input" placeholder="Min"></div>
        <div class="ds-input-wrap"><input type="number" id="f_buysMax" class="ds-input" placeholder="Max"></div>
      </div>
    </div>
    <div class="ds-filter-row">
      <div class="ds-filter-label">24H sells:</div>
      <div class="ds-filter-inputs">
        <div class="ds-input-wrap"><input type="number" id="f_sellsMin" class="ds-input" placeholder="Min"></div>
        <div class="ds-input-wrap"><input type="number" id="f_sellsMax" class="ds-input" placeholder="Max"></div>
      </div>
    </div>
    <div class="ds-filter-row">
      <div class="ds-filter-label">24H volume:</div>
      <div class="ds-filter-inputs">
        <div class="ds-input-wrap"><span class="ds-prefix">$</span><input type="number" id="f_volMin" class="ds-input" placeholder="Min" value="500"></div>
        <div class="ds-input-wrap"><span class="ds-prefix">$</span><input type="number" id="f_volMax" class="ds-input" placeholder="Max"></div>
      </div>
    </div>
    <div class="ds-filter-row">
      <div class="ds-filter-label">24H change:</div>
      <div class="ds-filter-inputs">
        <div class="ds-input-wrap"><input type="number" id="f_chgMin" class="ds-input" placeholder="Min"><span class="ds-suffix">%</span></div>
        <div class="ds-input-wrap"><input type="number" id="f_chgMax" class="ds-input" placeholder="Max"><span class="ds-suffix">%</span></div>
      </div>
    </div>

    <div style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
      <label style="display:flex; align-items:center; cursor:pointer; color:var(--t2); font-size:10px;">
        <input type="checkbox" id="cfSafeOnly" style="margin-right:6px;" checked> 🛡️ 100% Seguro (Anti-Rug)
      </label>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; font-size:9px; color:#a0a0a0;">Tendencia:
          <select id="cfTrend" class="ds-bot-select">
            <option value="any" selected>Todas</option>
            <option value="bull">Alcista</option>
            <option value="strong">Alcista fuerte</option>
            <option value="acc">Acumulación</option>
          </select>
        </div>
        <div style="display:flex; align-items:center; font-size:9px; color:#a0a0a0;">Máx:
          <select id="cfMax" class="ds-bot-select">
            <option value="200">200</option>
            <option value="400" selected>400</option>
            <option value="9999">Todas</option>
          </select>
        </div>
        <div style="display:flex; align-items:center; font-size:9px; color:#a0a0a0;">Ordenar:
          <select id="cfSort" onchange="renderScanResults()" class="ds-bot-select">
            <option value="score">Score</option><option value="chg">Cambio</option>
            <option value="dist">Dist. dip</option><option value="vol">Volumen</option>
          </select>
        </div>
      </div>
    </div>
  </div>
`;

content = content.replace(/    <div style="margin: 8px 0;">\s*<button class="btn btn-b btn-sm" onclick="document\.getElementById\('filtersModal'\)\.style\.display='flex';"[\s\S]*?<\/button>\s*<\/div>/, filtersHTML);

fs.writeFileSync('index.html', content);
