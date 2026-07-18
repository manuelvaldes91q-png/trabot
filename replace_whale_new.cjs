const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf-8');

const regex = /function openWhaleMap\(mint, symbol\) \{[\s\S]*?\}\s*<\/script>/;

const replacement = `function openWhaleMap(mint, symbol) {
  let modal = document.getElementById('whaleModal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'whaleModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:9999;display:flex;justify-content:center;align-items:center;padding:10px;backdrop-filter:blur(3px);';
  
  modal.innerHTML = \`
  <div style="background:var(--bg);border:1px solid var(--bdr);border-radius:10px;width:100%;max-width:500px;padding:25px;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,0.5);align-items:center;text-align:center;">
    <div style="font-family:var(--mono);font-size:16px;font-weight:700;color:var(--g);margin-bottom:15px;">🫧 BUBBLEMAPS: \${symbol}</div>
    <div style="color:var(--t2);margin-bottom:25px;font-size:13px;line-height:1.5;">
      Debido a políticas de seguridad (CSP) de Bubblemaps, la vista de burbujas no se puede embeber directamente aquí. 
      <br><br>
      Puedes ver el mapa interactivo de <b>\${symbol}</b> abriéndolo en una nueva pestaña.
    </div>
    <div style="display:flex;gap:15px;width:100%;">
      <button class="btn btn-d" style="flex:1" onclick="document.getElementById('whaleModal').remove()">Cerrar</button>
      <a class="btn" style="flex:1;background:rgba(168,85,247,0.2);color:#a855f7;border:1px solid #a855f7;text-decoration:none;display:flex;align-items:center;justify-content:center;" href="https://app.bubblemaps.io/sol/token/\${mint}" target="_blank" rel="noopener" onclick="document.getElementById('whaleModal').remove()">Abrir Bubblemaps ↗</a>
    </div>
  </div>\`;
  
  document.body.appendChild(modal);
}
</script>`;

content = content.replace(regex, replacement);
fs.writeFileSync('index.html', content);
console.log("Replaced!");
