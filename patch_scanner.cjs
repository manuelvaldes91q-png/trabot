const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// Add checkbox for Safe Only
const filterInsert = `      <div class="sf"><div class="lbl">Máx monedas</div>
        <select id="cfMax" class="inp">
          <option value="200">200</option><option value="400" selected>400</option>
          <option value="9999">Todas</option>
        </select>
      </div>
      <div class="sf" style="justify-content:center; align-items:flex-start;">
        <label style="display:flex; align-items:center; cursor:pointer; color:var(--t2); font-size:11px; height:100%;">
          <input type="checkbox" id="cfSafeOnly" style="margin-right:4px;"> 🛡️ 100% Seguro (Anti-Rug)
        </label>
      </div>`;
content = content.replace(/      <div class="sf"><div class="lbl">Máx monedas<\/div>\s*<select id="cfMax" class="inp">\s*<option value="200">200<\/option><option value="400" selected>400<\/option>\s*<option value="9999">Todas<\/option>\s*<\/select>\s*<\/div>/, filterInsert);

const varsInsert = `      const minMarketCap = document.getElementById('cfMinMarketCap') ? +document.getElementById('cfMinMarketCap').value : 0;
      const safeOnly = document.getElementById('cfSafeOnly') ? document.getElementById('cfSafeOnly').checked : false;`;
content = content.replace("      const minMarketCap = document.getElementById('cfMinMarketCap') ? +document.getElementById('cfMinMarketCap').value : 0;", varsInsert);

const filterLogic = `      }).slice(0, maxCoins);
      
      let finalPool = pool;
      if (safeOnly) {
         setSt(\`Filtrando anti-rug en \${pool.length} pares (puede demorar)...\`, 45);
         const safePool = [];
         const batchSize = 3;
         for (let i = 0; i < pool.length; i += batchSize) {
            const batch = pool.slice(i, i + batchSize);
            setSt(\`Auditoría de seguridad... (\${Math.min(i + batchSize, pool.length)}/\${pool.length})\`, 45 + (i/pool.length)*30);
            const promises = batch.map(async (p) => {
               try {
                  const res = await myFetch('/api/token/audit/' + p.baseToken.address);
                  if (res.ok) {
                    const data = await res.json();
                    if (data.available) {
                      const rugProb = parseFloat(data.rugProb) || 0;
                      // Criterios estrictos de seguridad
                      if (rugProb < 20 && data.top10 < 30 && data.dev < 10 && data.noMint && data.noBlacklist && data.lpBurned > 80 && data.insiders === '0%' && data.phishing === '0%') {
                        return p;
                      }
                    }
                  }
               } catch(e) {}
               return null;
            });
            const results = await Promise.all(promises);
            safePool.push(...results.filter(Boolean));
            // Pequeña pausa para no saturar RugCheck
            await new Promise(r => setTimeout(r, 200));
         }
         finalPool = safePool;
      }
      
      for (let i = 0; i < finalPool.length; i++) {
        const p = finalPool[i];`;
content = content.replace(/      \}\)\.slice\(0, maxCoins\);\s*for \(let i = 0; i < pool\.length; i\+\+\) \{\s*const p = pool\[i\];/, filterLogic);

fs.writeFileSync('index.html', content);
