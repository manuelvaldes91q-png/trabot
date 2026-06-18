const fs = require('fs');

// 1. Create .env.example
fs.writeFileSync('.env.example', `APP_PASSWORD=admin123
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
MEXC_API_KEY=
MEXC_API_SECRET=
`);

// 2. Modify server.js
let svr = fs.readFileSync('server.js', 'utf8');

// Add imports
svr = svr.replace('import { createServer as createViteServer } from "vite";',
`import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import "dotenv/config";`);

// Add mode to main state variables
svr = svr.replace(/let monitorInterval = 15;\nlet cycleN = 0;/,
`let monitorInterval = 15;
let cycleN = 0;
let mode = 'simulated';`);

// Export mode in API state
svr = svr.replace(/app\.get\('\/api\/state', \(req, res\) => \{\n  res\.json\(\{ SIM, watchItems, logs, monitorOn, monitorInterval, cycleN \}\);\n\}\);/,
`app.get('/api/state', (req, res) => {
  res.json({ SIM, watchItems, logs, monitorOn, monitorInterval, cycleN, mode });
});`);

// Update logic of saveState
svr = svr.replace(/monitorInterval \}\)\);/, `monitorInterval, mode }));`);

// Update logic of loadState
svr = svr.replace(/if \(data\.monitorInterval\) monitorInterval = data\.monitorInterval;/g, 
`if (data.monitorInterval) monitorInterval = data.monitorInterval;
      if (data.mode) mode = data.mode;`);

// Add sendTelegram and update addLog logic inside server.js
svr = svr.replace(/function addLog\([\s\S]*?\}\n/,
`async function sendTelegram(msg) {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  const c = process.env.TELEGRAM_CHAT_ID;
  if (!t || !c) return;
  try {
    await fetch(\`https://api.telegram.org/bot\${t}/sendMessage\`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ chat_id: c, text: msg, parse_mode: 'HTML' })
    });
  } catch (e) {}
}

function addLog(msg, type='info') {
  const t = new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  logs.unshift({ t, msg, type });
  if (logs.length > 200) logs.length = 200;
  console.log(\`[\${t}] \${msg}\`);
  if (['buy', 'sell', 'tp', 'sl_'].includes(type) || msg.includes('Modo cambiado') || msg.includes('activo')) {
    sendTelegram(\`[⚙️ \${mode.toUpperCase()}] \${msg}\`);
  }
}
`);

// Add real trading execution function
svr = svr.replace(/let loopTimer = null;/,
`
async function mxRealOrder(symbol, side, amountUSDT, price) {
  if (mode !== 'real') return true;
  const apiKey = process.env.MEXC_API_KEY;
  const apiSecret = process.env.MEXC_API_SECRET;
  if (!apiKey || !apiSecret) {
    addLog('⚠️ Faltan API Keys de MEXC en el .env', 'warn'); return false;
  }
  const qty = (amountUSDT / price).toFixed(4); // Ajustar según precisión // TO-DO: mejorar
  const ts = Date.now();
  let qs = \`symbol=\${symbol}USDT&side=\${side}&type=LIMIT&quantity=\${qty}&price=\${price}&timestamp=\${ts}\`;
  const sig = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex');
  try {
    const r = await fetch(\`https://api.mexc.com/api/v3/order?\${qs}&signature=\${sig}\`, {
      method: 'POST', headers: { 'X-MEXC-APIKEY': apiKey }
    });
    const res = await r.json();
    if (res.code) { addLog(\`MEXC Error (\${symbol}): \${res.msg}\`, 'warn'); return false; }
    addLog(\`✅ MEXC REAL \${side}: \${symbol} a \${price}\`, side==='BUY'?'buy':'sell');
    return true;
  } catch(e) { return false; }
}

let loopTimer = null;`);

// Inject the Auth middleware in the Express setup
svr = svr.replace(/\/\/ API ENDPOINTS PARA LA INTERFAZ WEB\n\/\/ ============================================/,
`// API ENDPOINTS PARA LA INTERFAZ WEB
// ============================================
const APP_PWD = process.env.APP_PASSWORD || 'admin123';
app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  const auth = req.headers.authorization;
  if (auth !== \`Bearer \${APP_PWD}\`) return res.status(401).json({error: 'Unauthorized'});
  next();
});

app.post('/api/login', (req, res) => {
  if (req.body.password === APP_PWD) res.json({status: 'ok', token: APP_PWD});
  else res.status(401).json({error: 'Invalid password'});
});`);

// Setmode processing route
svr = svr.replace(/if \(action === 'start'\) \{/,
`if (action === 'setMode') {
    mode = payload.mode;
    addLog(\`Modo cambiado a: \${mode.toUpperCase()}\`, 'warn');
  } else if (action === 'start') {`);

// Modify BUY real-execution logic inside runCycle
svr = svr.replace(/SIM\.balance -= o\.amount; \s*SIM\.totalExec\+\+;/,
`const realOk = await mxRealOrder(w.symbol, 'BUY', o.amount, cp);
          if (realOk) {
            if(mode!=='real') SIM.balance -= o.amount;
            SIM.totalExec++;
          } else continue; // Si falla, abortar ejecución actual`);

// Modify SL SELL inside runCycle
svr = svr.replace(/SIM\.balance \+= inv \+ pnl; \s*SIM\.pnl \+= pnl; \s*SIM\.losses\+\+;/,
`const realOk = await mxRealOrder(w.symbol, 'SELL', inv + pnl, cp);
          if (realOk) {
            if(mode!=='real') SIM.balance += inv + pnl;
            SIM.pnl += pnl; 
            SIM.losses++;
          } else continue;`);

// Modify closeTrade (TP SELL and others doesn't exist separated in runCycle yet, except the closeTrade via user manually!)
svr = svr.replace(/SIM\.balance \+= inv \+ pnl; \s*SIM\.pnl \+= pnl;/,
`if (mode === 'real') await mxRealOrder(w.symbol, 'SELL', inv + pnl, cp);
        if (mode !== 'real') SIM.balance += inv + pnl;
        SIM.pnl += pnl;`);

fs.writeFileSync('server.js', svr);


// 3. Modify index.html
let html = fs.readFileSync('index.html', 'utf8');

// Inject the fetch wrapper for Auth Token
html = html.replace(/let audioCtx=null,soundOn=false;/,
`let authToken = localStorage.getItem('dh_pwd') || '';
async function myFetch(url, opts = {}) {
  if (!opts.headers) opts.headers = {};
  if (opts.method === 'POST' && !opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
  opts.headers['Authorization'] = 'Bearer ' + authToken;
  const res = await fetch(url, opts);
  if (res.status === 401) {
    document.getElementById('loginScreen').style.display = 'flex';
    throw new Error('Unauthorized');
  }
  return res;
}
async function doLogin() {
  const p = document.getElementById('pwInp').value;
  const r = await fetch('/api/login', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({password:p})
  });
  if (r.ok) {
    authToken = p; localStorage.setItem('dh_pwd', p);
    document.getElementById('loginScreen').style.display = 'none';
    initServerState(); // intentamos de nuevo restaurar
  } else { alert('Contraseña incorrecta'); }
}
let audioCtx=null,soundOn=false;`);

// Modify all direct auth endpoints
html = html.replace(/await fetch\('\/api\/state'/g, `await myFetch('/api/state'`);
html = html.replace(/fetch\('\/api\/state'/g, `myFetch('/api/state'`);
html = html.replace(/await fetch\('\/api\/action'/g, `await myFetch('/api/action'`);
html = html.replace(/fetch\('\/api\/action'/g, `myFetch('/api/action'`);

// Inject specific styles and login box
html = html.replace(/<\/style>/,
`.login-screen { position:fixed; inset:0; background:var(--bg); z-index:9999; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:15px; }
.login-box { background:var(--bg2); border:1px solid var(--bdr); padding:25px; border-radius:8px; width:320px; text-align:center; box-shadow:0 0 20px rgba(0,0,0,0.5); }
</style>`);

// Add HTML login at the body start
html = html.replace(/<body>\n<div class="app">/,
`<body>
<div class="login-screen" id="loginScreen" style="display:none">
  <div class="login-box">
    <div class="logo" style="font-size:24px;margin-bottom:10px">DIP<span>/</span>HUNTER</div>
    <div style="font-size:11px;color:var(--t2);margin-bottom:20px;line-height:1.4">Acceso Privado al Nodo VPS<br>(Requiere contraseña de administrador)</div>
    <input type="password" id="pwInp" class="inp" placeholder="Ingresa la contraseña..." style="margin-bottom:15px;font-size:14px;padding:8px" onkeydown="if(event.key==='Enter') doLogin()">
    <button class="btn btn-g" style="width:100%;font-size:13px;padding:8px" onclick="doLogin()">Autenticar</button>
  </div>
</div>
<div class="app">`);

// Edit headers UI
html = html.replace(/<span class="htime" id="htime">—<\/span>\n  <div style="font-family:var\(--mono\);font-size:8px;color:var\(--t2\)" id="hstat">Monitor detenido<\/div>/,
`<span class="htime" id="htime">—</span>
  <div style="font-family:var(--mono);font-size:8px;color:var(--t2)" id="hstat">Monitor detenido</div>
  <select id="modeSel" class="inp" style="width:120px;font-size:9px;padding:2px 4px;margin-left:10px;background:rgba(255,255,255,.05);border-color:var(--bdr2);color:var(--t);" onchange="changeRunMode()">
    <option value="simulated">🟢 MODO SIMULADO</option>
    <option value="real">🔴 API REAL MEXC</option>
  </select>`);

// Add initial syncing of the mode
html = html.replace(/SIM = data\.SIM \|\| SIM;/, 
`SIM = data.SIM || SIM;
    if(data.mode) {
      document.getElementById('modeSel').value = data.mode;
      document.getElementById('dBalText').textContent = data.mode === 'real' ? 'USDT (Real MEXC)' : 'USDT';
    }`);

// Support manual changes in mode and MEXC API Keys alert
html = html.replace(/function toggleSound\(\)\{/,
`function changeRunMode() {
  const m = document.getElementById('modeSel').value;
  if(m === 'real' && !confirm('⚠️ ATENCIÓN: Vas a activar las operaciones REALES en MEXC.\\n\\nAsegúrate de tener definidas tus MEXC_API_KEY y MEXC_API_SECRET en las variables de entorno de tu Applet o .env.\\n\\n¿Confirmas que deseas operar automáticamente con tu saldo real en MEXC?')) {
    document.getElementById('modeSel').value = 'simulated'; return;
  }
  myFetch('/api/action', {
    method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({action: 'setMode', payload: {mode: m}})
  });
  document.getElementById('dBalText').textContent = m === 'real' ? 'USDT (Real MEXC)' : 'USDT';
}
function toggleSound(){`);

// Visual text change for dBal
html = html.replace(/<div class="d-lb">Saldo<\/div>/, `<div class="d-lb" id="dBalText">USDT</div>`);

fs.writeFileSync('index.html', html);
console.log("Applied changes!");
