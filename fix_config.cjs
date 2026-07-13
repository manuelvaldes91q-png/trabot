const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const originalConfigHtml = `
      <div style="font-weight:700;margin-bottom:15px;color:var(--t);font-size:16px;">⚙️ Configuración del Servidor VPS</div>
      <div style="margin-bottom:15px;font-size:11px;color:var(--t2)">
        Estos datos se guardarán cifrados en el servidor. Son necesarios sí deseas operar automáticamente en tu cuenta principal o recibir alertas en tu grupo de Telegram.
      </div>
      
      <div style="margin-bottom:10px">
        <div style="font-size:10px;color:var(--t2);margin-bottom:4px">MEXC API Key (Lectura/Trading)</div>
        <input type="text" id="cfgMexcKey" class="inp" placeholder="mx0vvlv..." style="width:100%">
      </div>
      <div style="margin-bottom:15px">
        <div style="font-size:10px;color:var(--t2);margin-bottom:4px">MEXC API Secret</div>
        <input type="password" id="cfgMexcSecret" class="inp" placeholder="********" style="width:100%">
      </div>

      <!-- SECCIÓN SOLANA -->
      <div style="border-top:1px solid var(--bdr);margin-top:15px;padding-top:15px;margin-bottom:15px">
        <div style="font-weight:600;color:var(--pu);font-size:11px;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">🔑 Configuración de Solana (DEX Swaps)</div>
        <div style="margin-bottom:10px">
          <div style="font-size:10px;color:var(--t2);margin-bottom:4px">Solana Private Key (Phantom/Base58)</div>
          <input type="password" id="cfgSolKey" class="inp" placeholder="5K..." style="width:100%">
        </div>
        <div style="margin-bottom:10px;display:flex;gap:10px">
          <div style="flex:1">
            <div style="font-size:10px;color:var(--t2);margin-bottom:4px">Deslizamiento Máx (%)</div>
            <input type="number" step="0.1" id="cfgSolSlippage" class="inp" placeholder="Ej: 2.5" style="width:100%">
          </div>
          <div style="flex:1">
            <div style="font-size:10px;color:var(--t2);margin-bottom:4px">Tarifa Prioridad (Lamports)</div>
            <select id="cfgSolPriority" class="inp" style="width:100%">
              <option value="auto">Automático (auto)</option>
              <option value="100000">Estándar (100k lamports)</option>
              <option value="500000">Alta prioridad (500k lamports)</option>
              <option value="1500000">Turbo Ultra (1.5M lamports)</option>
            </select>
          </div>
        </div>
      </div>

      <!-- SECCIÓN RUGCHECK (SAFETY) -->
      <div style="border-top:1px solid var(--bdr);margin-top:15px;padding-top:15px;margin-bottom:15px">
        <div style="font-weight:600;color:var(--y);font-size:11px;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">🛡️ Seguridad Anti-Rug (RugCheck)</div>
        <div style="margin-bottom:10px;display:flex;align-items:center;gap:10px;">
          <input type="checkbox" id="cfgSafetyCheckEnabled" style="cursor:pointer">
          <label for="cfgSafetyCheckEnabled" style="font-size:11px;color:var(--t1);cursor:pointer;">Habilitar Chequeo de Seguridad en Compras</label>
        </div>
        <div style="margin-bottom:10px;display:flex;align-items:center;gap:10px;">
          <input type="checkbox" id="cfgUseJitoBundle" style="cursor:pointer">
          <label for="cfgUseJitoBundle" style="font-size:11px;color:var(--t1);cursor:pointer;">Habilitar Jito Bundles (Protección Anti-Sandwich)</label>
        </div>
        <div style="font-size:9px;color:var(--t2);">Evita compras de tokens marcados como Danger en RugCheck o con Autoridad de Mint/Freeze activa on-chain.</div>
      </div>
      
      <div style="display:flex;gap:10px;margin-bottom:20px">
        <button class="btn btn-g" style="flex:1" onclick="saveConfig()">💾 Guardar Configuración</button>
        <button class="btn btn-d" style="flex:1" onclick="switchTab('dashboard')">❌ Cerrar</button>
      </div>
`;

const originalCopilotHtml = `
      <!-- SECCIÓN COPILOTO AUTO-TRADING -->
      <div style="border-top:1px solid var(--bdr);margin-top:15px;padding-top:15px;margin-bottom:15px">
        <div style="font-weight:600;color:#14f195;font-size:11px;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">🤖 Copiloto Auto-Trading (Autopilot)</div>
        <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px;">
          <input type="checkbox" id="cfgAutoTraderEnabled" style="cursor:pointer">
          <label for="cfgAutoTraderEnabled" style="font-size:11px;color:var(--t1);cursor:pointer;font-weight:600;">Habilitar Piloto Automático</label>
        </div>
        <div style="margin-bottom:10px;display:flex;gap:10px">
          <div style="flex:1">
            <div style="font-size:10px;color:var(--t2);margin-bottom:4px">Monto por Operación ($)</div>
            <input type="number" id="cfgAutoTraderAmount" class="inp" placeholder="50" style="width:100%">
          </div>
          <div style="flex:1">
            <div style="font-size:10px;color:var(--t2);margin-bottom:4px">Volumen Min 24H ($)</div>
            <input type="number" id="cfgAutoTraderMin24HVol" class="inp" placeholder="50000" style="width:100%">
          </div>
        </div>
        <div style="margin-bottom:10px;display:flex;gap:10px">
          <div style="flex:1">
            <div style="font-size:10px;color:var(--t2);margin-bottom:4px">MarketCap Min ($)</div>
            <input type="number" id="cfgAutoTraderMinMarketCap" class="inp" placeholder="200000" style="width:100%">
          </div>
          <div style="flex:1">
            <div style="font-size:10px;color:var(--t2);margin-bottom:4px">MarketCap Max ($)</div>
            <input type="number" id="cfgAutoTraderMaxMarketCap" class="inp" placeholder="2000000" style="width:100%">
          </div>
        </div>
        <div style="margin-bottom:10px;display:flex;gap:10px">
          <div style="flex:1">
            <div style="font-size:10px;color:var(--t2);margin-bottom:4px">Antigüedad Min (Hrs)</div>
            <input type="number" id="cfgAutoTraderMinAge" class="inp" placeholder="48" style="width:100%">
          </div>
          <div style="flex:1">
            <div style="font-size:10px;color:var(--t2);margin-bottom:4px">Antigüedad Max (Hrs)</div>
            <input type="number" id="cfgAutoTraderMaxAge" class="inp" placeholder="500" style="width:100%">
          </div>
        </div>
        <div style="margin-bottom:10px;display:flex;gap:10px">
          <div style="flex:1">
            <div style="font-size:10px;color:var(--t2);margin-bottom:4px">Liquidez Min ($)</div>
            <input type="number" id="cfgAutoTraderMinLiq" class="inp" placeholder="2000" style="width:100%">
          </div>
          <div style="flex:1">
            <div style="font-size:10px;color:var(--t2);margin-bottom:4px">Stop Loss (%)</div>
            <input type="number" id="cfgAutoTraderStopLoss" class="inp" placeholder="10" style="width:100%">
          </div>
        </div>
        <div style="margin-bottom:10px;display:flex;gap:10px">
          <div style="flex:1">
            <div style="font-size:10px;color:var(--t2);margin-bottom:4px">Take Profit 1 (%)</div>
            <input type="number" id="cfgAutoTraderTakeProfit1" class="inp" placeholder="8" style="width:100%">
          </div>
          <div style="flex:1">
            <div style="font-size:10px;color:var(--t2);margin-bottom:4px">Take Profit 2 (%)</div>
            <input type="number" id="cfgAutoTraderTakeProfit2" class="inp" placeholder="15" style="width:100%">
          </div>
        </div>
        <div style="font-size:9px;color:var(--t2);">El Copiloto busca automáticamente tokens en DexScreener según estos filtros, analiza su seguridad (RugCheck), calcula la pared de soporte más fuerte de su liquidez, y programa DCA órdenes automáticas sin duplicar activos.</div>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:20px">
        <button class="btn btn-g" style="flex:1" onclick="saveConfig()">💾 Guardar Configuración</button>
        <button class="btn btn-d" style="flex:1" onclick="switchTab('dashboard')">❌ Cerrar</button>
      </div>
`;

// Now replace the content of tab-config and tab-copilot with the proper html
html = html.replace(/<div class="tab-panel" id="tab-config" style="display:none; padding:20px;">([\s\S]*?)<\/div>\n<\/div>\n<div class="tab-panel" id="tab-history"/, '<div class="tab-panel" id="tab-config" style="display:none; padding:20px;">\n  <div style="background:var(--bg2);width:100%;max-width:800px;margin:0 auto;border:1px solid var(--bdr);border-radius:8px;padding:25px;font-family:var(--sans);">\n' + originalConfigHtml + '\n  </div>\n</div>\n<div class="tab-panel" id="tab-history"');

html = html.replace(/<div class="tab-panel" id="tab-copilot" style="display:none; padding:20px;">([\s\S]*?)<\/div>\n<\/div>\n<div class="tab-panel" id="tab-config"/, '<div class="tab-panel" id="tab-copilot" style="display:none; padding:20px;">\n  <div style="background:var(--bg2);width:100%;max-width:800px;margin:0 auto;border:1px solid var(--bdr);border-radius:8px;padding:25px;font-family:var(--sans);">\n' + originalCopilotHtml + '\n  </div>\n</div>\n<div class="tab-panel" id="tab-config"');

fs.writeFileSync('index.html', html);
console.log('Fixed config and copilot html');
