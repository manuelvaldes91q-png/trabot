const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const target = `function addOrderToWatch(wi){
  const w=watchItems[wi];
  const price=prompt('Precio de la nueva orden $');
  if(!price||+price<=0)return;
  const amt=prompt('Monto $','50');
  const note=prompt('Nota','DCA extra');
  const order = {level:w.orders.length+1,price:+price,amount:+(amt||50),note:note||'',status:'pending',type:'dca'};
  myFetch('/api/action', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action: 'addOrder', payload: {wi, symbol: w.symbol, address: w.address, order}})});
}`;

const replacement = `function addOrderToWatch(wi) {
  const w = watchItems[wi];
  const cp = w.currentPrice || w.cp || 0;
  
  let modal = document.getElementById('addOrderModal');
  if (modal) modal.remove();
  
  modal = document.createElement('div');
  modal.id = 'addOrderModal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;justify-content:center;align-items:center;padding:15px;backdrop-filter:blur(4px);';
  
  modal.innerHTML = \`
  <div style="background:var(--bg); border:1px solid var(--bdr); border-radius:12px; width:100%; max-width:400px; padding:20px; box-shadow:0 15px 40px rgba(0,0,0,0.6); color:var(--t)">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.08); padding-bottom:10px">
      <div style="font-weight:bold; color:var(--g); display:flex; align-items:center; gap:8px">➕ Añadir DCA: \${w.symbol}</div>
      <button class="btn btn-d btn-xs" onclick="document.getElementById('addOrderModal').remove()">✕</button>
    </div>
    
    <div style="margin-bottom:12px">
      <label style="font-size:10px; color:var(--t2); display:block; margin-bottom:4px">Tipo de Orden</label>
      <select id="aoType" class="inp" style="width:100%; padding:8px" onchange="document.getElementById('aoPriceBox').style.display = this.value === 'limit' ? 'block' : 'none'">
        <option value="limit" selected>Limit (Pendiente)</option>
        <option value="market">A Mercado (Ejecución Inmediata)</option>
      </select>
    </div>
    
    <div id="aoPriceBox" style="margin-bottom:12px; display:block">
      <label style="font-size:10px; color:var(--t2); display:block; margin-bottom:4px">Precio Límite ($)</label>
      <input id="aoPrice" class="inp" style="width:100%; padding:8px" type="number" step="any" value="\${cp}" />
    </div>
    
    <div style="margin-bottom:12px">
      <label style="font-size:10px; color:var(--t2); display:block; margin-bottom:4px">Monto (USDT)</label>
      <input id="aoAmount" class="inp" style="width:100%; padding:8px" type="number" step="any" value="50" />
    </div>
    
    <div style="margin-bottom:20px">
      <label style="font-size:10px; color:var(--t2); display:block; margin-bottom:4px">Nota</label>
      <input id="aoNote" class="inp" style="width:100%; padding:8px" type="text" value="DCA Manual" />
    </div>
    
    <button class="btn btn-g" style="width:100%; padding:10px; font-weight:bold" onclick="submitAddOrder(\${wi})">Confirmar Orden</button>
  </div>\`;
  
  document.body.appendChild(modal);
}

window.submitAddOrder = function(wi) {
  const w = watchItems[wi];
  const type = document.getElementById('aoType').value;
  const price = +document.getElementById('aoPrice').value;
  const amount = +document.getElementById('aoAmount').value;
  const note = document.getElementById('aoNote').value;
  
  if (amount <= 0) { alert('Monto inválido'); return; }
  
  if (type === 'market') {
    if (!confirm('¿Comprar a mercado inmediatamente?')) return;
    myFetch('/api/action', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'quickMarketBuy',
        payload: {
          symbol: w.symbol,
          network: w.network,
          address: w.address,
          pair: w.pair,
          amount: amount
        }
      })
    }).then(() => {
      document.getElementById('addOrderModal').remove();
    });
  } else {
    if (price <= 0) { alert('Precio límite inválido'); return; }
    const order = {level: w.orders.length + 1, price: price, amount: amount, note: note || '', status: 'pending', type: 'dca'};
    myFetch('/api/action', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        action: 'addOrder',
        payload: { wi, symbol: w.symbol, address: w.address, order }
      })
    }).then(() => {
      document.getElementById('addOrderModal').remove();
    });
  }
}`;

code = code.replace(target, replacement);
fs.writeFileSync('index.html', code);
console.log('Patched');
