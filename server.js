import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import "dotenv/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ============================================
// STATE DEL BOT (SE MANTIENE EN LA MEMORIA RAM Y SE GUARDA EN ARCHIVO)
// ============================================
let SIM = { balance: 100, initBal: 100, trades: [], pnl: 0, wins: 0, losses: 0, totalExec: 0 };
let watchItems = [];
let logs = [];
let monitorOn = false;
let monitorInterval = 15;
let cycleN = 0;
let mode = 'simulated';
let appConfig = {
  mexcApiKey: process.env.MEXC_API_KEY || '',
  mexcApiSecret: process.env.MEXC_API_SECRET || '',
  tgBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  tgChatId: process.env.TELEGRAM_CHAT_ID || ''
};

function fpZ(p,ref){if(!p||!ref)return'0';if(ref>=10)return p.toFixed(3);if(ref>=0.1)return p.toFixed(4);if(ref>=0.01)return p.toFixed(5);if(ref>=0.001)return p.toFixed(6);const m=ref.toFixed(12).match(/^0\.(0+)/);return m?p.toFixed(m[1].length+4):p.toFixed(6);}

async function sendTelegram(msg) {
  const t = appConfig.tgBotToken || process.env.TELEGRAM_BOT_TOKEN;
  const c = appConfig.tgChatId || process.env.TELEGRAM_CHAT_ID;
  if (!t || !c) return;
  try {
    await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ chat_id: c, text: msg, parse_mode: 'HTML' })
    });
  } catch (e) {}
}

function addLog(msg, type='info') {
  const t = new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  logs.unshift({ t, msg, type });
  if (logs.length > 200) logs.length = 200;
  console.log(`[${t}] ${msg}`);
  if (['buy', 'sell', 'tp', 'sl_'].includes(type) || msg.includes('Modo cambiado') || msg.includes('activo')) {
    sendTelegram(`[⚙️ ${mode.toUpperCase()}] ${msg}`);
  }
}

const STATE_FILE = path.join(__dirname, 'bot-state.json');

function saveState() {
  try {
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ SIM, watchItems, logs, monitorOn, monitorInterval, mode, appConfig }));
    fs.renameSync(tmp, STATE_FILE);
  } catch (e) {
    console.error("Error guardando estado:", e);
  }
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (data.SIM) SIM = data.SIM;
      if (data.watchItems) watchItems = data.watchItems;
      if (data.logs) logs = data.logs;
      if (data.monitorOn !== undefined) monitorOn = data.monitorOn;
      if (data.monitorInterval) monitorInterval = data.monitorInterval;
      if (data.mode) mode = data.mode;
      if (data.appConfig) appConfig = {...appConfig, ...data.appConfig};
      
      watchItems.forEach(w => {
        w.klines1h = []; w.klines1d = [];
        if (!w.orders) w.orders = [];
      });
      console.log(`✅ Estado recuperado: ${watchItems.length} monedas.`);
    } catch (e) {
      console.log('Error cargando estado:', e.message);
    }
  }
}
loadState();

// ============================================
// API DE MEXC (NATIHVA EN NODE.JS)
// ============================================
async function mxPrice(sym) {
  try {
    const r = await fetch(`https://api.mexc.com/api/v3/ticker/price?symbol=${sym}USDT`);
    const d = await r.json();
    return +d.price || 0;
  } catch {
    return 0;
  }
}

// ============================================
// BUCLE PRINCIPAL DEL MONITOR EN EL SERVIDOR
// ============================================

async function mxRealOrder(symbol, side, amountUSDT, price) {
  if (mode !== 'real') return true;
  const apiKey = appConfig.mexcApiKey || process.env.MEXC_API_KEY;
  const apiSecret = appConfig.mexcApiSecret || process.env.MEXC_API_SECRET;
  if (!apiKey || !apiSecret) {
    addLog('⚠️ Faltan API Keys de MEXC en el .env', 'warn'); return false;
  }
  const qty = (amountUSDT / price).toFixed(4); // Ajustar según precisión // TO-DO: mejorar
  const ts = Date.now();
  let qs = `symbol=${symbol}USDT&side=${side}&type=LIMIT&quantity=${qty}&price=${price}&timestamp=${ts}`;
  const sig = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex');
  try {
    const r = await fetch(`https://api.mexc.com/api/v3/order?${qs}&signature=${sig}`, {
      method: 'POST', headers: { 'X-MEXC-APIKEY': apiKey }
    });
    const res = await r.json();
    if (res.code) { addLog(`MEXC Error (${symbol}): ${res.msg}`, 'warn'); return false; }
    addLog(`✅ MEXC REAL ${side}: ${symbol} a ${price}`, side==='BUY'?'buy':'sell');
    return true;
  } catch(e) { return false; }
}

let loopTimer = null;

async function runCycle() {
  if (!monitorOn) return;
  if (!watchItems.length) return;
  cycleN++;
  
  for (let wi = 0; wi < watchItems.length; wi++) {
    const w = watchItems[wi];
    try {
      const cp = await mxPrice(w.symbol);
      if (cp <= 0) continue;
      w.prevPrice = (w.currentPrice || cp);
      w.currentPrice = cp;
      w.lastUpdate = Date.now();
      
      // AUTO-EJECUTAR ÓRDENES
      for (let oi = 0; oi < w.orders.length; oi++) {
        const o = w.orders[oi];
        if (o.status !== 'pending') continue;
        
        // Verifica si el precio bajó hasta el punto de entrada
        if (cp <= o.price * 1.005) {
          o.status = 'filled'; 
          o.filledAt = Date.now(); 
          o.filledPrice = cp;
          
          if (!w.filledBuys) w.filledBuys = [];
          w.filledBuys.push({ price: cp, amount: o.amount, level: o.level });
          const realOk = await mxRealOrder(w.symbol, 'BUY', o.amount, cp);
          if (realOk) {
            if(mode!=='real') SIM.balance -= o.amount;
            SIM.totalExec++;
          } else continue; // Si falla, abortar ejecución actual
          
          if (!w.slPrice) {
            w.slPrice = o.price * (1 - (o.sl || 10)/100);
            w.tp1Price = o.price * (1 + (o.tp1 || 8)/100);
            w.tp2Price = o.price * (1 + (o.tp2 || 15)/100);
          }
          addLog(`✅ AUTO-COMPRA ${w.symbol} #${o.level}: $${fpZ(cp,cp)} · $${o.amount}`, 'buy');
          break; // sólo una por ciclo
        }
      }
      
      // VERIFICAR SL / TP
      const filled = w.orders.filter(o => o.status === 'filled');
      if (filled.length && w.slPrice) {
        const inv = filled.reduce((a, o) => a + o.amount, 0);
        const avg = filled.reduce((a, o) => a + o.price * o.amount, 0) / inv;
        const pnlP = (cp - avg) / avg * 100;
        
        if (cp <= w.slPrice) {
          const pnl = inv * pnlP / 100;
          const realOk = await mxRealOrder(w.symbol, 'SELL', inv + pnl, cp);
          if (realOk) {
            if(mode!=='real') SIM.balance += inv + pnl;
            SIM.pnl += pnl; 
            SIM.losses++;
          } else continue;
          SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: cp, pnl, pnlPct: pnlP.toFixed(2), at: Date.now() });
          
          w.orders.forEach(o => { if (o.status === 'pending') o.status = 'cancelled'; });
          w.slPrice = null; w.tp1Price = null; w.tp2Price = null;
          addLog(`❌ SL ${w.symbol}: $${fpZ(cp,cp)} · P&L $${pnl.toFixed(2)} (${pnlP.toFixed(1)}%)`, 'sl_');
          
        } else if (w.tp1Price && cp >= w.tp1Price && !w.tp1Hit) {
          w.tp1Hit = true;
          addLog(`🎯 TP1 ${w.symbol}: $${fpZ(cp,cp)} +${pnlP.toFixed(1)}%`, 'tp');
        } else if (w.tp2Price && cp >= w.tp2Price && !w.tp2Hit) {
          w.tp2Hit = true;
          addLog(`🚀 TP2 ${w.symbol}: $${fpZ(cp,cp)} +${pnlP.toFixed(1)}%`, 'tp');
        }
      }
    } catch (e) {
      console.log('Error en ciclo:', w.symbol, e.message);
    }
  }
  saveState();
}

function startLoop() {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = setInterval(() => {
    if (monitorOn) runCycle();
  }, monitorInterval * 1000);
}

// Iniciar el loop si estaba encendido en el estado recuperado
startLoop();


// ============================================
// API ENDPOINTS PARA LA INTERFAZ WEB
// ============================================
const APP_PWD = process.env.APP_PASSWORD || 'admin123';
app.use('/api', (req, res, next) => {
  if (req.path === '/login') return next();
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${APP_PWD}`) return res.status(401).json({error: 'Unauthorized'});
  next();
});

app.post('/api/login', (req, res) => {
  if (req.body.password === APP_PWD) res.json({status: 'ok', token: APP_PWD});
  else res.status(401).json({error: 'Invalid password'});
});
app.get('/api/state', (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.json({ SIM, watchItems, logs, monitorOn, monitorInterval, cycleN, mode });
});

app.get('/api/config', (req, res) => {
  // Solo enviar a la vista web para que vea qué variables están seteadas o si están vacías.
  res.json(appConfig);
});

app.post('/api/config', (req, res) => {
  const { mexcApiKey, mexcApiSecret, tgBotToken, tgChatId } = req.body;
  if(mexcApiKey !== undefined) appConfig.mexcApiKey = mexcApiKey;
  if(mexcApiSecret !== undefined) appConfig.mexcApiSecret = mexcApiSecret;
  if(tgBotToken !== undefined) appConfig.tgBotToken = tgBotToken;
  if(tgChatId !== undefined) appConfig.tgChatId = tgChatId;
  saveState();
  res.json({ status: 'ok', config: appConfig });
});

app.post('/api/action', async (req, res) => {
  const { action, payload } = req.body;
  
  if (action === 'setMode') {
    mode = payload.mode;
    addLog(`Modo cambiado a: ${mode.toUpperCase()}`, 'warn');
  } else if (action === 'start') {
    monitorOn = true; 
    monitorInterval = payload.interval || 15;
    addLog(`🚀 Monitor VPS activo — ${monitorInterval}s`, 'info');
    startLoop();
    
  } else if (action === 'stop') {
    monitorOn = false;
    addLog('⏹ Monitor VPS detenido', 'warn');
    
  } else if (action === 'addWatch') {
    watchItems.push(payload);
    addLog(`👁 ${payload.symbol} agregado a vigilancia`, 'info');
    
  } else if (action === 'removeWatch') {
    watchItems.splice(payload.index, 1);
    
  } else if (action === 'clearWatch') {
    watchItems = payload.items; // limpia los completados o todos
    
  } else if (action === 'closeTrade') {
    const wi = payload.index;
    const w = watchItems[wi];
    if (w) {
      const filled = w.orders.filter(o => o.status === 'filled');
      if (filled.length) {
        const inv = filled.reduce((a, o) => a + o.amount, 0);
        const avg = filled.reduce((a, o) => a + o.price * o.amount, 0) / inv;
        const cp = w.currentPrice || w.cp;
        const pnl = inv * (cp - avg) / avg;
        
        if (mode === 'real') await mxRealOrder(w.symbol, 'SELL', inv + pnl, cp);
        if (mode !== 'real') SIM.balance += inv + pnl;
        SIM.pnl += pnl;
        if (pnl > 0) SIM.wins++; else SIM.losses++;
        SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: cp, pnl, pnlPct: ((cp - avg) / avg * 100).toFixed(2), at: Date.now() });
        
        watchItems.splice(wi, 1);
        addLog(`💰 CERRADO MANUAL ${w.symbol} · P&L $${pnl.toFixed(2)}`, 'sell');
      }
    }
    
  } else if (action === 'manualFill') {
    const w = watchItems[payload.wi];
    const o = w.orders[payload.oi];
    const cp = w.currentPrice || w.cp;
    
    o.status = 'filled'; 
    o.filledAt = Date.now(); 
    o.filledPrice = cp;
    if (!w.filledBuys) w.filledBuys = [];
    w.filledBuys.push({ price: cp, amount: o.amount, level: o.level });
    
    SIM.balance -= o.amount; 
    SIM.totalExec++;
    
    if (o.level === 1 || !w.slPrice) {
      w.slPrice = o.price * (1 - (o.sl || 10)/100);
      w.tp1Price = o.price * (1 + (o.tp1 || 8)/100);
      w.tp2Price = o.price * (1 + (o.tp2 || 15)/100);
    }
    addLog(`✅ Manual ${w.symbol} #${o.level}: $${fpZ(cp,cp)}`, 'buy');
    
  } else if (action === 'unFill') {
    const w = watchItems[payload.wi];
    const o = w.orders[payload.oi];
    SIM.balance += o.amount; 
    SIM.totalExec = Math.max(0, SIM.totalExec - 1);
    w.filledBuys = (w.filledBuys || []).filter(b => b.level !== o.level);
    o.status = 'pending'; 
    delete o.filledAt; delete o.filledPrice;
    if (w.filledBuys.length === 0) { w.slPrice = null; w.tp1Price = null; w.tp2Price = null; }
    
  } else if (action === 'editOrder') {
    const w = watchItems[payload.wi];
    const o = w.orders[payload.oi];
    Object.assign(o, payload.updates);
    if (payload.slHits && w.filledBuys?.length) {
       w.slPrice = (w.filledBuys[0].price || o.price) * (1 - o.sl / 100);
       w.tp1Price = (w.filledBuys[0].price || o.price) * (1 + o.tp1 / 100);
    }
    addLog(`✏️ Orden #${o.level} de ${w.symbol} editada.`, 'info');
    
  } else if (action === 'addOrder') {
    const w = watchItems[payload.wi];
    w.orders.push(payload.order);
    addLog(`✏️ Nueva orden a ${w.symbol}: $${payload.order.price}`, 'info');
    
  } else if (action === 'clearLogs') {
    logs = [];
  }
  
  saveState();
  res.json({ status: 'ok' });
});


// ============================================
// INICIO DEL SERVIDOR EXPRESS / VITE
// ============================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Desarrollo: Usar Vite como middleware para servir React/HTML
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Producción: Servir archivos estáticos de /dist o / si no existe
    const distPath = path.join(__dirname, "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
    } else {
      app.use(express.static(__dirname));
      app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 SERVIDOR VPS INICIADO 24/7 en puerto ${PORT}`);
    console.log(`📂 Panel de control accesible vía IP pública:${PORT} o enlace generado.`);
  });
}

startServer();
