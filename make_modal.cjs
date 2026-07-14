const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const modalHTML = `
<!-- FILTERS MODAL -->
<div id="filtersModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); z-index:9999; justify-content:center; align-items:center; backdrop-filter:blur(3px);">
  <div style="background:#15151c; border:1px solid #2a2a35; border-radius:12px; width:100%; max-width:550px; display:flex; flex-direction:column; box-shadow:0 10px 40px rgba(0,0,0,0.5); font-family:var(--sans);">
    
    <!-- Header -->
    <div style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #2a2a35;">
      <div style="font-size:14px; font-weight:700; color:#fff;">Customize Filters</div>
      <button class="btn btn-d btn-xs" style="background:#2a2a35; border:none; padding:4px 8px; border-radius:4px; cursor:pointer; color:#a0a0a0;" onclick="document.getElementById('filtersModal').style.display='none'">✕</button>
    </div>
    
    <!-- Body -->
    <div style="padding:20px; max-height: 80vh; overflow-y: auto;">
      
      <!-- Network Tabs -->
      <div style="display:flex; gap:10px; margin-bottom: 24px;">
        <button style="flex:1; background:#1e1e26; border:1px solid #3b82f6; border-radius:8px; padding:10px; color:#fff; font-size:13px; font-weight:600; display:flex; align-items:center; justify-content:center; gap:6px;">
          <span style="color:#14F195">≡</span> Solana
        </button>
        <button style="flex:1; background:#1e1e26; border:1px solid #2a2a35; border-radius:8px; padding:10px; color:#a0a0a0; font-size:13px; font-weight:600; cursor:pointer;" onclick="this.style.borderColor='#3b82f6';this.style.color='#fff';">
          All DEXes
        </button>
      </div>
      
      <div style="display:flex; align-items:center; justify-content:center; margin-bottom:16px;">
        <div style="height:1px; background:#2a2a35; flex:1;"></div>
        <div style="padding:0 12px; color:#6b7280; font-size:10px; font-weight:700; letter-spacing:0.05em;">FILTERS (OPTIONAL)</div>
        <div style="height:1px; background:#2a2a35; flex:1;"></div>
      </div>
      
      <!-- Profile options -->
      <div class="f-row" style="display:flex; align-items:center; margin-bottom:16px;">
        <div class="f-lbl" style="width:100px; text-align:right; margin-right:16px; font-size:12px; color:#a0a0a0; font-weight:500;">Profile:</div>
        <div style="display:flex; gap:8px; flex:1; flex-wrap:wrap;">
          <label style="background:#1e1e26; border:1px solid #2a2a35; border-radius:6px; padding:6px 12px; font-size:11px; color:#fff; display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" checked style="display:none;">👤 Profile ✔</label>
          <label style="background:#1e1e26; border:1px solid #2a2a35; border-radius:6px; padding:6px 12px; font-size:11px; color:#fff; display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" checked style="display:none;">⚡ Boosted ✔</label>
          <label style="background:#1e1e26; border:1px solid #2a2a35; border-radius:6px; padding:6px 12px; font-size:11px; color:#fff; display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" checked style="display:none;">📢 Ads ✔</label>
          <label style="background:#1e1e26; border:1px solid #2a2a35; border-radius:6px; padding:6px 12px; font-size:11px; color:#fff; display:flex; align-items:center; gap:6px; cursor:pointer;"><input type="checkbox" checked style="display:none;">🚀 Launchpad ✔</label>
        </div>
      </div>
      
      <style>
      .fm-row { display: flex; align-items: center; margin-bottom: 12px; }
      .fm-lbl { width: 100px; text-align: right; margin-right: 16px; font-size: 12px; color: #a0a0a0; font-weight: 500; }
      .fm-inputs { display: flex; gap: 12px; flex: 1; }
      .fm-inp-wrap { display: flex; flex: 1; background: #111116; border: 1px solid #2a2a35; border-radius: 6px; align-items: center; overflow: hidden; height: 36px; }
      .fm-inp-wrap:focus-within { border-color: #3b82f6; }
      .fm-prefix, .fm-suffix { padding: 0 10px; color: #6b7280; font-size: 12px; background: transparent; display:flex; align-items:center; height:100%; font-family:var(--mono); }
      .fm-prefix { border-right: 1px solid #2a2a35; }
      .fm-suffix { border-left: 1px solid #2a2a35; }
      .fm-inp { flex: 1; background: transparent; border: none; color: #fff; padding: 0 10px; font-size: 13px; outline: none; width: 100%; font-weight:500; }
      .fm-inp::placeholder { color: #4b5563; }
      </style>
      
      <!-- Inputs -->
      <div class="fm-row">
        <div class="fm-lbl">Liquidity:</div>
        <div class="fm-inputs">
          <div class="fm-inp-wrap"><span class="fm-prefix">$</span><input type="number" id="f_liqMin" class="fm-inp" placeholder="Min" value="1000"></div>
          <div class="fm-inp-wrap"><span class="fm-prefix">$</span><input type="number" id="f_liqMax" class="fm-inp" placeholder="Max"></div>
        </div>
      </div>
      
      <div class="fm-row">
        <div class="fm-lbl">Market cap:</div>
        <div class="fm-inputs">
          <div class="fm-inp-wrap"><span class="fm-prefix">$</span><input type="number" id="f_mcMin" class="fm-inp" placeholder="Min" value="20000"></div>
          <div class="fm-inp-wrap"><span class="fm-prefix">$</span><input type="number" id="f_mcMax" class="fm-inp" placeholder="Max" value="100000"></div>
        </div>
      </div>
      
      <div class="fm-row">
        <div class="fm-lbl">FDV:</div>
        <div class="fm-inputs">
          <div class="fm-inp-wrap"><span class="fm-prefix">$</span><input type="number" id="f_fdvMin" class="fm-inp" placeholder="Min"></div>
          <div class="fm-inp-wrap"><span class="fm-prefix">$</span><input type="number" id="f_fdvMax" class="fm-inp" placeholder="Max"></div>
        </div>
      </div>
      
      <div class="fm-row">
        <div class="fm-lbl">Pair age:</div>
        <div class="fm-inputs">
          <div class="fm-inp-wrap"><input type="number" id="f_ageMin" class="fm-inp" placeholder="Min" value="12"><span class="fm-suffix">hours</span></div>
          <div class="fm-inp-wrap"><input type="number" id="f_ageMax" class="fm-inp" placeholder="Max" value="2000"><span class="fm-suffix">hours</span></div>
        </div>
      </div>
      
      <div class="fm-row">
        <div class="fm-lbl">24H txns:</div>
        <div class="fm-inputs">
          <div class="fm-inp-wrap"><input type="number" id="f_txnsMin" class="fm-inp" placeholder="Min"></div>
          <div class="fm-inp-wrap"><input type="number" id="f_txnsMax" class="fm-inp" placeholder="Max"></div>
        </div>
      </div>
      
      <div class="fm-row">
        <div class="fm-lbl">24H buys:</div>
        <div class="fm-inputs">
          <div class="fm-inp-wrap"><input type="number" id="f_buysMin" class="fm-inp" placeholder="Min"></div>
          <div class="fm-inp-wrap"><input type="number" id="f_buysMax" class="fm-inp" placeholder="Max"></div>
        </div>
      </div>
      
      <div class="fm-row">
        <div class="fm-lbl">24H sells:</div>
        <div class="fm-inputs">
          <div class="fm-inp-wrap"><input type="number" id="f_sellsMin" class="fm-inp" placeholder="Min"></div>
          <div class="fm-inp-wrap"><input type="number" id="f_sellsMax" class="fm-inp" placeholder="Max"></div>
        </div>
      </div>
      
      <div class="fm-row">
        <div class="fm-lbl">24H volume:</div>
        <div class="fm-inputs">
          <div class="fm-inp-wrap"><span class="fm-prefix">$</span><input type="number" id="f_volMin" class="fm-inp" placeholder="Min" value="50000"></div>
          <div class="fm-inp-wrap"><span class="fm-prefix">$</span><input type="number" id="f_volMax" class="fm-inp" placeholder="Max"></div>
        </div>
      </div>
      
      <div class="fm-row">
        <div class="fm-lbl">24H change:</div>
        <div class="fm-inputs">
          <div class="fm-inp-wrap"><input type="number" id="f_chgMin" class="fm-inp" placeholder="Min"><span class="fm-suffix">%</span></div>
          <div class="fm-inp-wrap"><input type="number" id="f_chgMax" class="fm-inp" placeholder="Max"><span class="fm-suffix">%</span></div>
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; margin-top:20px; border-top:1px solid #2a2a35; padding-top:20px; flex-wrap: wrap; gap: 12px;">
        <label style="display:flex; align-items:center; cursor:pointer; color:#a0a0a0; font-size:12px; font-weight:500;">
          <input type="checkbox" id="cfSafeOnly" style="margin-right:8px; width:16px; height:16px;"> 🛡️ 100% Seguro (Anti-Rug)
        </label>
        
        <div style="display:flex; gap: 12px;">
          <div style="display:flex; align-items:center; font-size:11px; color:#a0a0a0;">Tendencia:
            <select id="cfTrend" style="background:#111116; border:1px solid #2a2a35; color:#fff; font-size:11px; padding:4px 8px; margin-left:6px; border-radius:4px;">
              <option value="any" selected>Todas</option>
              <option value="bull">Alcista</option>
              <option value="strong">Alcista fuerte</option>
              <option value="acc">Acumulación</option>
            </select>
          </div>
          <div style="display:flex; align-items:center; font-size:11px; color:#a0a0a0;">Máx:
            <select id="cfMax" style="background:#111116; border:1px solid #2a2a35; color:#fff; font-size:11px; padding:4px 8px; margin-left:6px; border-radius:4px;">
              <option value="200">200</option>
              <option value="400" selected>400</option>
              <option value="9999">Todas</option>
            </select>
          </div>
          <div style="display:flex; align-items:center; font-size:11px; color:#a0a0a0;">Ordenar:
            <select id="cfSort" onchange="renderScanResults()" style="background:#111116; border:1px solid #2a2a35; color:#fff; font-size:11px; padding:4px 8px; margin-left:6px; border-radius:4px;">
              <option value="score">Score</option><option value="chg">Cambio</option>
              <option value="dist">Dist. dip</option><option value="vol">Volumen</option>
            </select>
          </div>
        </div>
      </div>
      
    </div>
    
    <!-- Footer -->
    <div style="padding:16px 20px; border-top:1px solid #2a2a35; background:#111116; border-radius:0 0 12px 12px; display:flex; justify-content:flex-end;">
      <button class="btn btn-g" style="padding:8px 24px; font-weight:700;" onclick="document.getElementById('filtersModal').style.display='none'; startScan();">Aceptar y Escanear</button>
    </div>
  </div>
</div>
`;

// Insert the modal right before closing body tag
content = content.replace('</body>', modalHTML + '\n</body>');

// Now, replace the old ds-filters block with a button that triggers the modal
const buttonTriggerHTML = `
    <div style="margin: 8px 0;">
      <button class="btn btn-b btn-sm" onclick="document.getElementById('filtersModal').style.display='flex';" style="width:100%; padding:8px; font-weight:600; display:flex; justify-content:center; align-items:center; gap:8px;">
        <span>⚙️ Customize Filters</span>
      </button>
    </div>
`;

content = content.replace(/<style>\s*\.ds-filters \{[\s\S]*?<\/style>\s*<div class="ds-filters">[\s\S]*?<\/select>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/, buttonTriggerHTML);


fs.writeFileSync('index.html', content);
