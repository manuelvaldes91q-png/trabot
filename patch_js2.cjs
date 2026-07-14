const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const htmlStyles = `
  <style>
  .ds-filters {
    background: #111;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.05);
    margin-bottom: 12px;
  }
  .ds-filter-row {
    display: flex;
    align-items: center;
    margin-bottom: 6px;
    font-size: 11px;
    color: #a0a0a0;
  }
  .ds-filter-label {
    width: 80px;
    text-align: right;
    margin-right: 12px;
    font-weight: 600;
  }
  .ds-filter-inputs {
    display: flex;
    gap: 8px;
    flex: 1;
  }
  .ds-input-wrap {
    display: flex;
    flex: 1;
    background: #1a1a24;
    border: 1px solid #2a2a35;
    border-radius: 4px;
    overflow: hidden;
    align-items: center;
  }
  .ds-input-wrap:focus-within {
    border-color: #3b82f6;
  }
  .ds-prefix, .ds-suffix {
    padding: 4px 8px;
    color: #6b7280;
    background: #14141a;
    font-family: var(--mono);
  }
  .ds-prefix { border-right: 1px solid #2a2a35; }
  .ds-suffix { border-left: 1px solid #2a2a35; }
  .ds-input {
    flex: 1;
    background: transparent;
    border: none;
    color: #fff;
    padding: 4px 8px;
    font-size: 12px;
    outline: none;
    width: 100%;
    min-width: 0;
  }
  .ds-input::placeholder {
    color: #4b5563;
  }
  </style>
  <div class="ds-filters">
    <div class="ds-filter-row">
      <div class="ds-filter-label">Liquidity:</div>
      <div class="ds-filter-inputs">
        <div class="ds-input-wrap"><span class="ds-prefix">$</span><input type="number" id="f_liqMin" class="ds-input" placeholder="Min" value="1000"></div>
        <div class="ds-input-wrap"><span class="ds-prefix">$</span><input type="number" id="f_liqMax" class="ds-input" placeholder="Max"></div>
      </div>
    </div>
    <div class="ds-filter-row">
      <div class="ds-filter-label">Market cap:</div>
      <div class="ds-filter-inputs">
        <div class="ds-input-wrap"><span class="ds-prefix">$</span><input type="number" id="f_mcMin" class="ds-input" placeholder="Min" value="20000"></div>
        <div class="ds-input-wrap"><span class="ds-prefix">$</span><input type="number" id="f_mcMax" class="ds-input" placeholder="Max" value="100000"></div>
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
        <div class="ds-input-wrap"><input type="number" id="f_ageMin" class="ds-input" placeholder="Min" value="12"><span class="ds-suffix">hours</span></div>
        <div class="ds-input-wrap"><input type="number" id="f_ageMax" class="ds-input" placeholder="Max" value="2000"><span class="ds-suffix">hours</span></div>
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
        <div class="ds-input-wrap"><span class="ds-prefix">$</span><input type="number" id="f_volMin" class="ds-input" placeholder="Min" value="50000"></div>
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

    <div style="display:flex; justify-content:space-between; margin-top:12px; border-top:1px solid rgba(255,255,255,0.05); padding-top:12px; flex-wrap: wrap; gap: 8px;">
      <label style="display:flex; align-items:center; cursor:pointer; color:var(--t2); font-size:11px;">
        <input type="checkbox" id="cfSafeOnly" style="margin-right:4px;"> 🛡️ 100% Seguro (Anti-Rug)
      </label>
      <div style="display:flex; gap: 8px;">
        <div style="display:flex; align-items:center; font-size:10px; color:#a0a0a0;">Tendencia:
          <select id="cfTrend" style="background:#1a1a24; border:1px solid #2a2a35; color:#fff; font-size:10px; padding:2px; margin-left:4px; border-radius:3px;">
            <option value="any" selected>Todas</option>
            <option value="bull">Alcista</option>
            <option value="strong">Alcista fuerte</option>
            <option value="acc">Acumulación</option>
          </select>
        </div>
        <div style="display:flex; align-items:center; font-size:10px; color:#a0a0a0;">Máx items:
          <select id="cfMax" style="background:#1a1a24; border:1px solid #2a2a35; color:#fff; font-size:10px; padding:2px; margin-left:4px; border-radius:3px;">
            <option value="200">200</option>
            <option value="400" selected>400</option>
            <option value="9999">Todas</option>
          </select>
        </div>
        <div style="display:flex; align-items:center; font-size:10px; color:#a0a0a0;">Ordenar:
          <select id="cfSort" onchange="renderScanResults()" style="background:#1a1a24; border:1px solid #2a2a35; color:#fff; font-size:10px; padding:2px; margin-left:4px; border-radius:3px;">
            <option value="score">Score</option><option value="chg">Cambio</option>
            <option value="dist">Dist. dip</option><option value="vol">Volumen</option>
          </select>
        </div>
      </div>
    </div>
  </div>`;

content = content.replace(/<div class="scfg-grid">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, htmlStyles);

const scanStartVars = `
      const liqMin = document.getElementById('f_liqMin') && document.getElementById('f_liqMin').value !== "" ? +document.getElementById('f_liqMin').value : 0;
      const liqMax = document.getElementById('f_liqMax') && document.getElementById('f_liqMax').value !== "" ? +document.getElementById('f_liqMax').value : 9999999999;
      const mcMin = document.getElementById('f_mcMin') && document.getElementById('f_mcMin').value !== "" ? +document.getElementById('f_mcMin').value : 0;
      const mcMax = document.getElementById('f_mcMax') && document.getElementById('f_mcMax').value !== "" ? +document.getElementById('f_mcMax').value : 9999999999;
      const fdvMin = document.getElementById('f_fdvMin') && document.getElementById('f_fdvMin').value !== "" ? +document.getElementById('f_fdvMin').value : 0;
      const fdvMax = document.getElementById('f_fdvMax') && document.getElementById('f_fdvMax').value !== "" ? +document.getElementById('f_fdvMax').value : 9999999999;
      const ageMin = document.getElementById('f_ageMin') && document.getElementById('f_ageMin').value !== "" ? +document.getElementById('f_ageMin').value : 0;
      const ageMax = document.getElementById('f_ageMax') && document.getElementById('f_ageMax').value !== "" ? +document.getElementById('f_ageMax').value : 999999;
      const txnsMin = document.getElementById('f_txnsMin') && document.getElementById('f_txnsMin').value !== "" ? +document.getElementById('f_txnsMin').value : 0;
      const txnsMax = document.getElementById('f_txnsMax') && document.getElementById('f_txnsMax').value !== "" ? +document.getElementById('f_txnsMax').value : 999999999;
      const buysMin = document.getElementById('f_buysMin') && document.getElementById('f_buysMin').value !== "" ? +document.getElementById('f_buysMin').value : 0;
      const buysMax = document.getElementById('f_buysMax') && document.getElementById('f_buysMax').value !== "" ? +document.getElementById('f_buysMax').value : 999999999;
      const sellsMin = document.getElementById('f_sellsMin') && document.getElementById('f_sellsMin').value !== "" ? +document.getElementById('f_sellsMin').value : 0;
      const sellsMax = document.getElementById('f_sellsMax') && document.getElementById('f_sellsMax').value !== "" ? +document.getElementById('f_sellsMax').value : 999999999;
      const volMin = document.getElementById('f_volMin') && document.getElementById('f_volMin').value !== "" ? +document.getElementById('f_volMin').value : 0;
      const volMax = document.getElementById('f_volMax') && document.getElementById('f_volMax').value !== "" ? +document.getElementById('f_volMax').value : 9999999999;
      const chgMin = document.getElementById('f_chgMin') && document.getElementById('f_chgMin').value !== "" ? +document.getElementById('f_chgMin').value : -9999;
      const chgMax = document.getElementById('f_chgMax') && document.getElementById('f_chgMax').value !== "" ? +document.getElementById('f_chgMax').value : 99999;
      const trendReq = document.getElementById('cfTrend') ? document.getElementById('cfTrend').value : 'any';
      const maxCoins = document.getElementById('cfMax') ? +document.getElementById('cfMax').value : 400;
      
      const safeOnly = document.getElementById('cfSafeOnly') ? document.getElementById('cfSafeOnly').checked : false;`;

content = content.replace(/      const volMin = \+document.getElementById\('cfVol'\).value \|\| 0;\s*const liqMin = document.getElementById\('cfLiqMin'\) \? \+document.getElementById\('cfLiqMin'\).value : 0;\s*const chgMin = \+document.getElementById\('cfChg'\).value \|\| -999;\s*const trendReq = document.getElementById\('cfTrend'\).value \|\| 'any';\s*const maxCoins = \+document.getElementById\('cfMax'\).value \|\| 400;\s*const minAge = document.getElementById\('cfMinAge'\) && document.getElementById\('cfMinAge'\).value !== "" \? \+document.getElementById\('cfMinAge'\).value : 0;\s*const maxAge = document.getElementById\('cfMaxAge'\) && document.getElementById\('cfMaxAge'\).value !== "" \? \+document.getElementById\('cfMaxAge'\).value : 999999;\s*const minMarketCap = document.getElementById\('cfMinMarketCap'\) && document.getElementById\('cfMinMarketCap'\).value !== "" \? \+document.getElementById\('cfMinMarketCap'\).value : 0;\s*const maxMarketCap = document.getElementById\('cfMaxMarketCap'\) && document.getElementById\('cfMaxMarketCap'\).value !== "" \? \+document.getElementById\('cfMaxMarketCap'\).value : 99999999999;\s*const safeOnly = document.getElementById\('cfSafeOnly'\) \? document.getElementById\('cfSafeOnly'\).checked : false;/, scanStartVars);

const poolFilter = `      const pool = solPairs.filter(p => {
        const pLiq = p.liquidity?.usd || 0;
        if (pLiq < liqMin || pLiq > liqMax) return false;
        
        const pMc = p.marketCap || 0;
        if (pMc < mcMin || pMc > mcMax) return false;
        
        const pFdv = p.fdv || 0;
        if (pFdv < fdvMin || pFdv > fdvMax) return false;
        
        if (p.pairCreatedAt) {
          const ageHours = (nowMs - p.pairCreatedAt) / (1000 * 60 * 60);
          if (ageHours < ageMin || ageHours > ageMax) return false;
        }
        
        const pTxns = (p.txns?.h24?.buys || 0) + (p.txns?.h24?.sells || 0);
        if (pTxns < txnsMin || pTxns > txnsMax) return false;
        
        const pBuys = p.txns?.h24?.buys || 0;
        if (pBuys < buysMin || pBuys > buysMax) return false;
        
        const pSells = p.txns?.h24?.sells || 0;
        if (pSells < sellsMin || pSells > sellsMax) return false;
        
        const pVol = p.volume?.h24 || 0;
        if (pVol < volMin || pVol > volMax) return false;
        
        const pChg = p.priceChange?.h24 || 0;
        if (pChg < chgMin || pChg > chgMax) return false;
        
        return true;
      }).slice(0, maxCoins);`;

content = content.replace(/      const pool = solPairs.filter\(p => \{\s*const pLiq = p.liquidity\?\.usd \|\| 0;\s*if \(pLiq < liqMin \|\| pLiq > liqMax\) return false;\s*const pMc = p.marketCap \|\| 0;\s*if \(pMc < mcMin \|\| pMc > mcMax\) return false;\s*const pFdv = p.fdv \|\| 0;\s*if \(pFdv < fdvMin \|\| pFdv > fdvMax\) return false;\s*if \(p.pairCreatedAt\) \{\s*const ageHours = \(nowMs - p.pairCreatedAt\) \/ \(1000 \* 60 \* 60\);\s*if \(ageHours < minAge \|\| ageHours > maxAge\) return false;\s*\}\s*const pTxns = \(p.txns\?\.h24\?\.buys \|\| 0\) \+ \(p.txns\?\.h24\?\.sells \|\| 0\);\s*if \(pTxns < txnsMin \|\| pTxns > txnsMax\) return false;\s*const pBuys = p.txns\?\.h24\?\.buys \|\| 0;\s*if \(pBuys < buysMin \|\| pBuys > buysMax\) return false;\s*const pSells = p.txns\?\.h24\?\.sells \|\| 0;\s*if \(pSells < sellsMin \|\| pSells > sellsMax\) return false;\s*const pVol = p.volume\?\.h24 \|\| 0;\s*if \(pVol < volMin \|\| pVol > volMax\) return false;\s*const pChg = p.priceChange\?\.h24 \|\| 0;\s*if \(pChg < chgMin \|\| pChg > chgMax\) return false;\s*return true;\s*\}\)\.slice\(0, maxCoins\);/, poolFilter);

content = content.replace(/      const pool = solPairs.filter\(p => \{\s*if \(\(p.volume\?\.h24 \|\| 0\) < volMin\) return false;\s*if \(\(p.liquidity\?\.usd \|\| 0\) < liqMin\) return false;\s*if \(\(p.priceChange\?\.h24 \|\| 0\) < chgMin\) return false;\s*if \(p.pairCreatedAt\) \{\s*const ageHours = \(nowMs - p.pairCreatedAt\) \/ \(1000 \* 60 \* 60\);\s*if \(ageHours < minAge\) return false;\s*if \(ageHours > maxAge\) return false;\s*\}\s*const mc = p.marketCap \|\| p.fdv \|\| 0;\s*if \(mc < minMarketCap\) return false;\s*if \(mc > maxMarketCap\) return false;\s*return true;\s*\}\)\.slice\(0, maxCoins\);/, poolFilter);

const renderLogic = `function renderScanResults(){
  const sort=document.getElementById('cfSort').value;
  const liqMin = document.getElementById('f_liqMin') && document.getElementById('f_liqMin').value !== "" ? +document.getElementById('f_liqMin').value : 0;
  const liqMax = document.getElementById('f_liqMax') && document.getElementById('f_liqMax').value !== "" ? +document.getElementById('f_liqMax').value : 9999999999;
  const mcMin = document.getElementById('f_mcMin') && document.getElementById('f_mcMin').value !== "" ? +document.getElementById('f_mcMin').value : 0;
  const mcMax = document.getElementById('f_mcMax') && document.getElementById('f_mcMax').value !== "" ? +document.getElementById('f_mcMax').value : 9999999999;
  const fdvMin = document.getElementById('f_fdvMin') && document.getElementById('f_fdvMin').value !== "" ? +document.getElementById('f_fdvMin').value : 0;
  const fdvMax = document.getElementById('f_fdvMax') && document.getElementById('f_fdvMax').value !== "" ? +document.getElementById('f_fdvMax').value : 9999999999;
  const ageMin = document.getElementById('f_ageMin') && document.getElementById('f_ageMin').value !== "" ? +document.getElementById('f_ageMin').value : 0;
  const ageMax = document.getElementById('f_ageMax') && document.getElementById('f_ageMax').value !== "" ? +document.getElementById('f_ageMax').value : 999999;
  const volMin = document.getElementById('f_volMin') && document.getElementById('f_volMin').value !== "" ? +document.getElementById('f_volMin').value : 0;
  const volMax = document.getElementById('f_volMax') && document.getElementById('f_volMax').value !== "" ? +document.getElementById('f_volMax').value : 9999999999;
  
  const now=Date.now();
  
  let data=scanResults.filter(d => {
    // Si no tiene pairCreatedAt, asumimos que pasa el filtro o si es muy viejo.
    const ageHours = d.pairCreatedAt ? (now - d.pairCreatedAt) / (60*60*1000) : 999999;
    const mc = d.marketCap !== undefined ? d.marketCap : 999999999999;
    const liq = d.liq || 0;
    const vol = d.vol || 0;
    
    return ageHours >= ageMin && ageHours <= ageMax && mc >= mcMin && mc <= mcMax && liq >= liqMin && liq <= liqMax && vol >= volMin && vol <= volMax;
  });`;

content = content.replace(/function renderScanResults\(\)\{\s*const sort=document.getElementById\('cfSort'\).value;\s*const minAge = document.getElementById\('cfMinAge'\) && document.getElementById\('cfMinAge'\).value !== "" \? parseFloat\(document.getElementById\('cfMinAge'\).value\) : 0;\s*const maxAge = document.getElementById\('cfMaxAge'\) && document.getElementById\('cfMaxAge'\).value !== "" \? parseFloat\(document.getElementById\('cfMaxAge'\).value\) : 999999;\s*const minCap = document.getElementById\('cfMinMarketCap'\) && document.getElementById\('cfMinMarketCap'\).value !== "" \? parseFloat\(document.getElementById\('cfMinMarketCap'\).value\) : 0;\s*const maxCap = document.getElementById\('cfMaxMarketCap'\) && document.getElementById\('cfMaxMarketCap'\).value !== "" \? parseFloat\(document.getElementById\('cfMaxMarketCap'\).value\) : 99999999999;\s*const liqMin = document.getElementById\('cfLiqMin'\) && document.getElementById\('cfLiqMin'\).value !== "" \? parseFloat\(document.getElementById\('cfLiqMin'\).value\) : 0;\s*const now=Date.now\(\);\s*let data=scanResults.filter\(d => \{\s*\/\/ Si no tiene pairCreatedAt, asumimos que pasa el filtro o si es muy viejo.\s*const ageHours = d.pairCreatedAt \? \(now - d.pairCreatedAt\) \/ \(60\*60\*1000\) : 999999;\s*const mc = d.marketCap !== undefined \? d.marketCap : 999999999999;\s*const liq = d.liq \|\| 0;\s*return ageHours >= minAge && ageHours <= maxAge && mc >= minCap && mc <= maxCap && liq >= liqMin;\s*\}\);/, renderLogic);

fs.writeFileSync('index.html', content);
