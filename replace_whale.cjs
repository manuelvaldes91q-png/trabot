const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf-8');

const regex = /function openWhaleMap\(mint, symbol\) \{[\s\S]*?cacheData = d\.data;[\s\S]*?renderWhaleContent\(\);[\s\S]*?\}\)[\s\S]*?\}/;

const replacement = `function openWhaleMap(mint, symbol) {
  let modal = document.getElementById('whaleModal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'whaleModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999;display:flex;justify-content:center;align-items:center;padding:10px;backdrop-filter:blur(3px);';
  
  modal.innerHTML = \`
  <div style="background:var(--bg);border:1px solid var(--bdr);border-radius:10px;width:100%;max-width:800px;height:80vh;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,0.5)">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:15px;border-bottom:1px solid var(--bdr)">
      <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--g)">🫧 BUBBLEMAPS LIVE: \${symbol}</div>
      <button class="btn btn-d btn-xs" onclick="document.getElementById('whaleModal').remove()">✕</button>
    </div>
    <div id="whaleContent" style="flex:1;display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;background:#000;">
      <iframe src="https://app.bubblemaps.io/sol/token/\${mint}" width="100%" height="100%" frameborder="0" style="border:none;flex:1;"></iframe>
    </div>
  </div>\`;
  
  document.body.appendChild(modal);
}`;

content = content.replace(regex, replacement);
fs.writeFileSync('index.html', content);
console.log("Replaced!");
