const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const scanStartVars = `      const volMin = +document.getElementById('cfVol').value || 0;
      const liqMin = document.getElementById('cfLiqMin') ? +document.getElementById('cfLiqMin').value : 0;
      const chgMin = +document.getElementById('cfChg').value || -999;
      const trendReq = document.getElementById('cfTrend').value || 'any';
      const maxCoins = +document.getElementById('cfMax').value || 400;
      
      const minAge = document.getElementById('cfMinAge') && document.getElementById('cfMinAge').value !== "" ? +document.getElementById('cfMinAge').value : 0;
      const maxAge = document.getElementById('cfMaxAge') && document.getElementById('cfMaxAge').value !== "" ? +document.getElementById('cfMaxAge').value : 999999;
      const minMarketCap = document.getElementById('cfMinMarketCap') && document.getElementById('cfMinMarketCap').value !== "" ? +document.getElementById('cfMinMarketCap').value : 0;
      const maxMarketCap = document.getElementById('cfMaxMarketCap') && document.getElementById('cfMaxMarketCap').value !== "" ? +document.getElementById('cfMaxMarketCap').value : 99999999999;
      
      const safeOnly = document.getElementById('cfSafeOnly') ? document.getElementById('cfSafeOnly').checked : false;`;

content = content.replace(/      const volMin = \+document.getElementById\('cfVol'\).value \|\| 10000;\s*const chgMin = \+document.getElementById\('cfChg'\).value \|\| -999;\s*const trendReq = document.getElementById\('cfTrend'\).value \|\| 'any';\s*const maxCoins = \+document.getElementById\('cfMax'\).value \|\| 400;\s*const minAge = document.getElementById\('cfMinAge'\) \? \+document.getElementById\('cfMinAge'\).value : 0;\s*const minMarketCap = document.getElementById\('cfMinMarketCap'\) \? \+document.getElementById\('cfMinMarketCap'\).value : 0;\s*const safeOnly = document.getElementById\('cfSafeOnly'\) \? document.getElementById\('cfSafeOnly'\).checked : false;/, scanStartVars);

const poolFilter = `      const pool = solPairs.filter(p => {
        if ((p.volume?.h24 || 0) < volMin) return false;
        if ((p.liquidity?.usd || 0) < liqMin) return false;
        if ((p.priceChange?.h24 || 0) < chgMin) return false;
        
        if (p.pairCreatedAt) {
          const ageHours = (nowMs - p.pairCreatedAt) / (1000 * 60 * 60);
          if (ageHours < minAge) return false;
          if (ageHours > maxAge) return false;
        }
        
        const mc = p.marketCap || p.fdv || 0;
        if (mc < minMarketCap) return false;
        if (mc > maxMarketCap) return false;
        
        return true;
      }).slice(0, maxCoins);`;

content = content.replace(/      const pool = solPairs.filter\(p => \{\s*if \(\(p.volume\?\.h24 \|\| 0\) < volMin\) return false;\s*if \(\(p.priceChange\?\.h24 \|\| 0\) < chgMin\) return false;\s*if \(minAge > 0\) \{\s*if \(!p.pairCreatedAt\) return false;\s*const ageDays = \(nowMs - p.pairCreatedAt\) \/ \(1000 \* 60 \* 60 \* 24\);\s*if \(ageDays < minAge\) return false;\s*\}\s*if \(minMarketCap > 0\) \{\s*const mc = p.marketCap \|\| p.fdv \|\| 0;\s*if \(mc < minMarketCap\) return false;\s*\}\s*return true;\s*\}\)\.slice\(0, maxCoins\);/, poolFilter);

const renderLogic = `function renderScanResults(){
  const sort=document.getElementById('cfSort').value;
  const minAge = document.getElementById('cfMinAge') && document.getElementById('cfMinAge').value !== "" ? parseFloat(document.getElementById('cfMinAge').value) : 0;
  const maxAge = document.getElementById('cfMaxAge') && document.getElementById('cfMaxAge').value !== "" ? parseFloat(document.getElementById('cfMaxAge').value) : 999999;
  const minCap = document.getElementById('cfMinMarketCap') && document.getElementById('cfMinMarketCap').value !== "" ? parseFloat(document.getElementById('cfMinMarketCap').value) : 0;
  const maxCap = document.getElementById('cfMaxMarketCap') && document.getElementById('cfMaxMarketCap').value !== "" ? parseFloat(document.getElementById('cfMaxMarketCap').value) : 99999999999;
  const liqMin = document.getElementById('cfLiqMin') && document.getElementById('cfLiqMin').value !== "" ? parseFloat(document.getElementById('cfLiqMin').value) : 0;
  
  const now=Date.now();
  
  let data=scanResults.filter(d => {
    // Si no tiene pairCreatedAt, asumimos que pasa el filtro o si es muy viejo.
    const ageHours = d.pairCreatedAt ? (now - d.pairCreatedAt) / (60*60*1000) : 999999;
    const mc = d.marketCap !== undefined ? d.marketCap : 999999999999;
    const liq = d.liq || 0;
    
    return ageHours >= minAge && ageHours <= maxAge && mc >= minCap && mc <= maxCap && liq >= liqMin;
  });`;

content = content.replace(/function renderScanResults\(\)\{\s*const sort=document.getElementById\('cfSort'\).value;\s*const minAge=parseFloat\(document.getElementById\('cfMinAge'\).value\)\|\|0;\s*const minCap=parseFloat\(document.getElementById\('cfMinMarketCap'\).value\)\|\|0;\s*const now=Date.now\(\);\s*let data=scanResults.filter\(d => \{\s*\/\/ Si no tiene pairCreatedAt, asumimos que pasa el filtro \(MEXC tokens\) o si es muy viejo.\s*const ageDays = d.pairCreatedAt \? \(now - d.pairCreatedAt\) \/ \(24\*60\*60\*1000\) : 999999;\s*const mc = d.marketCap !== undefined \? d.marketCap : 999999999999;\s*return ageDays >= minAge && mc >= minCap;\s*\}\);/, renderLogic);

fs.writeFileSync('index.html', content);
