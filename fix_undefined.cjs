const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const missingTelegram = `
      <div style="border-top:1px solid var(--bdr);margin-top:15px;padding-top:15px;margin-bottom:15px">
        <div style="font-weight:600;color:var(--b);font-size:11px;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">💬 Telegram Alerts</div>
        <div style="margin-bottom:10px">
          <div style="font-size:10px;color:var(--t2);margin-bottom:4px">Telegram Bot Token</div>
          <input type="text" id="cfgTgToken" class="inp" placeholder="Ej: 123456789:ABCDefgh..." style="width:100%">
        </div>
        <div style="margin-bottom:10px">
          <div style="font-size:10px;color:var(--t2);margin-bottom:4px">Telegram Chat ID</div>
          <input type="text" id="cfgTgChat" class="inp" placeholder="-100xxxxxxx" style="width:100%">
        </div>
        <div style="margin-bottom:10px">
          <button id="btnTestTg" class="btn btn-b" style="width:100%;font-size:10px;padding:6px 12px;margin-top:5px" onclick="testTelegramConnection(this)">🔌 Probar Mensaje de Telegram</button>
        </div>
      </div>
      <!-- SECCIÓN DEXTOOLS -->
      <div style="border-top:1px solid var(--bdr);margin-top:15px;padding-top:15px;margin-bottom:15px">
        <div style="font-weight:600;color:#38bdf8;font-size:11px;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">📊 DEXTools API (Opcional)</div>
        <div style="margin-bottom:10px">
          <div style="font-size:10px;color:var(--t2);margin-bottom:4px">DEXTools API Key (Para Sincronización oficial)</div>
          <input type="password" id="cfgDextoolsKey" class="inp" placeholder="Dejar vacío para usar GeckoTerminal gratis" style="width:100%">
        </div>
      </div>
      
      <!-- SECCIÓN TWITTER -->
      <div style="border-top:1px solid var(--bdr);margin-top:15px;padding-top:15px;margin-bottom:15px">
        <div style="font-weight:600;color:#1da1f2;font-size:11px;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">🐦 Twitter (X) API</div>
        <div style="margin-bottom:10px">
          <div style="font-size:10px;color:var(--t2);margin-bottom:4px">Twitter Bearer Token (Para análisis de Scam/Bullish)</div>
          <input type="password" id="cfgTwitterKey" class="inp" placeholder="AAAAAAAAAAAAAAAAAAAAA..." style="width:100%">
        </div>
      </div>
      
      <div style="display:flex;gap:10px;margin-bottom:20px">
        <button class="btn btn-g" style="flex:1" onclick="saveConfig()">💾 Guardar Configuración</button>
        <button class="btn btn-d" style="flex:1" onclick="switchTab('dashboard')">❌ Cerrar</button>
      </div>
`;

html = html.replace('<!-- SECCIÓN TELEGRAM ALERTS -->undefined', missingTelegram);

const missingCopilotEnd = `
        <div style="font-size:9px;color:var(--t2);">El Copiloto busca automáticamente tokens en DexScreener según estos filtros, analiza su seguridad (RugCheck), calcula la pared de soporte más fuerte de su liquidez, y programa DCA órdenes automáticas sin duplicar activos.</div>
      </div>
      <div style="display:flex;gap:10px;margin-bottom:20px">
        <button class="btn btn-g" style="flex:1" onclick="saveConfig()">💾 Guardar Configuración</button>
        <button class="btn btn-d" style="flex:1" onclick="switchTab('dashboard')">❌ Cerrar</button>
      </div>
`;
html = html.replace('<!-- SECCIÓN COPILOTO AUTO-TRADING -->undefined', '<!-- SECCIÓN COPILOTO AUTO-TRADING -->\n' + missingCopilotEnd);

fs.writeFileSync('index.html', html);
