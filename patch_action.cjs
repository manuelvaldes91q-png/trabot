const fs = require('fs');
let svr = fs.readFileSync('server.js', 'utf8');

const actionEndpoint = `
// Endpoint para acciones desde la interfaz de administrador
app.post('/api/action', adminAuth, (req, res) => {
  const { action, payload } = req.body;
  if (!action) return res.status(400).json({error: 'Action required'});

  try {
    if (action === 'setMode') {
      if (payload.mode) {
        mode = payload.mode;
        addLog(\`Modo cambiado a: \${mode.toUpperCase()}\`, 'warn');
      }
      if (payload.solMode) {
        solMode = payload.solMode;
        addLog(\`Modo Solana cambiado a: \${solMode === 'sim' ? 'SIMULADO' : (solMode === 'wallet' ? 'WALLET REAL' : 'POOL REAL')}\`, 'warn');
      }
    } else if (action === 'start') {
      monitorOn = true;
      if (payload.interval) monitorInterval = payload.interval;
      addLog(\`▶️ Monitor INICIADO (\${monitorInterval}s)\`, 'info');
      startLoop();
    } else if (action === 'stop') {
      monitorOn = false;
      addLog(\`⏸️ Monitor DETENIDO\`, 'warn');
    } else if (action === 'updateInterval') {
      monitorInterval = payload.interval;
      addLog(\`⏱️ Intervalo cambiado a \${monitorInterval}s\`, 'info');
      startLoop();
    } else if (action === 'addWatch') {
      watchItems.push(payload);
      addLog(\`👀 Moneda agregada: \${payload.symbol}\`, 'info');
    } else if (action === 'removeWatch') {
      watchItems.splice(payload.index, 1);
    } else if (action === 'clearWatch') {
      watchItems = payload.items || [];
      addLog(\`🧹 Watchlist limpiada\`, 'info');
    } else if (action === 'addOrder') {
      if (watchItems[payload.wi]) {
        watchItems[payload.wi].orders.push(payload.order);
      }
    } else if (action === 'editOrder') {
      if (watchItems[payload.wi] && watchItems[payload.wi].orders[payload.oi]) {
        Object.assign(watchItems[payload.wi].orders[payload.oi], payload.updates);
      }
    } else if (action === 'manualFill') {
      if (watchItems[payload.wi] && watchItems[payload.wi].orders[payload.oi]) {
        const w = watchItems[payload.wi];
        const o = w.orders[payload.oi];
        o.status = 'done';
        SIM.balance -= o.amount;
        addLog(\`✅ Orden manual FILL: \${w.symbol} a $\${o.price}\`, 'buy');
      }
    } else if (action === 'resumeOrder') {
      if (watchItems[payload.wi] && watchItems[payload.wi].orders[payload.oi]) {
        watchItems[payload.wi].orders[payload.oi].status = 'pending';
      }
    } else if (action === 'unFill') {
      if (watchItems[payload.wi] && watchItems[payload.wi].orders[payload.oi]) {
        const o = watchItems[payload.wi].orders[payload.oi];
        o.status = 'pending';
        SIM.balance += o.amount;
      }
    } else if (action === 'closeTrade') {
      if (watchItems[payload.index]) {
        const w = watchItems[payload.index];
        let totalInv = 0;
        w.orders.forEach(o => { if (o.status === 'done') { totalInv += o.amount; o.status = 'closed'; } });
        SIM.balance += totalInv; 
        addLog(\`📉 Posición cerrada manualmente: \${w.symbol}\`, 'sell');
      }
    } else if (action === 'resetSim') {
      SIM.balance = 1000;
      SIM.solBalance = 10;
      SIM.pnl = 0;
      SIM.wins = 0;
      SIM.losses = 0;
      SIM.totalExec = 0;
      if (payload.clearLogs) logs.length = 0;
    } else if (action === 'quickMarketBuy') {
      // Opcional: implementar compras a mercado rápido aquí
    }
    
    saveState();
    res.json({ ok: true, status: 'ok' });
  } catch(e) {
    console.error("Error en /api/action:", e);
    res.status(500).json({ error: e.message });
  }
});
`;

if (!svr.includes("app.post('/api/action'")) {
  svr = svr.replace(/app\.post\('\/api\/login'/, actionEndpoint + '\napp.post(\'/api/login\'');
  fs.writeFileSync('server.js', svr);
  console.log("Injected /api/action endpoint successfully!");
} else {
  console.log("Endpoint already exists.");
}
