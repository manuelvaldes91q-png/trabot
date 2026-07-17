import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import "dotenv/config";
import { Connection, Keypair, VersionedTransaction, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, getAccount, createCloseAccountInstruction, createAssociatedTokenAccountInstruction, getMint, TOKEN_2022_PROGRAM_ID, getExtensionTypes, ExtensionType } from '@solana/spl-token';
import bs58 from 'bs58';

const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUERdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

function deserializeMetadata(accountInfo) {
  const buf = accountInfo.data;
  let offset = 1 + 32 + 32;
  function readString() {
    const len = buf.readUInt32LE(offset);
    offset += 4;
    const str = buf.slice(offset, offset + len).toString('utf8').replace(/\0/g, '').trim();
    offset += len;
    return str;
  }
  const name = readString();
  const symbol = readString();
  const uri = readString();
  offset += 2;
  const hasCreators = buf.readUInt8(offset);
  offset += 1;
  if (hasCreators === 1) {
    const creatorsLen = buf.readUInt32LE(offset);
    offset += 4;
    offset += creatorsLen * 34;
  }
  offset += 1;
  const isMutable = buf.readUInt8(offset) === 1;
  return { name, symbol, uri, isMutable };
}

import * as phoenix from '@ellipsis-labs/phoenix-sdk';
import https from "https";
import http from "http";
import bcrypt from 'bcryptjs';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Middleware de autenticación para rutas admin que mueven fondos reales.
// Reutiliza la MISMA contraseña que ya usa /api/login (appConfig.appPassword /
// APP_PASSWORD), enviada como Authorization: Bearer <password> — que es
// exactamente lo que el frontend (myFetch) ya manda en cada request.
function adminAuth(req, res, next) {
  const pwd = appConfig.appPassword || process.env.APP_PASSWORD || 'admin123';
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ') || auth.substring(7) !== pwd) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

const PORT = 3000;

function httpsFetch(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(urlStr);
      const isHttps = urlObj.protocol === 'https:';
      const lib = isHttps ? https : http;
      
      const headers = { ...options.headers };
      let body = options.body;
      
      if (body) {
        if (typeof body !== 'string' && !Buffer.isBuffer(body)) {
          body = JSON.stringify(body);
        }
        if (!headers['Content-Length'] && !headers['content-length']) {
          headers['Content-Length'] = Buffer.byteLength(body);
        }
      }
      
      const reqOptions = {
        method: options.method || 'GET',
        headers,
        timeout: options.timeout || 10000,
      };
      
      const req = lib.request(urlObj, reqOptions, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const textContent = buffer.toString('utf8');
          
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            headers: {
              get: (name) => {
                const val = res.headers[name.toLowerCase()];
                return Array.isArray(val) ? val.join(', ') : val;
              },
            },
            text: async () => textContent,
            json: async () => JSON.parse(textContent),
          });
        });
      });
      
      req.on('error', (err) => {
        reject(err);
      });
      
      req.on('timeout', () => {
        req.destroy(new Error('Request timeout'));
      });
      
      if (body) {
        req.write(body);
      }
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function fetchWithRetry(url, options = {}, retries = 3, initialDelay = 1000) {
  const timeoutMs = options.timeout || 10000;
  const fetchOptions = { ...options };
  delete fetchOptions.timeout;
  delete fetchOptions.signal;

  let lastResponse;
  let delay = initialDelay;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await httpsFetch(url, { ...fetchOptions, timeout: timeoutMs });
      lastResponse = response;

      if (response.ok) {
        return response;
      }
      
      if (response.status === 429 || response.status >= 500) {
        console.warn(`Fetch to ${url} returned status ${response.status}. Retrying... (${i + 1}/${retries})`);
        // Exponential backoff for 429
        if (response.status === 429) {
          delay *= 2;
        }
      } else {
        return response;
      }
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`Fetch to ${url} failed: ${err.message}. Retrying in ${delay}ms... (${i + 1}/${retries})`);
    }
    
    if (i < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  return lastResponse;
}

// ============================================
// STATE DEL BOT (SE MANTIENE EN LA MEMORIA RAM Y SE GUARDA EN ARCHIVO)
// ============================================
let SIM = { balance: 1000, solBalance: 10, initBal: 1000, trades: [], pnl: 0, wins: 0, losses: 0, totalExec: 0 };
let watchItems = [];
let autopilotTradedMints = [];
let autopilotRejectedMints = {}; // { mintAddress: timestampMs }
const AUTOPILOT_REJECT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 horas
let logs = [];
let monitorOn = false;
let monitorInterval = 15;
let cycleN = 0;
let mode = 'simulated';
let solMode = 'sim'; // 'sim' o 'wallet'
let appConfig = {
  appPassword: 'admin123',
  mexcApiKey: process.env.MEXC_API_KEY || '',
  mexcApiSecret: process.env.MEXC_API_SECRET || '',
  tgBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  tgChatId: process.env.TELEGRAM_CHAT_ID || '',
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY || '',
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com',
  solanaBaseToken: process.env.SOLANA_BASE_TOKEN || 'SOL',
  solanaSlippage: process.env.SOLANA_SLIPPAGE ? parseFloat(process.env.SOLANA_SLIPPAGE) : 2.5,
  solanaPriorityFee: process.env.SOLANA_PRIORITY_FEE || 'auto',
  dextoolsApiKey: process.env.DEXTOOLS_API_KEY || '',
  
  // Auto-Pilot default configuration
  autoTraderEnabled: false,
  autoTraderAmount: 50,
  autoTraderMin24HVol: 50000,
  autoTraderMinMarketCap: 200000,
  autoTraderMaxMarketCap: 2000000,
  autoTraderMinAge: 48,
  autoTraderMaxAge: 500,
  autoTraderMinLiq: 2000,
  autoTraderStopLoss: 10,
  autoTraderTakeProfit1: 8,
  autoTraderTakeProfit2: 15
};

let poolConfig = {
  walletAddress: '',
  commissionRate: 0.20,
  investors: [],
  totalCommissionEarned: 0
};

function getSafePoolConfig() {
  const safe = { ...poolConfig };
  delete safe.privateKey;
  if (safe.investors) {
    safe.investors = safe.investors.map(inv => {
      const s = { ...inv };
      delete s.depositWalletPk;
      delete s.password;
      return s;
    });
  }
  return safe;
}

function distributePnL(pnl) {
  if (!pnl || pnl === 0) return;
  if (!poolConfig.investors || poolConfig.investors.length === 0) return;
  
  const totalDeposits = poolConfig.investors.reduce((sum, inv) => sum + (inv.deposit || 0), 0);
  if (totalDeposits <= 0) return;

  const adminCommission = pnl > 0 ? (pnl * poolConfig.commissionRate) : 0;
  
  if (pnl > 0) {
    // El admin comisiona un porcentaje (e.g., 20%) de la ganancia del trader.
    // De esa comisión del admin (adminCommission), calculamos el 3% para auto-abastecer SOL para fees.
    const feeReserveShare = adminCommission * 0.03;
    const adminNetShare = adminCommission - feeReserveShare;
    
    poolConfig.totalCommissionEarned = (poolConfig.totalCommissionEarned || 0) + adminNetShare;
    poolConfig.solFeeReserve = (poolConfig.solFeeReserve || 0) + feeReserveShare;
    
    // Si la reserva acumula al menos 1 USDC (mínimo para un swap razonable en Júpiter), se ejecuta el swap a SOL.
    if (poolConfig.solFeeReserve >= 1 && poolConfig.privateKey) {
      // Trigger async swap
      swapUSDCToSOLForFees(poolConfig.solFeeReserve);
      poolConfig.solFeeReserve = 0;
    }
  }
  
  const netPnL = pnl > 0 ? (pnl - adminCommission) : pnl;
  
  for (let inv of poolConfig.investors) {
    const share = (inv.deposit || 0) / totalDeposits;
    const invNetPnL = netPnL * share;
    inv.profit = (inv.profit || 0) + invNetPnL;
    
    if (solMode !== 'pool') {
       // Si NO es modo pool, el saldo es virtual y se suma aquí.
       // Si es modo pool, el saldo real se sincroniza de la wallet. Pero temporalmente lo sumamos para la UI:
       inv.deposit = (inv.deposit || 0) + invNetPnL;
    } else {
       inv.deposit = (inv.deposit || 0) + invNetPnL;
       
       if (pnl > 0 && inv.depositWalletPk && poolConfig.walletAddress) {
          const invAdminFee = (pnl * share) * poolConfig.commissionRate;
          if (invAdminFee > 0) {
              transferAdminCommission(inv, invAdminFee).catch(e => console.error(e));
          }
       }
    }
  }
}

async function swapUSDCToSOLForFees(amountUSDC) {
  try {
    addLog(`🔄 Auto-abasteciendo SOL para fees del pool (${amountUSDC.toFixed(2)} USDC)...`, 'info');
    const w = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', network: 'solana' };
    const adminPk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
    const realRes = await executeSolanaTradeInternal(w, 'BUY', amountUSDC, 0, adminPk, adminPk);
    if (realRes && realRes.ok) {
      addLog(`✅ Auto-abastecimiento de SOL completado.`, 'buy');
    }
  } catch (e) {
    console.error('Error auto abasteciendo SOL:', e);
  }
}
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

function formatTradeTelegramMessage(msg, type) {
  try {
    const isBuy = type === 'buy' || msg.includes('COMPRA') || msg.includes('Buy') || msg.includes('buy');
    const isSell = type === 'sell' || type === 'sl_' || type === 'tp' || msg.includes('CERRADO') || msg.includes('Stop Loss') || msg.includes('SL') || msg.includes('Cerrado');

    if (!isBuy && !isSell) {
      return `[⚙️ ${mode.toUpperCase()}] ${msg}`;
    }

    let platform = 'MEXC';
    if (msg.includes('SOLANA') || msg.includes('Solana')) {
      platform = 'Solana';
    }

    const currentMode = mode === 'real' ? 'REAL' : 'SIMULADO';
    let solanaSubmode = '';
    if (platform === 'Solana' && mode === 'real') {
      solanaSubmode = ` (${solMode === 'pool' ? 'Pool' : 'Wallet'})`;
    }

    let symbol = 'N/A';
    let actionText = '';
    let priceText = 'N/A';
    let amountText = 'N/A';
    let pnlText = '';
    let emoji = '🔔';

    if (isBuy) {
      emoji = '🟢';
      actionText = 'COMPRA (BUY) 📈';
      
      if (msg.includes('COMPRA INSTANTÁNEA')) {
        const match = msg.match(/de\s+([A-Za-z0-9\-\/]+)\s+por\s+\$([0-9\.]+)\s+a\s+\$([0-9\.]+)/);
        if (match) {
          symbol = match[1];
          amountText = `$${match[2]}`;
          priceText = `$${match[3]}`;
        }
      } else if (msg.includes('AUTO-COMPRA SOLANA COMPLETADA')) {
        const match = msg.match(/COMPLETADA:\s+([A-Za-z0-9\-\/]+)\s+#\d+\s+·\s+\$([0-9\.]+)/);
        if (match) {
          symbol = match[1];
          amountText = `$${match[2]}`;
        }
      } else if (msg.includes('AUTO-COMPRA')) {
        const match = msg.match(/AUTO-COMPRA\s+([A-Za-z0-9\-\/]+)\s+#\d+:\s+\$([0-9\.]+)\s+·\s+\$([0-9\.]+)/);
        if (match) {
          symbol = match[1];
          priceText = `$${match[2]}`;
          amountText = `$${match[3]}`;
        }
      } else if (msg.includes('Manual')) {
        const match = msg.match(/Manual\s+([A-Za-z0-9\-\/]+)\s+#\d+:\s+\$([0-9\.]+)/);
        if (match) {
          symbol = match[1];
          priceText = `$${match[2]}`;
        }
      } else if (msg.includes('Market Buy real exitoso')) {
        const match = msg.match(/exitoso para\s+([A-Za-z0-9\-\/]+)/);
        if (match) {
          symbol = match[1];
        }
      }
      
      if (symbol === 'N/A') {
        for (let w of watchItems) {
          if (msg.includes(w.symbol)) {
            symbol = w.symbol;
            break;
          }
        }
      }
    } else {
      if (type === 'sl_' || msg.includes('SL') || msg.includes('Stop Loss')) {
        emoji = '🔴';
        actionText = 'VENTA / STOP LOSS ❌';
      } else if (type === 'tp' || msg.includes('TP') || msg.includes('Take Profit')) {
        emoji = '🎯';
        actionText = 'VENTA / TAKE PROFIT ⭐';
      } else {
        emoji = '🔵';
        actionText = 'VENTA / CIERRE 📉';
      }

      const sellRegex = /(?:SL|TP\d+|CERRADO|CERRADO MANUAL)(?:\s+SOLANA)?(?:\s+CERRADO)?\s+([A-Za-z0-9\-\/]+)\s+\(Entrada:\s+\$([0-9\.]+)\s+➡\s+Salida:\s+\$([0-9\.]+)\)\s+·\s+P&L\s+([^\s]+)(?:\s+\(([^\s]+)\))?/i;
      const match = msg.match(sellRegex);
      if (match) {
        symbol = match[1];
        const entryVal = match[2];
        const exitVal = match[3];
        const pnlVal = match[4].replace('$', '').trim();
        const pnlPctVal = match[5] ? match[5].trim() : '';

        priceText = `Entrada: $${entryVal} ➡ Salida: $${exitVal}`;
        
        const isPositive = !pnlVal.includes('-');
        const pnlSign = isPositive ? '+' : '';
        const pnlColor = isPositive ? '🟩' : '🟥';
        
        pnlText = `${pnlColor} <b>P&L:</b> ${pnlSign}$${pnlVal.replace('-', '')} (${pnlPctVal ? pnlPctVal : ''})`;
      } else {
        for (let w of watchItems) {
          if (msg.includes(w.symbol)) {
            symbol = w.symbol;
            break;
          }
        }
      }
    }

    let text = `${emoji} <b>NOTIFICACIÓN DE OPERACIÓN (${currentMode}${solanaSubmode})</b>\n\n`;
    text += `<b>📈 Acción:</b> ${actionText}\n`;
    text += `<b>🌐 Red:</b> ${platform}\n`;
    text += `<b>🪙 Token:</b> <b>${symbol}</b>\n`;
    if (priceText !== 'N/A') {
      if (isSell) {
        text += `<b>🚪 Precios:</b> <code>${priceText}</code>\n`;
      } else {
        text += `<b>💰 Precio:</b> <code>${priceText}</code>\n`;
      }
    }
    if (amountText !== 'N/A') {
      text += `<b>💵 Monto:</b> <code>${amountText}</code>\n`;
    }
    if (pnlText) {
      text += `${pnlText}\n`;
    }
    
    text += `\n<i>🤖 Original: ${msg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</i>`;
    return text;
  } catch (e) {
    console.error('Error formatting Telegram message:', e);
    return `[⚙️ ${mode.toUpperCase()}] ${msg}`;
  }
}

function addLog(msg, type='info') {
  const t = new Date().toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  logs.unshift({ t, msg, type });
  if (logs.length > 200) logs.length = 200;
  console.log(`[${t}] ${msg}`);
  if (['buy', 'sell', 'tp', 'sl_'].includes(type) || msg.includes('Modo cambiado') || msg.includes('activo')) {
    const formatted = formatTradeTelegramMessage(msg, type);
    sendTelegram(formatted);
  }
}

const STATE_FILE = path.join(__dirname, 'bot-state.json');

function saveState() {
  try {
    const tmp = STATE_FILE + '.tmp';
    const safePoolConfig = { ...poolConfig };
    delete safePoolConfig.privateKey;

    const safeAppConfig = { ...appConfig };
    delete safeAppConfig.solanaPrivateKey;
    delete safeAppConfig.mexcApiSecret;
    delete safeAppConfig.appPassword;
    delete safeAppConfig.tgBotToken;
    delete safeAppConfig.dextoolsApiKey;
    delete safeAppConfig.twitterBearerToken;
    delete safeAppConfig.solanaTrackerApiKey;
    delete safeAppConfig.solanaRpcUrl;

    fs.writeFileSync(tmp, JSON.stringify({ SIM, watchItems, autopilotTradedMints, autopilotRejectedMints, logs, monitorOn, monitorInterval, mode, solMode, appConfig: safeAppConfig, poolConfig: safePoolConfig }));
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
      if (data.autopilotTradedMints) autopilotTradedMints = data.autopilotTradedMints;
      if (data.autopilotRejectedMints) autopilotRejectedMints = data.autopilotRejectedMints;
      if (data.logs) logs = data.logs;
      if (data.monitorOn !== undefined) monitorOn = data.monitorOn;
      if (data.monitorInterval) monitorInterval = data.monitorInterval;
      if (data.mode) mode = data.mode;
      if (data.solMode) solMode = data.solMode;
      if (data.appConfig) appConfig = {...appConfig, ...data.appConfig};
      if (data.poolConfig) {
        const envPrivateKey = process.env.POOL_PRIVATE_KEY || process.env.SOLANA_PRIVATE_KEY || '';
        poolConfig = { ...data.poolConfig, privateKey: envPrivateKey };
      }
      
      watchItems.forEach(w => {
        w.klines1h = []; w.klines1d = [];
        if (!w.orders) w.orders = [];
      });
      console.log(`✅ Estado recuperado: ${watchItems.length} monedas.`);
    } catch (e) {
      console.log('Error cargando estado:', e.message);
    }
  }

  if (!poolConfig.privateKey) {
    const kp = Keypair.generate();
    poolConfig.privateKey = bs58.encode(kp.secretKey);
    poolConfig.walletAddress = kp.publicKey.toBase58();
    console.log("✅ Billetera central del Pool generada automáticamente:", poolConfig.walletAddress);
    console.log(`⚠️ ¡IMPORTANTE! Copia esta private key y agrégala al archivo .env como POOL_PRIVATE_KEY=${poolConfig.privateKey} ya que ya no se persiste en el estado para mayor seguridad.`);
    
    // Backup en telegram
    sendTelegram(`🚨 <b>Backup de Wallet Inicial del Pool</b>\n\nPublic: <code>${poolConfig.walletAddress}</code>\n\nrevisa la consola del servidor para copiar la private key.\n\nPor favor, guarda la private key de forma segura.`);
    
    saveState();
  }
}
loadState();

let phoenixClient = null;
async function initPhoenix() {
  const rpcs = [...getRpcEndpoints(), 'https://api.mainnet-beta.solana.com'];
  
  for (const rpc of rpcs) {
    try {
      const connection = new Connection(rpc);
      phoenixClient = await phoenix.Client.create(connection);
      if (phoenixClient) {
          console.log(`Phoenix client initialized using ${rpc}`);
          return;
      }
    } catch (e) {
      // ignore
    }
  }
  console.log("Phoenix client disabled (RPC init failed)");
}
setTimeout(initPhoenix, 2000);

// ============================================
// API DE MEXC (NATIHVA EN NODE.JS)
// ============================================
let mexcPricesCache = null;
let mexcPricesTime = 0;

async function mxPrice(sym) {
  try {
    const now = Date.now();
    if (now - mexcPricesTime > 1000 || !mexcPricesCache) {
      const r = await fetch(`https://api.mexc.com/api/v3/ticker/price`, { signal: AbortSignal.timeout(5000) });
      const d = await r.json();
      if (Array.isArray(d)) {
        mexcPricesCache = {};
        for(const item of d) {
          mexcPricesCache[item.symbol] = +item.price;
        }
        mexcPricesTime = now;
      }
    }
    return mexcPricesCache ? (mexcPricesCache[`${sym}USDT`] || 0) : 0;
  } catch {
    return 0;
  }
}

// ============================================
// SOLANA INTEGRATION (LIVE PRICE, BALANCES, JUPITER API)
// ============================================
let solanaPricesCache = {}; // maps address -> { price, liquidity, lastFetch }

async function getSolanaPrices(addresses) {
  if (!addresses || !addresses.length) return {};
  try {
    const now = Date.now();
    const toFetch = [];
    const results = {};

    // Deduplicate and trim incoming addresses
    const uniqueAddresses = Array.from(new Set(addresses.map(a => a.trim()).filter(Boolean)));
    if (!uniqueAddresses.length) return {};

    // Check which addresses need a refresh (older than 2 seconds or not in cache)
    for (const addr of uniqueAddresses) {
      const cached = solanaPricesCache[addr];
      if (cached && (now - cached.lastFetch < 2000)) {
        results[addr] = { price: cached.price, liquidity: cached.liquidity };
      } else {
        toFetch.push(addr);
      }
    }

    if (toFetch.length > 0) {
      // If we have a DexTools API key configured, we can fetch from DexTools, otherwise we use GeckoTerminal/DexScreener
      const apiKey = appConfig.dextoolsApiKey || process.env.DEXTOOLS_API_KEY;
      
      if (apiKey) {
        // Try fetching via DexTools API
        for (const addr of toFetch) {
          try {
            // DexTools endpoint for token price: https://public-api.dextools.io/trial/v2/token/solana/{address}/price
            const url = `https://public-api.dextools.io/trial/v2/token/solana/${addr}/price`;
            const r = await fetch(url, {
              headers: { 'x-api-key': apiKey },
              signal: AbortSignal.timeout(5000)
            });
            if (r.ok) {
              const d = await r.json();
              const price = d.data?.price || d.data?.priceUsd || 0;
              const liquidity = d.data?.liquidity || 0;
              solanaPricesCache[addr] = { price: +price, liquidity: +liquidity, lastFetch: now };
              results[addr] = { price: +price, liquidity: +liquidity };
              continue;
            }
          } catch (e) {
            if (e.message !== 'fetch failed' && !e.message.includes('timeout') && !e.message.includes('fetch')) {
              console.warn(`DexTools API fetch failed for ${addr}:`, e.message);
            }
          }
          
          // Fallback to cache or fallback parser for this address
          const cached = solanaPricesCache[addr];
          if (cached) {
            results[addr] = { price: cached.price, liquidity: cached.liquidity };
          }
        }
      } else {
        // Use Jupiter as primary price source (supports 100 max per request, very fast)
        const chunks = [];
        for (let i = 0; i < toFetch.length; i += 100) {
          chunks.push(toFetch.slice(i, i + 100));
        }

        for (const chunk of chunks) {
          let jupiterSuccess = false;
          try {
            const jupUrl = `https://price.jup.ag/v6/price?ids=${chunk.join(',')}`;
            const r = await fetch(jupUrl, { signal: AbortSignal.timeout(4000) });
            if (r.ok) {
              const d = await r.json();
              if (d && d.data) {
                jupiterSuccess = true;
                const chunkResults = {};
                for (const addr of chunk) {
                  const lowerAddr = addr.toLowerCase();
                  const foundKey = Object.keys(d.data).find(k => k.toLowerCase() === lowerAddr);
                  if (foundKey) {
                    const price = +(d.data[foundKey].price || 0);
                    // Retain old liquidity or default 0 (since Jupiter doesn't return liquidity)
                    const liquidity = solanaPricesCache[addr]?.liquidity || 0;
                    solanaPricesCache[addr] = { price, liquidity, lastFetch: now };
                    results[addr] = { price, liquidity };
                    chunkResults[addr] = true;
                  }
                }
                
                // For any address Jupiter missed, try DexScreener (chunk of max 30)
                const missed = chunk.filter(a => !chunkResults[a]);
                if (missed.length > 0) {
                  for (let i = 0; i < missed.length; i += 30) {
                    const dexChunk = missed.slice(i, i + 30);
                    const dexScrUrl = `https://api.dexscreener.com/latest/dex/tokens/${dexChunk.join(',')}`;
                    try {
                      const dexRes = await fetch(dexScrUrl, { signal: AbortSignal.timeout(4000) });
                      if (dexRes.ok) {
                        const dexData = await dexRes.json();
                        const dexParsed = {};
                        if (dexData && dexData.pairs) {
                           dexData.pairs.forEach(p => {
                             if (p.chainId === 'solana' && p.baseToken) {
                               const a = p.baseToken.address;
                               if (!dexParsed[a] || (p.liquidity?.usd || 0) > (dexParsed[a].liquidity || 0)) {
                                 dexParsed[a] = { price: +p.priceUsd, liquidity: p.liquidity?.usd || 0 };
                               }
                             }
                           });
                        }
                        for (const a of dexChunk) {
                           let matched = dexParsed[a];
                           if (!matched) {
                             const lowerA = a.toLowerCase();
                             const fKey = Object.keys(dexParsed).find(k => k.toLowerCase() === lowerA);
                             if (fKey) matched = dexParsed[fKey];
                           }
                           if (matched) {
                             solanaPricesCache[a] = { price: matched.price, liquidity: matched.liquidity, lastFetch: now };
                             results[a] = { price: matched.price, liquidity: matched.liquidity };
                           } else {
                             const cached = solanaPricesCache[a];
                             if (cached) results[a] = { price: cached.price, liquidity: cached.liquidity };
                           }
                        }
                      }
                    } catch (e) {
                      for (const a of dexChunk) {
                        if (solanaPricesCache[a]) results[a] = { price: solanaPricesCache[a].price, liquidity: solanaPricesCache[a].liquidity };
                      }
                    }
                  }
                }
              }
            }
          } catch (e) {
            if (e.message !== 'fetch failed' && !e.message.includes('timeout') && !e.message.includes('fetch')) {
              console.warn(`Jupiter fetch failed, fallback to DexScreener:`, e.message);
            }
          }

          if (!jupiterSuccess) {
            // Full fallback to Dexscreener in chunks of 30 if Jupiter completely failed
            for (let i = 0; i < chunk.length; i += 30) {
              const dexChunk = chunk.slice(i, i + 30);
              const dexScrUrl = `https://api.dexscreener.com/latest/dex/tokens/${dexChunk.join(',')}`;
              try {
                const dexRes = await fetch(dexScrUrl, { signal: AbortSignal.timeout(5000) });
                if (dexRes.ok) {
                  const dexData = await dexRes.json();
                  const dexParsed = {};
                  if (dexData && dexData.pairs) {
                    dexData.pairs.forEach(p => {
                      if (p.chainId === 'solana' && p.baseToken) {
                        const a = p.baseToken.address;
                        if (!dexParsed[a] || (p.liquidity?.usd || 0) > (dexParsed[a].liquidity || 0)) {
                          dexParsed[a] = { price: +p.priceUsd, liquidity: p.liquidity?.usd || 0 };
                        }
                      }
                    });
                  }
                  for (const a of dexChunk) {
                    let matched = dexParsed[a];
                    if (!matched) {
                      const lowerA = a.toLowerCase();
                      const fKey = Object.keys(dexParsed).find(k => k.toLowerCase() === lowerA);
                      if (fKey) matched = dexParsed[fKey];
                    }
                    if (matched) {
                      solanaPricesCache[a] = { price: matched.price, liquidity: matched.liquidity, lastFetch: now };
                      results[a] = { price: matched.price, liquidity: matched.liquidity };
                    } else {
                      const cached = solanaPricesCache[a];
                      if (cached) results[a] = { price: cached.price, liquidity: cached.liquidity };
                    }
                  }
                }
              } catch (e) {
                 for (const a of dexChunk) {
                    if (solanaPricesCache[a]) results[a] = { price: solanaPricesCache[a].price, liquidity: solanaPricesCache[a].liquidity };
                 }
              }
            }
          }
          
          if (chunks.length > 1) await new Promise(res => setTimeout(res, 200));
        }
      }
    }

    return results;
  } catch (err) {
    console.error(`Error fetching solana prices:`, err);
    const results = {};
    const now = Date.now();
    for (const addr of addresses) {
      const cached = solanaPricesCache[addr];
      if (cached) {
        solanaPricesCache[addr].lastFetch = now + 12000; // 12s cooldown
        results[addr] = { price: cached.price, liquidity: cached.liquidity };
      }
    }
    return results;
  }
}

async function getSolanaPrice(tokenAddress) {
  const res = await getSolanaPrices([tokenAddress]);
  return res[tokenAddress]?.price || 0;
}

async function getTokenUiBalance(connection, ownerPubKey, tokenMintStr) {
  try {
    const owner = new PublicKey(ownerPubKey);
    if (tokenMintStr === 'So11111111111111111111111111111111111111112') {
      const nativeBal = await connection.getBalance(owner);
      let wsolBalRaw = 0;
      try {
        const mint = new PublicKey(tokenMintStr);
        const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
        if (accounts && accounts.value && accounts.value.length) {
          wsolBalRaw = Number(accounts.value[0].account.data.parsed.info.tokenAmount.amount);
        }
      } catch (e) {}
      return (nativeBal + wsolBalRaw) / 1e9;
    }
    const mint = new PublicKey(tokenMintStr);
    const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
    if (accounts && accounts.value && accounts.value.length) {
      return accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

async function getTokenBalance(connection, ownerPubKey, tokenMintStr) {
  try {
    const owner = new PublicKey(ownerPubKey);
    if (tokenMintStr === 'So11111111111111111111111111111111111111112') {
      const nativeBal = await connection.getBalance(owner);
      let wsolBalRaw = 0;
      try {
        const mint = new PublicKey(tokenMintStr);
        const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
        if (accounts && accounts.value && accounts.value.length) {
          wsolBalRaw = Number(accounts.value[0].account.data.parsed.info.tokenAmount.amount);
        }
      } catch (e) {}
      return nativeBal + wsolBalRaw;
    }
    const mint = new PublicKey(tokenMintStr);
    const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
    if (accounts && accounts.value && accounts.value.length) {
      const bal = accounts.value[0].account.data.parsed.info.tokenAmount.amount;
      return +bal;
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

async function getEmptyTokenAccounts(connection, ownerPublicKey) {
  const emptyAccounts = [];
  const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const TOKEN_2022_PROGRAM_ID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
  
  try {
    const standardAccounts = await connection.getParsedTokenAccountsByOwner(
      ownerPublicKey,
      { programId: TOKEN_PROGRAM_ID }
    );
    
    for (const acc of standardAccounts.value) {
      const info = acc.account.data.parsed.info;
      const amount = info.tokenAmount.amount;
      if (amount === "0") {
        emptyAccounts.push({
          pubkey: acc.pubkey,
          mint: info.mint,
          programId: TOKEN_PROGRAM_ID
        });
      }
    }
  } catch (e) {
    console.error('Error fetching standard token accounts:', e);
  }

  try {
    const token2022Accounts = await connection.getParsedTokenAccountsByOwner(
      ownerPublicKey,
      { programId: TOKEN_2022_PROGRAM_ID }
    );
    
    for (const acc of token2022Accounts.value) {
      const info = acc.account.data.parsed.info;
      const amount = info.tokenAmount.amount;
      if (amount === "0") {
        emptyAccounts.push({
          pubkey: acc.pubkey,
          mint: info.mint,
          programId: TOKEN_2022_PROGRAM_ID
        });
      }
    }
  } catch (e) {
    console.error('Error fetching Token-2022 accounts:', e);
  }

  return emptyAccounts;
}

async function closeEmptyTokenAccounts(connection, ownerPk, feePayerPk = null) {
  const ownerKeypair = Keypair.fromSecretKey(bs58.decode(ownerPk));
  const feePayerKeypair = feePayerPk ? Keypair.fromSecretKey(bs58.decode(feePayerPk)) : ownerKeypair;

  const emptyAccounts = await getEmptyTokenAccounts(connection, ownerKeypair.publicKey);
  if (emptyAccounts.length === 0) {
    return { success: true, closedCount: 0, solRecovered: 0, txids: [] };
  }

  const txids = [];
  const batchSize = 10;
  
  for (let i = 0; i < emptyAccounts.length; i += batchSize) {
    const batch = emptyAccounts.slice(i, i + batchSize);
    const transaction = new Transaction();
    
    for (const acc of batch) {
      transaction.add(
        createCloseAccountInstruction(
          acc.pubkey,
          ownerKeypair.publicKey,
          ownerKeypair.publicKey,
          [],
          acc.programId
        )
      );
    }
    
    transaction.feePayer = feePayerKeypair.publicKey;
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    
    if (feePayerPk) {
      transaction.sign(ownerKeypair, feePayerKeypair);
    } else {
      transaction.sign(ownerKeypair);
    }
    
    const txid = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(txid, 'confirmed');
    txids.push(txid);
  }

  const solRecovered = emptyAccounts.length * 0.002039;
  return {
    success: true,
    closedCount: emptyAccounts.length,
    solRecovered,
    txids
  };
}

let solanaWalletAddress = '';
let solanaSolBalance = 0;
let solanaUsdcBalance = 0;
let lastSolanaBalanceUpdate = 0;
let solanaSwapLogs = [];

async function updateSolanaWalletInfo() {
  const pk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
  if (!pk) {
    return { ok: false };
  }
  
  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(pk));
    solanaWalletAddress = keypair.publicKey.toString();
    
    const now = Date.now();
    if (now - lastSolanaBalanceUpdate < 10000 && (solMode === 'wallet' || solMode === 'pool')) {
      return;
    }
    
    if (solMode !== 'wallet' && solMode !== 'pool') {
        solanaUsdcBalance = SIM.balance || 1000;
        solanaSolBalance = SIM.solBalance || 10;
        return;
    }
    
    const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    
    const solLamports = await connection.getBalance(keypair.publicKey);
    solanaSolBalance = solLamports / 1e9;
    
    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const usdcBalRaw = await getTokenBalance(connection, solanaWalletAddress, usdcMint);
    solanaUsdcBalance = usdcBalRaw / 1e6;
    
    lastSolanaBalanceUpdate = now;
  } catch (err) {
    console.error('Error actualizando balance Solana VPS:', err.message);
  }
}

async function executeSolanaTrade(w, side, amountUSDT, price) {
  if (solMode !== 'wallet' && solMode !== 'pool') return { ok: true, txid: 'simulated' };

  if (solMode === 'pool') {
     const activeInvestors = poolConfig.investors.filter(i => i.depositStatus === 'active' && i.deposit > 0 && i.depositWalletPk);
     const totalDeposit = activeInvestors.reduce((s, i) => s + (i.deposit || 0), 0);
     if (totalDeposit <= 0) {
        addLog(`⚠️ Pool vacía, trade abortado.`, 'warn');
        return { ok: false };
     }

     let allOk = true;
     let totalExactAmountUSDT = 0;
     let totalTokens = 0;
     const mainTxid = 'pool_multi';

     addLog(`👥 Ejecutando trade ${side} en ${activeInvestors.length} wallets del pool...`, 'info');

     for (const inv of activeInvestors) {
        const invShare = inv.deposit / totalDeposit;
        const invAmountUSDT = amountUSDT * invShare;
        if (invAmountUSDT < 0.5) { 
           addLog(`⏭️ Saltando ${inv.name} por monto muy pequeño (${invAmountUSDT.toFixed(2)})`, 'info');
           continue;
        }

        const adminPk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
        const res = await executeSolanaTradeInternal(w, side, invAmountUSDT, price, inv.depositWalletPk, adminPk);
        if (res.ok) {
           if (res.exactAmountUSDT) totalExactAmountUSDT += res.exactAmountUSDT;
           if (res.exactTokens) totalTokens += res.exactTokens;
        } else {
           allOk = false;
        }

        await new Promise(r => setTimeout(r, 500)); // avoid rate limits
     }

     let avgExactPrice = price;
     if (totalTokens > 0 && totalExactAmountUSDT > 0) avgExactPrice = totalExactAmountUSDT / totalTokens;

     return { ok: allOk, txid: mainTxid, exactAmountUSDT: totalExactAmountUSDT, exactPrice: avgExactPrice, exactTokens: totalTokens };
  } else {
     const pk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
     return await executeSolanaTradeInternal(w, side, amountUSDT, price, pk);
  }
}

async function transferAdminCommission(inv, amountUSDC) {
  if (amountUSDC <= 0) return;
  const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(inv.depositWalletPk));
    const adminPk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
    const adminKeypair = Keypair.fromSecretKey(bs58.decode(adminPk));
    const adminPubKey = adminKeypair.publicKey;
    
    const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    const sourceTokenAccount = await getAssociatedTokenAddress(usdcMint, keypair.publicKey);
    const destTokenAccount = await getAssociatedTokenAddress(usdcMint, adminPubKey);

    const decimals = 6;
    const rawAmount = Math.floor(amountUSDC * (10 ** decimals));

    const tx = new Transaction().add(
       createTransferInstruction(
          sourceTokenAccount,
          destTokenAccount,
          keypair.publicKey,
          rawAmount
       )
    );

    const latestBlockHash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockHash.blockhash;
    tx.feePayer = adminKeypair.publicKey; // Admin pays the SOL fee
    
    tx.sign(keypair, adminKeypair); // Both sign
    const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    
    addLog(`💸 Comisión Admin $${amountUSDC.toFixed(2)} enviada desde ${inv.name} (Tx: ${txid.slice(0,8)}...)`, 'info');
  } catch (err) {
    addLog(`⚠️ Fallo al enviar comisión Admin desde ${inv.name}: ${err.message}`, 'warn');
  }
}

const MIN_SOL_FOR_GAS = 0.015;
const GAS_TOPUP_AMOUNT = 0.02;


async function fetchSolanaTrackerData(tokenMint) {
  const apiKey = appConfig.solanaTrackerApiKey || process.env.SOLANATRACKER_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetchWithRetry(`https://data.solanatracker.io/tokens/${tokenMint}`, {
      headers: { 'x-api-key': apiKey },
      timeout: 8000
    }, 2, 1000);
    if (!res || !res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}


const SNIPE_WINDOW_SECONDS = 60;
const MAX_MINT_SIGNATURES_FOR_SNIPE_CHECK = 2000;

async function detectSnipersAndBundlers(connection, tokenMint, currentHoldersMap) {
  const result = { snipers: 0, bundlers: 0, sniperWalletsCount: 0, bundlerGroups: 0, note: "" };
  try {
    const pubkey = new PublicKey(tokenMint);
    let allSigs = [];
    let before = undefined;
    while (allSigs.length < MAX_MINT_SIGNATURES_FOR_SNIPE_CHECK) {
       const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 1000, before });
       if (sigs.length === 0) break;
       allSigs.push(...sigs);
       before = sigs[sigs.length - 1].signature;
       if (sigs.length < 1000) break;
    }

    if (allSigs.length === 0) return result;
    allSigs.reverse(); // Oldest first
    const creationTime = allSigs[0].blockTime;
    if (!creationTime) return result;

    const earlySigs = allSigs.filter(s => s.blockTime != null && s.blockTime <= creationTime + SNIPE_WINDOW_SECONDS);
    if (earlySigs.length === 0) {
        result.note = "Sin transacciones en los primeros 60s.";
        return result;
    }

    const earlyTransactions = [];
    const checkSigs = earlySigs.slice(0, 25);
    for (const sig of checkSigs) {
        try {
            const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
            if (tx) {
                earlyTransactions.push(tx);
            }
            await new Promise(r => setTimeout(r, 40));
        } catch (txErr) {
            // Ignore individual errors
        }
    }

    const earlyBuyers = new Set();
    for (const tx of earlyTransactions) {
        if (!tx || !tx.meta || tx.meta.err) continue;
        const preBalances = tx.meta.preTokenBalances || [];
        const postBalances = tx.meta.postTokenBalances || [];
        for (const post of postBalances) {
           if (post.mint === tokenMint) {
               const pre = preBalances.find(p => p.accountIndex === post.accountIndex);
               const preAmount = pre ? (pre.uiTokenAmount.uiAmount || 0) : 0;
               const postAmount = post.uiTokenAmount.uiAmount || 0;
               if (postAmount > preAmount && post.owner) {
                   earlyBuyers.add(post.owner);
               }
           }
        }
    }

    if (earlyBuyers.size === 0) return result;

    let snipeTotalPct = 0;
    let snipeWalletsCount = 0;
    const earlyBuyersHolding = [];

    for (const buyer of earlyBuyers) {
       if (currentHoldersMap.has(buyer)) {
           const pct = currentHoldersMap.get(buyer);
           if (pct > 0) {
               snipeTotalPct += pct;
               snipeWalletsCount++;
               earlyBuyersHolding.push(buyer);
           }
       }
    }

    result.snipers = +(snipeTotalPct.toFixed(2));
    result.sniperWalletsCount = snipeWalletsCount;

    if (earlyBuyersHolding.length === 0) {
        result.note = "Snipers detectados, pero ya vendieron todo.";
        return result;
    }

    const fundingSources = {};
    for (const buyer of earlyBuyersHolding) {
       try {
           const sigs = await connection.getSignaturesForAddress(new PublicKey(buyer), { limit: 50 });
           if (sigs.length === 0) continue;
           sigs.reverse();
           const oldestTxSig = sigs[0].signature;
           const parsedTx = await connection.getParsedTransaction(oldestTxSig, { maxSupportedTransactionVersion: 0 });
           if (!parsedTx || !parsedTx.meta || parsedTx.meta.err) continue;
           
           const instructions = parsedTx.transaction.message.instructions;
           let funder = null;
           for (const ix of instructions) {
               if (ix.program === 'system' && ix.parsed && ix.parsed.type === 'transfer') {
                   const info = ix.parsed.info;
                   if (info.destination === buyer) {
                       funder = info.source;
                       break;
                   }
               }
           }
           if (funder) {
               if (!fundingSources[funder]) fundingSources[funder] = [];
               fundingSources[funder].push(buyer);
           }
           await new Promise(r => setTimeout(r, 100));
       } catch (e) { }
    }

    let bundlerGroups = 0;
    let bundlersCount = 0;
    for (const source in fundingSources) {
        const group = fundingSources[source];
        if (group.length > 2) {
            bundlerGroups++;
            bundlersCount += group.length;
        }
    }

    result.bundlerGroups = bundlerGroups;
    result.bundlers = bundlersCount;
    return result;
  } catch (e) {
    result.note = `Error local snipe detection: ${e.message}`;
    return result;
  }
}


async function checkCreatorHistory(tokenMint, knownCreator) {
  const result = { creatorAddress: null, previousTokensFound: 0, checkedCount: 0, likelyRugged: 0, warning: null };
  const rpcs = [
    appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL,
    'https://solana.drpc.org',
    'https://solana-rpc.publicnode.com',
    'https://rpc.ankr.com/solana',
    'https://solana-rpc.publicnode.com'
  ].filter(Boolean);

  let connection = null;
  for (const rpc of rpcs) {
    try {
      connection = new Connection(rpc, 'confirmed');
      await connection.getSlot();
      break;
    } catch (e) { connection = null; }
  }
  if (!connection) return result;

  try {
    let creator = knownCreator;
    if (!creator) {
      const mintPubkey = new PublicKey(tokenMint);
      let sigs = [];
      let before = undefined;
      for (let i = 0; i < 3; i++) {
        const batch = await connection.getSignaturesForAddress(mintPubkey, { limit: 1000, before }, 'confirmed');
        if (!batch.length) break;
        sigs = sigs.concat(batch);
        if (batch.length < 1000) break;
        before = batch[batch.length - 1].signature;
      }
      if (!sigs.length) return result;
      const oldest = sigs[sigs.length - 1];
      const tx = await connection.getParsedTransaction(oldest.signature, { maxSupportedTransactionVersion: 0 });
      creator = tx?.transaction?.message?.accountKeys?.[0]?.pubkey?.toBase58();
    }
    if (!creator) return result;
    result.creatorAddress = creator;

    const creatorPubkey = new PublicKey(creator);
    const creatorSigs = await connection.getSignaturesForAddress(creatorPubkey, { limit: 1000 }, 'confirmed');
    const foundMints = new Set();
    for (const sig of creatorSigs.slice(0, 200)) {
      try {
        const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
        if (!tx) continue;
        const instructions = tx.transaction.message.instructions || [];
        for (const ix of instructions) {
          if (ix.parsed && (ix.parsed.type === 'initializeMint' || ix.parsed.type === 'initializeMint2')) {
            const mintAddr = ix.parsed.info.mint;
            if (mintAddr && mintAddr !== tokenMint) foundMints.add(mintAddr);
          }
        }
      } catch (e) {}
    }

    result.previousTokensFound = foundMints.size;
    if (foundMints.size === 0) return result;

    let checkedCount = 0;
    let ruggedCount = 0;
    for (const mint of Array.from(foundMints).slice(0, 5)) {
      try {
        const r = await fetchWithRetry(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { timeout: 5000 }, 1, 500);
        if (r && r.ok) {
          const d = await r.json();
          const pairs = (d.pairs || []).filter(p => p.chainId === 'solana');
          if (pairs.length > 0) {
            checkedCount++;
            const liq = pairs[0].liquidity?.usd || 0;
            if (liq < 200) ruggedCount++;
          }
        }
      } catch (e) {}
    }

    result.checkedCount = checkedCount;
    result.likelyRugged = ruggedCount;

    if (checkedCount >= 2 && (ruggedCount / checkedCount) >= 0.5) {
      result.warning = `⚠️ El creador ya lanzó ${foundMints.size} token(s) antes; ${ruggedCount}/${checkedCount} de los revisados ya no tienen liquidez (posible patrón de "serial rugger").`;
    }
  } catch (e) {
    console.warn(`[checkCreatorHistory] Error: ${e.message}`);
  }
  return result;
}

function detectWashTrading(volume24h, liquidityUsd, buys24h, sells24h, totalHolders) {
  const warnings = [];
  let suspicious = false;
  const volLiqRatio = liquidityUsd > 0 ? volume24h / liquidityUsd : 0;
  const totalTxns = (buys24h || 0) + (sells24h || 0);

  if (volLiqRatio > 50) {
    suspicious = true;
    warnings.push(`Volumen 24h es ${volLiqRatio.toFixed(0)}x la liquidez del pool — posible volumen inflado artificialmente.`);
  }
  if (totalHolders && totalHolders > 0 && totalHolders < 30 && totalTxns > 500) {
    suspicious = true;
    warnings.push(`${totalTxns} transacciones en 24h con solo ${totalHolders} holders — patrón típico de wash trading.`);
  }

  return { suspicious, volLiqRatio: +volLiqRatio.toFixed(2), totalTxns, warnings };
}


async function checkToken2022Extensions(tokenMint) {
  const result = { isToken2022: false, dangerousExtensions: [], warning: null };
  const rpcs = [appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL, 'https://solana.drpc.org', 'https://solana-rpc.publicnode.com', 'https://rpc.ankr.com/solana'].filter(Boolean);
  for (const rpc of rpcs) {
    try {
      const connection = new Connection(rpc, 'confirmed');
      const mintPubkey = new PublicKey(tokenMint);
      const accountInfo = await connection.getAccountInfo(mintPubkey);
      if (!accountInfo) return result;
      const isToken2022 = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
      result.isToken2022 = isToken2022;
      if (!isToken2022) return result;
      const mintInfo = await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
      const extensionTypes = getExtensionTypes(mintInfo.tlvData);
      const dangerous = [];
      if (extensionTypes.includes(ExtensionType.PermanentDelegate)) dangerous.push('PermanentDelegate: el creador puede mover/quitar tus tokens sin tu permiso.');
      if (extensionTypes.includes(ExtensionType.TransferFeeConfig)) dangerous.push('TransferFeeConfig: cada transferencia tiene un "impuesto" que el creador puede cambiar.');
      if (extensionTypes.includes(ExtensionType.TransferHook)) dangerous.push('TransferHook: lógica personalizada en cada transferencia — puede bloquear ventas selectivamente.');
      result.dangerousExtensions = dangerous;
      if (dangerous.length > 0) result.warning = `⚠️ Token-2022 con extensión(es) peligrosa(s): ${dangerous.join(' | ')}`;
      return result;
    } catch (e) { console.warn(`[checkToken2022Extensions] Falló con ${rpc}: ${e.message}`); }
  }
  return result;
}

async function checkLpLockStatus(tokenMint) {
  const result = { checked: false, lpLockedPct: null, warning: null };
  try {
    const res = await fetchWithRetry(`https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report`, { timeout: 8000 }, 2, 1000);
    if (!res || !res.ok) return result;
    const data = await res.json();
    if (data.markets && data.markets.length > 0) {
      const market = data.markets[0];
      const lpLockedPct = market.lpLockedPct ?? (market.lp ? market.lp.lpLockedPct : null);
      if (lpLockedPct !== null && lpLockedPct !== undefined) {
        result.checked = true;
        result.lpLockedPct = lpLockedPct;
        if (lpLockedPct < 50) result.warning = `⚠️ Solo ${lpLockedPct}% de la liquidez está bloqueada/quemada — el creador podría retirar el resto en cualquier momento.`;
      }
    }
  } catch (e) { console.warn(`[checkLpLockStatus] Error: ${e.message}`); }
  return result;
}

async function checkMetadataMutability(tokenMint) {
  const result = { checked: false, isMutable: null, warning: null };
  const rpcs = [appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL, 'https://solana.drpc.org', 'https://solana-rpc.publicnode.com'].filter(Boolean);
  for (const rpc of rpcs) {
    try {
      const connection = new Connection(rpc, 'confirmed');
      const mintPubkey = new PublicKey(tokenMint);
      const [metadataPda] = PublicKey.findProgramAddressSync([Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()], TOKEN_METADATA_PROGRAM_ID);
      const accountInfo = await connection.getAccountInfo(metadataPda);
      if (!accountInfo) return result;
      const metadata = deserializeMetadata(accountInfo);
      result.checked = true;
      result.isMutable = metadata.isMutable;
      if (metadata.isMutable) result.warning = `⚠️ La metadata (nombre/símbolo/imagen) del token es MUTABLE — el creador podría cambiar su identidad después.`;
      return result;
    } catch (e) { console.warn(`[checkMetadataMutability] Falló con ${rpc}: ${e.message}`); }
  }
  return result;
}

async function detectCamouflagedDevWallets(connection, creatorAddress, topHolders) {
  const result = { camouflagedCount: 0, details: [] };
  if (!creatorAddress) return result;

  const targets = topHolders.filter(h => !h.isPool && h.owner && h.owner !== creatorAddress);
  if (targets.length === 0) return result;

  const promises = targets.slice(0, 5).map(async (holder) => {
    try {
      const holderPubkey = new PublicKey(holder.owner);
      const sigs = await connection.getSignaturesForAddress(holderPubkey, { limit: 10 });
      if (sigs.length === 0) return null;

      let directFunded = false;
      let interactedWithCreator = false;

      // Check the oldest transaction for direct funding
      const oldestSig = sigs[sigs.length - 1].signature;
      const oldestTx = await connection.getParsedTransaction(oldestSig, { maxSupportedTransactionVersion: 0 });
      let fundingSource = null;
      if (oldestTx && oldestTx.transaction && oldestTx.transaction.message) {
        const instructions = oldestTx.transaction.message.instructions || [];
        for (const ix of instructions) {
          if (ix.program === 'system' && ix.parsed && ix.parsed.type === 'transfer') {
            const info = ix.parsed.info;
            if (info.destination === holder.owner) {
              fundingSource = info.source;
              break;
            }
          }
        }
      }

      if (fundingSource === creatorAddress) {
        directFunded = true;
      }

      // Check other transactions
      for (const sig of sigs) {
        try {
          const parsed = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
          if (!parsed || !parsed.transaction) continue;
          
          const accounts = parsed.transaction.message.accountKeys.map(k => {
            if (typeof k === 'string') return k;
            if (k && k.pubkey) return k.pubkey.toString();
            return k.toString();
          });
          
          if (accounts.includes(creatorAddress)) {
            interactedWithCreator = true;
          }

          const instructions = parsed.transaction.message.instructions || [];
          for (const ix of instructions) {
            if (ix.program === 'system' && ix.parsed && ix.parsed.type === 'transfer') {
              const info = ix.parsed.info;
              if (info.source === creatorAddress && info.destination === holder.owner) {
                directFunded = true;
              }
            }
          }
        } catch (txErr) {}
      }

      if (directFunded || interactedWithCreator) {
        return {
          wallet: holder.owner,
          pct: holder.pct,
          reason: directFunded 
            ? 'Financiada por wallet dev' 
            : 'Interacción con wallet dev'
        };
      }
    } catch (err) {}
    return null;
  });

  try {
    const outputs = await Promise.all(promises);
    for (const out of outputs) {
      if (out) {
        result.camouflagedCount++;
        result.details.push(out);
      }
    }
  } catch (e) {}

  return result;
}

async function checkTokenSafety(tokenMint) {
  const result = { safe: true, warnings: [], details: {} };
  let rcMintAuthority = undefined;
  let rcFreezeAuthority = undefined;
  let hasRcTokenInfo = false;
  let rc = null;
  let realHolders = [];
  let simConnection = null;

  try {
    const rcRes = await fetchWithRetry(`https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report`, { timeout: 8000 }, 2, 1000);
    if (rcRes && rcRes.ok) {
      rc = await rcRes.json();
      const score = rc.score_normalised ?? rc.score ?? 0;
      result.details.rugcheckScore = score;
      result.details.rugcheckRisks = (rc.risks || []).map(r => r.name);
      result.details.totalHolders = rc.totalHolders;
      result.details.creatorBalance = rc.creatorBalance;
      result.details.tokenSupply = rc.token?.supply;
      result.details.tokenDecimals = rc.token?.decimals;
      
      rcMintAuthority = rc.token?.mintAuthority;
      rcFreezeAuthority = rc.token?.freezeAuthority;
      hasRcTokenInfo = rc.token !== undefined;
      
      const networks = rc.insiderNetworks || [];
      let totalInsider = 0;
      for (const n of networks) { totalInsider += n.tokenAmount; }
      result.details.insiderPct = rc.token?.supply > 0 ? (totalInsider / rc.token.supply) * 100 : 0;
      
      result.details.totalMarketLiquidity = rc.totalMarketLiquidity;
      result.details.graphInsidersDetected = rc.graphInsidersDetected;
      result.details.markets = rc.markets;
      result.details.topHoldersRc = rc.topHolders;
      const dangerRisks = (rc.risks || []).filter(r => r.level === 'danger');
      if (dangerRisks.length > 0) {
        result.safe = false;
        dangerRisks.forEach(r => result.warnings.push(`RugCheck: ${r.name}`));
      }
      if (score > 50) {
        result.safe = false;
        result.warnings.push(`RugCheck score de riesgo alto: ${score}/100`);
      }
    } else {
      result.warnings.push('RugCheck no devolvió reporte (token muy nuevo o no indexado aún).');
    }
  } catch (e) {
    result.warnings.push(`RugCheck no disponible: ${e.message}`);
  }

  const t22Info = await checkToken2022Extensions(tokenMint);
  result.details.token2022 = t22Info;
  if (t22Info.isToken2022) {
    result.warnings.push(`⚠️ Programa Token-2022 detectado.`);
    if (t22Info.warning) {
      result.safe = false;
      result.warnings.push(t22Info.warning);
    }
  }

  const rpcs = [
    appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL,
    'https://solana.drpc.org',
    'https://solana-rpc.publicnode.com',
    'https://solana-mainnet.rpc.extrnode.com',
    'https://rpc.ankr.com/solana',
    'https://solana-rpc.publicnode.com'
  ].filter(Boolean);

  let mintInfo = null;
  let authorityCheckSuccess = false;
  const errors = [];
  
  for (const rpc of rpcs) {
    try {
      const displayRpc = rpc.split('?')[0];
      const connection = new Connection(rpc, 'confirmed');
      const programId = t22Info.isToken2022 ? TOKEN_2022_PROGRAM_ID : undefined;
      mintInfo = await getMint(connection, new PublicKey(tokenMint), 'confirmed', programId);
      authorityCheckSuccess = true;
      break;
    } catch (e) {
      const displayRpc = rpc.split('?')[0];
      errors.push(`${displayRpc}: ${e.message}`);
    }
  }
  const lastErrorMsg = errors.join(' | ');

  if (authorityCheckSuccess && mintInfo) {
    result.details.mintAuthorityRevoked = mintInfo.mintAuthority === null;
    result.details.freezeAuthorityRevoked = mintInfo.freezeAuthority === null;
    if (mintInfo.mintAuthority !== null) {
      result.safe = false;
      result.warnings.push('Mint authority NO revocada: el creador puede imprimir más tokens de la nada (dilución/rug).');
    }
    if (mintInfo.freezeAuthority !== null) {
      result.safe = false;
      result.warnings.push('Freeze authority NO revocada: el creador puede congelar tu wallet e impedirte vender (honeypot clásico).');
    }
  } else if (hasRcTokenInfo) {
    const mintAuth = rcMintAuthority;
    const freezeAuth = rcFreezeAuthority;
    result.details.mintAuthorityRevoked = mintAuth === null || mintAuth === undefined;
    result.details.freezeAuthorityRevoked = freezeAuth === null || freezeAuth === undefined;
    
    if (mintAuth !== null && mintAuth !== undefined) {
      result.safe = false;
      result.warnings.push('Mint authority NO revocada (vía RugCheck): el creador puede imprimir más tokens de la nada (dilución/rug).');
    }
    if (freezeAuth !== null && freezeAuth !== undefined) {
      result.safe = false;
      result.warnings.push('Freeze authority NO revocada (vía RugCheck): el creador puede congelar tu wallet e impedirte vender (honeypot clásico).');
    }
    result.warnings.push(`ℹ️ Verificación on-chain de autoridades falló, pero se utilizó la información de RugCheck.`);
  } else {
    result.warnings.push(`Chequeo on-chain de autoridades falló en todos los RPCs (Detalle: ${lastErrorMsg || 'Error desconocido'}).`);
    result.warnings.push(`⚠️ No se pudo verificar mint/freeze authority — no se confirmó que sean seguras, no se confirmó que sean peligrosas.`);
  }

  try {
    result.details.sellSimulation = { attempted: false, success: false, error: null };
    
    let largestAccounts = null;
    simConnection = null;
    
    for (const rpc of rpcs) {
      try {
        const conn = new Connection(rpc, 'confirmed');
        largestAccounts = await conn.getTokenLargestAccounts(new PublicKey(tokenMint));
        simConnection = conn;
        break; // Éxito
      } catch (e) {
         // console.error(`Error getTokenLargestAccounts con ${rpc}: ${e.message}`);
      }
    }

    if (largestAccounts && largestAccounts.value && largestAccounts.value.length > 0) {
      try {
        let totalSupply = mintInfo ? Number(mintInfo.supply) / (10 ** mintInfo.decimals) : null;
        if (totalSupply === null) {
          for (const rpc of rpcs) {
            try {
              const conn = new Connection(rpc, 'confirmed');
              const supplyInfo = await conn.getTokenSupply(new PublicKey(tokenMint));
              totalSupply = supplyInfo.value.uiAmount;
              break;
            } catch (e) {}
          }
        }

        const rawHolders = [];
        const ownerPubkeys = [];
        for (const acc of largestAccounts.value.slice(0, 10)) {
          try {
            const info = await getAccount(simConnection, acc.address);
            const amount = acc.decimals !== undefined
              ? Number(acc.amount) / (10 ** acc.decimals)
              : Number(info.amount) / (10 ** (mintInfo ? mintInfo.decimals : 0));
            rawHolders.push({ address: acc.address.toString(), owner: info.owner, amount });
            ownerPubkeys.push(info.owner);
          } catch (e) {}
        }

        const SYSTEM_PROGRAM = '11111111111111111111111111111111111111111';
        let ownerInfos = [];
        try {
          ownerInfos = await simConnection.getMultipleAccountsInfo(ownerPubkeys);
        } catch (e) {}

        const allHolders = rawHolders.map((h, i) => {
          const ownerAccInfo = ownerInfos[i];
          const isPool = ownerAccInfo ? ownerAccInfo.owner.toString() !== SYSTEM_PROGRAM : false;
          const pct = totalSupply ? (h.amount / totalSupply) * 100 : null;
          return { address: h.address, owner: h.owner.toString(), amount: h.amount, pct: pct !== null ? +pct.toFixed(2) : null, isPool };
        });

        realHolders = allHolders.filter(h => !h.isPool);
        const poolsExcluded = allHolders.length - realHolders.length;
        const top10Pct = totalSupply ? +realHolders.reduce((a, h) => a + (h.pct || 0), 0).toFixed(2) : null;

        result.details.holderConcentration = { topHolders: realHolders, poolsExcluded, top10Pct };

        
        const currentHoldersMap = new Map(allHolders.map(h => [h.address, h.pct || 0]));
        const trackerData = await fetchSolanaTrackerData(tokenMint);

        if (trackerData) {
          result.details.solanaTrackerRaw = trackerData;
          result.warnings.push('ℹ️ Datos de Solana Tracker recibidos — revisa result.details.solanaTrackerRaw para confirmar los nombres exactos de campos de snipers/bundlers y terminar de conectarlos.');
        } else {
          const snipeResult = await detectSnipersAndBundlers(simConnection, tokenMint, currentHoldersMap);
          result.details.snipers = snipeResult.snipers;
          result.details.bundlers = snipeResult.bundlers;
          result.details.sniperWalletsCount = snipeResult.sniperWalletsCount;
          result.details.bundlerGroups = snipeResult.bundlerGroups;
          if (snipeResult.note) result.warnings.push(`ℹ️ ${snipeResult.note}`);
          if (snipeResult.bundlers !== null && snipeResult.bundlers > 30) {
            result.warnings.push(`⚠️ Posible bundling detectado: ${snipeResult.bundlerGroups} grupo(s) de wallets fondeadas desde el mismo origen antes de comprar.`);
          }
        }

        if (top10Pct !== null && top10Pct > 80) {
          result.warnings.push(`⚠️ Alta concentración real (excluyendo pools de liquidez): el top de holders reales tiene ${top10Pct}% del supply.`);
        }
      } catch (e) {
        result.warnings.push(`No se pudo calcular concentración de holders: ${e.message}`);
      }
      let owner = null;
      let amount = 1000;
      for (const acc of largestAccounts.value) {
         try {
             const info = await getAccount(simConnection, acc.address);
             if (info.amount > 0) {
                 owner = info.owner;
                 amount = Math.min(Number(info.amount), 1000000000);
                 break;
             }
         } catch(e) {}
      }
      
      if (owner) {
        result.details.sellSimulation.attempted = true;
        const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${tokenMint}&outputMint=So11111111111111111111111111111111111111112&amount=${amount}&slippageBps=1000`;
        const qr = await fetchWithRetry(quoteUrl, { timeout: 8000 }, 2, 1000);
        if (qr && qr.ok) {
           const quoteResponse = await qr.json();
           if (quoteResponse.routePlan) {
              const sr = await fetchWithRetry('https://api.jup.ag/swap/v1/swap', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  timeout: 10000,
                  body: JSON.stringify({
                      quoteResponse,
                      userPublicKey: owner.toString(),
                      wrapAndUnwrapSol: true
                  })
              }, 2, 1000);
              if (sr && sr.ok) {
                 const swapRes = await sr.json();
                 if (swapRes.swapTransaction) {
                    const txBuf = Buffer.from(swapRes.swapTransaction, 'base64');
                    const tx = VersionedTransaction.deserialize(txBuf);
                    const simRes = await simConnection.simulateTransaction(tx, { sigVerify: false });
                    
                    if (simRes.value && simRes.value.err) {
                        result.details.sellSimulation.success = false;
                        result.details.sellSimulation.error = JSON.stringify(simRes.value.err);
                        result.safe = false;
                        result.warnings.push(`Simulación de VENTA falló (posible Honeypot): ${JSON.stringify(simRes.value.err)}`);
                    } else {
                        result.details.sellSimulation.success = true;
                    }
                 }
              }
           }
        }
      }
    } else if (hasRcTokenInfo && rc.topHolders && rc.topHolders.length > 0) {
      try {
        const rawHolders = rc.topHolders.slice(0, 10).map(h => {
          return {
            address: h.address,
            amount: h.amount,
            pct: h.pct,
            isPool: h.isPool || false
          };
        });
        const realHolders = rawHolders.filter(h => !h.isPool);
        const poolsExcluded = rawHolders.length - realHolders.length;
        const top10Pct = realHolders.reduce((a, h) => a + (h.pct || 0), 0);
        result.details.holderConcentration = { topHolders: realHolders, poolsExcluded, top10Pct: +top10Pct.toFixed(2) };
        if (top10Pct > 80) {
          result.warnings.push(`⚠️ Alta concentración real (vía RugCheck): el top de holders reales tiene ${top10Pct.toFixed(2)}% del supply.`);
        }
        result.warnings.push(`ℹ️ Verificación de holders on-chain falló, se usó la información de RugCheck.`);
      } catch (e) {
        result.warnings.push(`No se pudo calcular concentración de holders vía RugCheck: ${e.message}`);
      }
    }
  } catch (simErr) {
    result.warnings.push(`Simulación de venta omitida: ${simErr.message}`);
  }

  try {
    const knownCreator = rc?.creator || rc?.token?.creators?.[0]?.address || null;
    const creatorHistory = await checkCreatorHistory(tokenMint, knownCreator);
    result.details.creatorHistory = creatorHistory;
    if (creatorHistory.warning) {
      result.safe = false;
      result.warnings.push(creatorHistory.warning);
    }
  } catch (e) {
    result.warnings.push(`No se pudo revisar historial del creador: ${e.message}`);
  }

  try {
    const dsRes = await fetchWithRetry(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, { timeout: 6000 }, 1, 500);
    if (dsRes && dsRes.ok) {
      const dsData = await dsRes.json();
      const pairs = (dsData.pairs || []).filter(p => p.chainId === 'solana');
      if (pairs.length > 0) {
        pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
        const mainPair = pairs[0];
        const wash = detectWashTrading(
          mainPair.volume?.h24 || 0,
          mainPair.liquidity?.usd || 0,
          mainPair.txns?.h24?.buys || 0,
          mainPair.txns?.h24?.sells || 0,
          result.details.totalHolders
        );
        result.details.washTrading = wash;
        if (wash.suspicious) {
          result.safe = false;
          wash.warnings.forEach(w => result.warnings.push(`⚠️ Volumen sospechoso: ${w}`));
        }
      }
    }
  } catch (e) {
    result.warnings.push(`No se pudo revisar volumen sospechoso: ${e.message}`);
  }

  try {
    const creatorAddress = result.details.creatorHistory?.creatorAddress || rc?.creator || rc?.token?.creators?.[0]?.address || null;
    if (simConnection && creatorAddress && realHolders && realHolders.length > 0) {
      const camouflageRes = await detectCamouflagedDevWallets(simConnection, creatorAddress, realHolders);
      result.details.camouflagedDevWallets = camouflageRes;
      if (camouflageRes.camouflagedCount > 0) {
        result.safe = false;
        camouflageRes.details.forEach(c => {
          result.warnings.push(`⚠️ Wallet Dev Camuflada: La wallet ${c.wallet.slice(0, 8)}... (que posee ${c.pct}%) tiene nexos directos de financiamiento o transacciones con el creador.`);
        });
      }
    }
  } catch (camErr) {
    console.error('Error en detección de wallet camuflada:', camErr.message);
  }

  return result;
}

async function ensureGasFunding(connection, investorPubkeyStr, adminKeypair, label = '') {
  if (!adminKeypair) return;
  try {
    const investorPubkey = new PublicKey(investorPubkeyStr);
    const balLamports = await connection.getBalance(investorPubkey);
    const balSol = balLamports / 1e9;
    if (balSol >= MIN_SOL_FOR_GAS) return;

    const topupLamports = Math.floor(GAS_TOPUP_AMOUNT * 1e9);
    const adminBalLamports = await connection.getBalance(adminKeypair.publicKey);
    if (adminBalLamports < topupLamports + Math.floor(0.01 * 1e9)) {
      addLog(`⚠️ La wallet del pool no tiene suficiente SOL para fondear el gas de ${label || investorPubkeyStr.slice(0, 6)}...`, 'warn');
      return;
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: adminKeypair.publicKey,
        toPubkey: investorPubkey,
        lamports: topupLamports
      })
    );
    const latestBlockHash = await connection.getLatestBlockhash();
    tx.recentBlockhash = latestBlockHash.blockhash;
    tx.feePayer = adminKeypair.publicKey;
    tx.sign(adminKeypair);
    const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    await connection.confirmTransaction(txid, 'confirmed');
    addLog(`⛽ Pool fondeó ${GAS_TOPUP_AMOUNT} SOL de gas a ${label || investorPubkeyStr.slice(0, 6)}... (Tx: ${txid.slice(0, 8)}...)`, 'info');
  } catch (err) {
    addLog(`⚠️ Fallo fondeando gas para ${label || investorPubkeyStr}: ${err.message}`, 'warn');
  }
}

const JITO_BLOCK_ENGINE_URL = 'https://mainnet.block-engine.jito.wtf/api/v1/bundles';
const JITO_TIP_FLOOR_URL = 'https://bundles.jito.wtf/api/v1/bundles/tip_floor';
const JITO_FALLBACK_TIP_ACCOUNT = '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5';

let jitoTipAccountsCache = null;
let jitoTipAccountsCacheTime = 0;

async function getJitoTipAccount() {
  if (jitoTipAccountsCache && (Date.now() - jitoTipAccountsCacheTime < 300000)) {
    return jitoTipAccountsCache[Math.floor(Math.random() * jitoTipAccountsCache.length)];
  }
  try {
    const r = await fetchWithRetry(JITO_BLOCK_ENGINE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTipAccounts', params: [] })
    }, 2, 1000);
    if (r && r.ok) {
      const data = await r.json();
      if (data.result && data.result.length) {
        jitoTipAccountsCache = data.result;
        jitoTipAccountsCacheTime = Date.now();
        return jitoTipAccountsCache[Math.floor(Math.random() * jitoTipAccountsCache.length)];
      }
    }
  } catch (e) {}
  return JITO_FALLBACK_TIP_ACCOUNT;
}

async function getJitoTipLamports() {
  try {
    const r = await fetchWithRetry(JITO_TIP_FLOOR_URL, { timeout: 5000 }, 1, 500);
    if (r && r.ok) {
      const data = await r.json();
      const entry = Array.isArray(data) ? data[0] : data;
      const solTip = entry?.landed_tips_75th_percentile || 0.0001;
      return Math.max(Math.floor(solTip * 1e9), 1000);
    }
  } catch (e) {}
  return 10000;
}

async function sendViaJitoBundle(connection, signedTransaction, keypair) {
  const tipAccount = await getJitoTipAccount();
  const tipLamports = await getJitoTipLamports();

  const latestBlockHash = await connection.getLatestBlockhash();
  const tipTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(tipAccount),
      lamports: tipLamports
    })
  );
  tipTx.recentBlockhash = latestBlockHash.blockhash;
  tipTx.feePayer = keypair.publicKey;
  tipTx.sign(keypair);

  const mainTxBase64 = Buffer.from(signedTransaction.serialize()).toString('base64');
  const tipTxBase64 = tipTx.serialize().toString('base64');

  const bundleReq = {
    jsonrpc: '2.0',
    id: 1,
    method: 'sendBundle',
    params: [[mainTxBase64, tipTxBase64], { encoding: 'base64' }]
  };

  const res = await fetchWithRetry(JITO_BLOCK_ENGINE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
    body: JSON.stringify(bundleReq)
  }, 2, 1000);

  if (!res || !res.ok) throw new Error(`Jito sendBundle HTTP ${res ? res.status : 'sin respuesta'}`);
  const data = await res.json();
  if (data.error) throw new Error(`Jito sendBundle error: ${data.error.message}`);

  addLog(`📦 Bundle Jito enviado: ${data.result} (tip: ${tipLamports} lamports)`, 'info');
  return data.result;
}

const RPC_ENDPOINTS_BASE = [
  'https://solana-rpc.publicnode.com',
  'https://solana.drpc.org',
  'https://solana-rpc.publicnode.com'
];
function getRpcEndpoints() {
  const configured = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
  return [configured, ...RPC_ENDPOINTS_BASE.filter(u => u !== configured)];
}

const SLIPPAGE_ESCALATION_FACTORS = [1, 1.6, 2.4]; // 2.5% -> 4% -> 6% (conservador)
const PRIORITY_FEE_ESCALATION_FACTORS = [1, 3, 6];
const quoteCache = new Map();
const QUOTE_CACHE_TTL_MS = 4000;
const PREWARM_PROXIMITY_PCT = 3;

function getQuoteCacheKey(inputMint, outputMint, rawAmount, slippageBps) {
  return `${inputMint}:${outputMint}:${rawAmount}:${slippageBps}`;
}
function getCachedQuote(key) {
  const entry = quoteCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > QUOTE_CACHE_TTL_MS) { quoteCache.delete(key); return null; }
  return entry.quoteResponse;
}
function setCachedQuote(key, quoteResponse) {
  quoteCache.set(key, { quoteResponse, ts: Date.now() });
  if (quoteCache.size > 200) quoteCache.delete(quoteCache.keys().next().value);
}

async function preWarmNearbyQuotes() {
  try {
    const solanaItems = watchItems.filter(w => w.network === 'solana' && w.address);
    for (const w of solanaItems) {
      const pendingOrder = (w.orders || []).find(o => o.status === 'pending');
      if (!pendingOrder || !w.currentPrice) continue;
      const distancePct = Math.abs(w.currentPrice - pendingOrder.price) / pendingOrder.price * 100;
      if (distancePct > PREWARM_PROXIMITY_PCT) continue;

      const isSOL = (appConfig.solanaBaseToken !== 'USDC');
      const baseMint = isSOL ? 'So11111111111111111111111111111111111111112' : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      const baseSlip = appConfig.solanaSlippage || 2.5;
      const slippageBps = Math.floor(baseSlip * 100);

      let inputMint, outputMint, rawAmount;
      if (pendingOrder.type !== 'sell_only') {
        inputMint = baseMint;
        outputMint = w.address;
        if (isSOL) {
          const solPrice = await mxPrice('SOL') || 140;
          rawAmount = Math.floor((pendingOrder.amount / solPrice) * 1e9);
        } else {
          rawAmount = Math.floor(pendingOrder.amount * 1e6);
        }
      } else { continue; }

      const key = getQuoteCacheKey(inputMint, outputMint, rawAmount, slippageBps);
      if (getCachedQuote(key)) continue;

      const quoteUrl = `https://transaction-v1.raydium.io/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&slippageBps=${slippageBps}&txVersion=V0`;
      const qr = await fetchWithRetry(quoteUrl, { timeout: 10000 }, 1, 500);
      if (qr && qr.ok) {
        const quoteResponse = await qr.json();
        if (quoteResponse.success) setCachedQuote(key, quoteResponse);
      }
    }
  } catch (e) {
    console.error('[PreWarm] Error:', e.message);
  }
}
setInterval(() => { if (monitorOn) preWarmNearbyQuotes(); }, 3000);

const MAX_SWAP_ATTEMPTS = 3;

function isFatalSwapError(message) {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes('no record of a prior credit') ||
    m.includes('insufficient') ||
    m.includes('insufficient lamports') ||
    m.includes('falta la dirección') ||
    m.includes('falta llave privada') ||
    m.includes('no se encontró balance')
  );
}

async function executeSolanaTradeInternal(w, side, amountUSDT, price, pk, feePayerPk = null) {
  if (solMode !== 'wallet' && solMode !== 'pool') return { ok: true, txid: 'simulated' };
  if (!pk) {
    addLog(`⚠️ No se puede ejecutar orden real en Solana para ${w.symbol}: Falta llave privada.`, 'warn');
    return { ok: false };
  }
  const targetMint = w.address;
  if (!targetMint) {
    addLog(`⚠️ Error Solana trade: Falta la dirección del token para ${w.symbol}`, 'warn');
    return { ok: false };
  }

  const rpcEndpoints = getRpcEndpoints();
  const keypair = Keypair.fromSecretKey(bs58.decode(pk));
  const userPublicKey = keypair.publicKey.toString();
  const isSOL = (appConfig.solanaBaseToken !== 'USDC');
  const baseMint = isSOL ? 'So11111111111111111111111111111111111111112' : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

  let adminKeypair = null;
  if (feePayerPk) {
    try { adminKeypair = Keypair.fromSecretKey(bs58.decode(feePayerPk)); } catch(e) {}
  }

  if (side === 'BUY' && appConfig.safetyCheckEnabled) {
    const safety = await checkTokenSafety(targetMint);
    if (!safety.safe) {
      addLog(`🛑 Compra de ${w.symbol} bloqueada por chequeo de seguridad: ${safety.warnings.join(' | ')}`, 'warn');
      return { ok: false, blockedBySafety: true, safety };
    }
  }

  let lastError = null;

  for (let attempt = 0; attempt < MAX_SWAP_ATTEMPTS; attempt++) {
    const rpcUrl = rpcEndpoints[attempt % rpcEndpoints.length];
    const connection = new Connection(rpcUrl, 'confirmed');

    try {
      let inputMint, outputMint, rawAmount;
      const baseBalBefore = await getTokenBalance(connection, userPublicKey, baseMint);
      const tokenBalBefore = await getTokenUiBalance(connection, userPublicKey, targetMint);

      if (side === 'BUY') {
        inputMint = baseMint;
        outputMint = targetMint;
        if (isSOL) {
          const solPrice = await mxPrice('SOL') || 140;
          rawAmount = Math.floor((amountUSDT / solPrice) * 1e9);
        } else {
          rawAmount = Math.floor(amountUSDT * 1e6);
        }
      } else {
        inputMint = targetMint;
        outputMint = baseMint;
        const bal = await getTokenBalance(connection, userPublicKey, targetMint);
        if (bal <= 0) {
          addLog(`⚠️ No se encontró balance de ${w.symbol} para vender.`, 'warn');
          return { ok: false };
        }
        rawAmount = bal;
      }

      // Proactive Balance and Gas verification to prevent simulation and transaction failures
      const nativeSolBalLamports = await connection.getBalance(new PublicKey(userPublicKey));
      const solBal = nativeSolBalLamports / 1e9;
      const MIN_GAS_RESERVE = 0.0045; // Gas & ATA Rent creation buffer

      if (solBal < MIN_GAS_RESERVE) {
        addLog(`🛑 Balance de gas SOL crítico en tu wallet: ${solBal.toFixed(5)} SOL. Requiere al menos ${MIN_GAS_RESERVE} SOL para transacciones de red. Abortando swap.`, 'warn');
        return { ok: false };
      }

      if (side === 'BUY') {
        if (isSOL) {
          const totalSolNeeded = (rawAmount / 1e9) + MIN_GAS_RESERVE;
          if (solBal < totalSolNeeded) {
            addLog(`🛑 Balance de SOL insuficiente: tienes ${solBal.toFixed(5)} SOL, pero necesitas ${(rawAmount / 1e9).toFixed(5)} SOL + ${MIN_GAS_RESERVE} SOL de gas. Abortando swap.`, 'warn');
            return { ok: false };
          }
        } else {
          if (baseBalBefore < rawAmount) {
            addLog(`🛑 Balance de USDC insuficiente: tienes ${(baseBalBefore / 1e6).toFixed(2)} USDC, requerido ${(rawAmount / 1e6).toFixed(2)} USDC. Abortando swap.`, 'warn');
            return { ok: false };
          }
        }
      }

      const baseSlip = appConfig.solanaSlippage || 2.5;
      const slipPercent = baseSlip * SLIPPAGE_ESCALATION_FACTORS[attempt];
      const slippageBps = Math.floor(slipPercent * 100);

      const basePriorityFee = (appConfig.solanaPriorityFee && appConfig.solanaPriorityFee !== 'auto') ? parseInt(appConfig.solanaPriorityFee) : 1000;
      const escalatedPriorityFee = Math.floor(basePriorityFee * PRIORITY_FEE_ESCALATION_FACTORS[attempt]);

      if (adminKeypair && adminKeypair.publicKey.toString() !== userPublicKey) {
        await ensureGasFunding(connection, userPublicKey, adminKeypair, w.symbol);
      }

      if (attempt > 0) {
        addLog(`🔁 Reintento ${attempt + 1}/${MAX_SWAP_ATTEMPTS} para ${side} ${w.symbol} (Slippage: ${slipPercent}%, RPC: ${rpcUrl.slice(0, 30)}...)`, 'info');
      }

      addLog(`🌀 Consultando cotización Raydium para ${side} ${w.symbol} (Monto: ${rawAmount}, Slippage: ${slipPercent}%)...`, 'info');

      let swapTransaction = null;

      try {
        const cacheKey = getQuoteCacheKey(inputMint, outputMint, rawAmount, slippageBps);
        let quoteResponse = getCachedQuote(cacheKey);
        if (quoteResponse) {
          addLog(`⚡ Usando cotización pre-calentada para ${side} ${w.symbol} (sin esperar red).`, 'info');
        } else {
          const quoteUrl = `https://transaction-v1.raydium.io/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&slippageBps=${slippageBps}&txVersion=V0`;
          const qr = await fetchWithRetry(quoteUrl, { timeout: 8000 }, 3, 1500);
          if (!qr.ok) throw new Error(`Raydium Quote HTTP ${qr.status}`);
          quoteResponse = await qr.json();
          if (!quoteResponse.success) throw new Error(quoteResponse.msg || 'Raydium Quote unsuccesful');
        }
        quoteCache.delete(cacheKey);

        const bodyPayload = {
          swapResponse: quoteResponse,
          wallet: userPublicKey,
          computeUnitPriceMicroLamports: String(escalatedPriorityFee),
          txVersion: 'V0',
          wrapSol: true,
          unwrapSol: true
        };

        const sr = await fetchWithRetry('https://transaction-v1.raydium.io/transaction/swap-base-in', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
          body: JSON.stringify(bodyPayload)
        }, 3, 1500);

        if (!sr.ok) throw new Error(`Raydium Swap HTTP ${sr.status}`);
        const swapRes = await sr.json();
        if (!swapRes.success || !swapRes.data || !swapRes.data[0] || !swapRes.data[0].transaction) {
          throw new Error(swapRes.msg || 'Raydium transaction generation unsuccessful');
        }
        swapTransaction = swapRes.data[0].transaction;
        addLog(`✅ Cotización y Transacción obtenidas con éxito desde Raydium.`, 'info');
      } catch (raydiumErr) {
        addLog(`⚠️ Error Raydium Swap: ${raydiumErr.message}. Intentando fallback con Jupiter...`, 'warn');

        addLog(`🌀 Consultando cotización Jupiter para ${side} ${w.symbol} (Monto: ${rawAmount}, Slippage: ${slipPercent}%)...`, 'info');
        const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&slippageBps=${slippageBps}&prioritizationFeeLamports=auto`;
        const qr = await fetchWithRetry(quoteUrl, { timeout: 8000 }, 3, 1500);
        if (!qr.ok) {
          const errTxt = await qr.text();
          throw new Error(`Jupiter Quote (Fallback): ${errTxt}`);
        }
        const quoteResponse = await qr.json();

        const bodyPayload = {
          quoteResponse,
          userPublicKey,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto'
        };
        if (adminKeypair) bodyPayload.feePayer = adminKeypair.publicKey.toString();

        const sr = await fetchWithRetry('https://api.jup.ag/swap/v1/swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000,
          body: JSON.stringify(bodyPayload)
        }, 3, 1500);

        if (!sr.ok) {
          const errTxt = await sr.text();
          throw new Error(`Jupiter Swap API (Fallback): ${errTxt}`);
        }
        const jupRes = await sr.json();
        swapTransaction = jupRes.swapTransaction;
        addLog(`✅ Cotización y Transacción obtenidas con éxito desde Jupiter (Fallback).`, 'info');
      }

      const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      try {
        const feeLimitSOL = appConfig.solanaFeeLimit || 0.05;
        const feeInfo = await connection.getFeeForMessage(transaction.message, 'confirmed');
        if (feeInfo && feeInfo.value !== null) {
           const feeSOL = feeInfo.value / 1e9;
           if (feeSOL > feeLimitSOL) {
              addLog(`⚠️ ALERTA: Swap fee estimado (${feeSOL.toFixed(6)} SOL) excede el umbral de ${feeLimitSOL} SOL. Abortando operación de Copiloto/Swap.`, 'warn');
              return false;
           } else {
              addLog(`✅ Fee estimado aceptable: ${feeSOL.toFixed(6)} SOL.`, 'info');
           }
        }
      } catch (feeCheckErr) {
        addLog(`⚠️ No se pudo estimar el fee del swap, pero se continuará... (${feeCheckErr.message})`, 'info');
      }

      const requiredSigners = transaction.message.staticAccountKeys
        .slice(0, transaction.message.header.numRequiredSignatures)
        .map(k => k.toString());
      const potentialSigners = [keypair, adminKeypair].filter(Boolean);
      const signersToUse = potentialSigners.filter(kp => requiredSigners.includes(kp.publicKey.toString()));
      transaction.sign(signersToUse);

      let txid;
      if (appConfig.useJitoBundle) {
        try {
          await sendViaJitoBundle(connection, transaction, keypair);
          txid = bs58.encode(transaction.signatures[0]);
          addLog(`🚀 Transacción enviada vía Jito Bundle (protección anti-sandwich) para ${w.symbol}...`, 'info');
        } catch (jitoErr) {
          addLog(`⚠️ Jito bundle falló (${jitoErr.message}). Enviando por RPC normal como respaldo...`, 'warn');
          txid = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 2 });
        }
      } else {
        addLog(`🚀 Enviando transacción real de Solana para ${w.symbol}...`, 'info');
        txid = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 2 });
      }

      addLog(`✅ Transacción enviada: ${txid.slice(0, 8)}... Esperando confirmación...`, 'info');

      const latestBlockHash = await connection.getLatestBlockhash();
      await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: txid
      }, 'confirmed');

      const baseBalAfter = await getTokenBalance(connection, userPublicKey, baseMint);
      const tokenBalAfter = await getTokenUiBalance(connection, userPublicKey, targetMint);
      
      const diffRaw = side === 'SELL' ? (baseBalAfter - baseBalBefore) : (baseBalBefore - baseBalAfter);
      let exactAmountUSDT = 0;
      if (side === 'BUY') {
         // Para compras, usar el monto exacto de entrada (sin contar comisiones de red/renta)
         exactAmountUSDT = isSOL ? (rawAmount / 1e9) * (await mxPrice('SOL') || 140) : (rawAmount / 1e6);
      } else {
         // Para ventas, diffRaw (recibido neto descontando comisiones de gas)
         exactAmountUSDT = isSOL ? (diffRaw / 1e9) * (await mxPrice('SOL') || 140) : (diffRaw / 1e6);
      }
      
      const tokenDiff = side === 'BUY' ? (tokenBalAfter - tokenBalBefore) : (tokenBalBefore - tokenBalAfter);
      let exactPrice = price; // default to passed price
      if (tokenDiff > 0 && exactAmountUSDT > 0) {
        exactPrice = exactAmountUSDT / tokenDiff;
      }

      addLog(`🎉 Solana trade ${side} confirmado con éxito para ${w.symbol}! TxID: ${txid}`, side==='BUY'?'buy':'sell');
      solanaSwapLogs.unshift({ txid, symbol: w.symbol, side, amountUSDT, time: Date.now() });
      if(solanaSwapLogs.length > 50) solanaSwapLogs.pop();

      return { ok: true, txid, exactAmountUSDT, exactPrice, exactTokens: tokenDiff };
    } catch (err) {
      lastError = err;
      addLog(`❌ Error en ejecución de Solana (intento ${attempt + 1}/${MAX_SWAP_ATTEMPTS}): ${err.message}`, 'warn');
      if (isFatalSwapError(err.message)) {
        addLog(`🛑 Error no recuperable para ${w.symbol}, no tiene sentido reintentar (revisa fondos/config).`, 'warn');
        return { ok: false };
      }
    }
  }

  addLog(`🚫 Swap para ${w.symbol} falló tras ${MAX_SWAP_ATTEMPTS} intentos con distintos parámetros. Último error: ${lastError ? lastError.message : 'desconocido'}`, 'warn');
  return { ok: false };
}

// ============================================
// BUCLE PRINCIPAL DEL MONITOR EN EL SERVIDOR
// ============================================

async function mxRealOrder(symbol, side, amountUSDT, price) {
  if (mode !== 'real') return { ok: true, orderId: 'sim' };
  const apiKey = appConfig.mexcApiKey || process.env.MEXC_API_KEY;
  const apiSecret = appConfig.mexcApiSecret || process.env.MEXC_API_SECRET;
  if (!apiKey || !apiSecret) {
    addLog('⚠️ Faltan API Keys de MEXC en el .env', 'warn'); return { ok: false };
  }
  const qty = (amountUSDT / price).toFixed(2); // Ajustar precisión
  const ts = Date.now();
  let qs = `symbol=${symbol}USDT&side=${side}&type=LIMIT&quantity=${qty}&price=${price}&timestamp=${ts}`;
  const sig = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex');
  try {
    const r = await fetch(`https://api.mexc.com/api/v3/order?${qs}&signature=${sig}`, {
      method: 'POST', headers: { 'X-MEXC-APIKEY': apiKey }, signal: AbortSignal.timeout(10000)
    });
    const res = await r.json();
    if (res.code) { addLog(`MEXC Error (${symbol}): ${res.msg}`, 'warn'); return { ok: false }; }
    addLog(`✅ MEXC REAL ${side}: ${symbol} a ${price}`, side==='BUY'?'buy':'sell');
    return { ok: true, orderId: res.orderId };
  } catch(e) { return { ok: false }; }
}

async function mxCancelOrder(symbol, orderId) {
  if (mode !== 'real' || !orderId || orderId === 'sim') return true;
  const apiKey = appConfig.mexcApiKey || process.env.MEXC_API_KEY;
  const apiSecret = appConfig.mexcApiSecret || process.env.MEXC_API_SECRET;
  if (!apiKey || !apiSecret) return false;
  const ts = Date.now();
  let qs = `symbol=${symbol}USDT&orderId=${orderId}&timestamp=${ts}`;
  const sig = crypto.createHmac('sha256', apiSecret).update(qs).digest('hex');
  try {
    await fetch(`https://api.mexc.com/api/v3/order?${qs}&signature=${sig}`, {
      method: 'DELETE', headers: { 'X-MEXC-APIKEY': apiKey }, signal: AbortSignal.timeout(10000)
    });
    return true;
  } catch(e) { return false; }
}

let loopTimer = null;
let lastCycleAt = Date.now();
let lastSolanaCycleAt = Date.now();

async function executeOrder(w, side, amount, price) {
  if (w.network === 'solana') {
    return await executeSolanaTrade(w, side, amount, price);
  } else {
    return await mxRealOrder(w.symbol, side, amount, price);
  }
}

async function runCycle() {
  if (!monitorOn) return;
  lastCycleAt = Date.now();
  if (!watchItems.length) return;
  cycleN++;
  
  for (let wi = 0; wi < watchItems.length; wi++) {
    const w = watchItems[wi];
    if (w.network === 'solana') continue; // Solana se procesa en el ciclo de alta frecuencia por separado
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
          const realRes = await executeOrder(w, 'BUY', o.amount, cp);
          if (realRes && realRes.ok) {
            if(mode!=='real') SIM.balance -= o.amount;
            SIM.totalExec++;
            
            // Si tiene TP1, mandamos la venta LIMIT de inmediato (en modo real se queda en el libro - sólo MEXC)
            if (w.tp1Price) {
               const qtyTokens = o.amount / cp;
               const totalTargetUsdt = qtyTokens * w.tp1Price;
               const tpRes = await mxRealOrder(w.symbol, 'SELL', totalTargetUsdt, w.tp1Price);
               if (tpRes && tpRes.ok && tpRes.orderId !== 'sim') {
                 if (!w.realSellOrderIds) w.realSellOrderIds = [];
                 w.realSellOrderIds.push(tpRes.orderId);
                 addLog(`⏱ Orden Limit TP colocada en MEXC a $${w.tp1Price}`, 'info');
               }
            }
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
        let pnlP = (cp - avg) / avg * 100;
        
        if (cp <= w.slPrice) {
          // Si cae a SL, tenemos que cancelar la orden Limit TP si existe antes de vender el SL! (solo MEXC)
          if (w.realSellOrderIds && w.realSellOrderIds.length) {
            for (let id of w.realSellOrderIds) await mxCancelOrder(w.symbol, id);
          }
          let pnl = inv * pnlP / 100;
          const realRes = await executeOrder(w, 'SELL', inv + pnl, cp);
          if (realRes && realRes.ok) {
            if (realRes.exactAmountUSDT !== undefined) {
               pnl = realRes.exactAmountUSDT - inv;
               pnlP = (pnl / inv) * 100;
               addLog(`ℹ️ [Solana Real] PNL exacto ajustado post-swap: $${pnl.toFixed(2)}`, 'info');
            }
            if(mode!=='real') SIM.balance += inv + pnl;
            SIM.pnl += pnl; distributePnL(pnl);
            SIM.losses++;
          } else continue;
          SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: (realRes.exactPrice || cp), pnl, pnlPct: pnlP.toFixed(2), at: Date.now() });
          
          w.orders.forEach(o => { if (o.status === 'pending') o.status = 'cancelled'; });
          w.slPrice = null; w.tp1Price = null; w.tp2Price = null;
          addLog(`❌ SL ${w.symbol} (Entrada: $${fpZ(avg,avg)} ➡ Salida: $${fpZ(cp,cp)}) · P&L $${pnl.toFixed(2)} (${pnlP.toFixed(1)}%)`, 'sl_');
          
          watchItems.splice(wi, 1);
          wi--;
        } else if (w.tp1Price && cp >= w.tp1Price && !w.tp1Hit) {
          const pnl = inv * pnlP / 100;
          let realRes = { ok: true };
          if (mode !== 'real') {
             realRes = await executeOrder(w, 'SELL', inv + pnl, cp);
          } else {
             w.tp1Hit = true;
          }
          if (realRes && realRes.ok) {
            if(mode!=='real') SIM.balance += inv + pnl;
            SIM.pnl += pnl; distributePnL(pnl);
            SIM.wins++;
          } else continue;
          SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: (realRes.exactPrice || cp), pnl, pnlPct: pnlP.toFixed(2), at: Date.now() });
          
          w.orders.forEach(o => { if (o.status === 'pending') o.status = 'cancelled'; });
          w.tp1Hit = true;
          w.slPrice = null; w.tp1Price = null; w.tp2Price = null;
          addLog(`🎯 TP1 CERRADO ${w.symbol} (Entrada: $${fpZ(avg,avg)} ➡ Salida: $${fpZ(cp,cp)}) · P&L $${pnl.toFixed(2)} (+${pnlP.toFixed(1)}%)`, 'tp');
          
          watchItems.splice(wi, 1);
          wi--;
        } else if (w.tp2Price && cp >= w.tp2Price && !w.tp2Hit) {
          const pnl = inv * pnlP / 100;
          let realRes = { ok: true };
          if (mode !== 'real') {
             realRes = await executeOrder(w, 'SELL', inv + pnl, cp);
          } else {
             w.tp2Hit = true;
          }
          if (realRes && realRes.ok) {
            if(mode!=='real') SIM.balance += inv + pnl;
            SIM.pnl += pnl; distributePnL(pnl);
            SIM.wins++;
          } else continue;
          SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: (realRes.exactPrice || cp), pnl, pnlPct: pnlP.toFixed(2), at: Date.now() });
          
          w.orders.forEach(o => { if (o.status === 'pending') o.status = 'cancelled'; });
          w.tp2Hit = true;
          w.slPrice = null; w.tp1Price = null; w.tp2Price = null;
          addLog(`🚀 TP2 CERRADO ${w.symbol} (Entrada: $${fpZ(avg,avg)} ➡ Salida: $${fpZ(cp,cp)}) · P&L $${pnl.toFixed(2)} (+${pnlP.toFixed(1)}%)`, 'tp');
          
          watchItems.splice(wi, 1);
          wi--;
        }
      }
    } catch (e) {
      console.log('Error en ciclo MEXC:', w.symbol, e.message);
    }
  }
  saveState();
}

// ============================================================================
// WEBSOCKET REAL-TIME SOLANA DETECTOR (HYBRID MODE)
// ============================================================================
let solanaWs = null;
let solanaWsUrl = '';
let wsReqId = 1;
let wsReqMap = {}; // requestId -> address
let wsSubIdToAddress = {}; // subscriptionId -> address
let wsAddressToSubId = {}; // address -> subscriptionId
let wsPingInterval = null;
let reconnectTimeout = null;

let solanaCycleTimeout = null;
let solanaCyclePending = false;

// Throttle function to run Solana price checks and executions at most twice per second
function triggerSolanaCycleFast() {
  if (solanaCycleTimeout) {
    solanaCyclePending = true;
    return;
  }
  
  runSolanaCycle().then(() => {
    solanaCycleTimeout = setTimeout(() => {
      solanaCycleTimeout = null;
      if (solanaCyclePending) {
        solanaCyclePending = false;
        triggerSolanaCycleFast();
      }
    }, 500); // Max 2 checks per second
  }).catch(err => {
    console.error('Error in throttled runSolanaCycle:', err);
    solanaCycleTimeout = null;
  });
}

function getSolanaWssUrl(rpcUrl) {
  if (!rpcUrl) return 'wss://solana-rpc.publicnode.com';
  let wssUrl = rpcUrl;
  if (wssUrl.startsWith('https://')) {
    wssUrl = 'wss://' + wssUrl.substring(8);
  } else if (wssUrl.startsWith('http://')) {
    wssUrl = 'ws://' + wssUrl.substring(7);
  } else if (!wssUrl.startsWith('wss://') && !wssUrl.startsWith('ws://')) {
    wssUrl = 'wss://' + wssUrl;
  }

  try {
    const parsed = new URL(wssUrl);
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      console.warn(`⚠️ SOLANA_RPC_URL parece inválida ("${rpcUrl}") — usando el RPC público como respaldo. Revisa tu .env, probablemente falta "https://host/?api-key=" antes de la key.`);
      return 'wss://solana-rpc.publicnode.com';
    }
  } catch (e) {
    console.warn(`⚠️ SOLANA_RPC_URL no es una URL válida ("${rpcUrl}") — usando el RPC público como respaldo.`);
    return 'wss://solana-rpc.publicnode.com';
  }

  return wssUrl;
}

function connectSolanaWs() {
  if (solanaWs) {
    try {
      solanaWs.close();
    } catch (e) {}
  }
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
  const wssUrl = getSolanaWssUrl(rpcUrl);
  solanaWsUrl = wssUrl;
  
  addLog(`🔌 Conectando WebSocket de Solana a ${wssUrl.split('?')[0]}...`, 'info');
  console.log(`[WS Solana] Connecting to ${wssUrl}`);
  
  try {
    solanaWs = new WebSocket(wssUrl);
    
    solanaWs.on('open', () => {
      addLog(`🔌 WebSocket de Solana Conectado exitosamente.`, 'info');
      console.log(`[WS Solana] Connected to ${wssUrl}`);
      
      // Clear mappings on new connection
      wsReqMap = {};
      wsSubIdToAddress = {};
      wsAddressToSubId = {};
      
      // Keep connection alive with websocket pings
      if (wsPingInterval) clearInterval(wsPingInterval);
      wsPingInterval = setInterval(() => {
        if (solanaWs && solanaWs.readyState === WebSocket.OPEN) {
          solanaWs.ping();
        }
      }, 20000);
      
      // Resubscribe all active watches
      syncSolanaSubscriptions();
    });
    
    solanaWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        // Handle subscription response
        if (msg.id && msg.result !== undefined) {
          const address = wsReqMap[msg.id];
          if (address) {
            const subId = msg.result;
            wsSubIdToAddress[subId] = address;
            wsAddressToSubId[address] = subId;
            console.log(`[WS Solana] Subscribed to address ${address} with subId ${subId}`);
            delete wsReqMap[msg.id];
          }
        }
        
        // Handle account notification
        if (msg.method === 'accountNotification' && msg.params) {
          const subId = msg.params.subscription;
          const address = wsSubIdToAddress[subId];
          if (address) {
            console.log(`🔔 [WS Solana] Change detected on ${address}!`);
            triggerSolanaCycleFast();
          }
        }
      } catch (e) {
        console.error('[WS Solana] Error parsing WS message:', e.message);
      }
    });
    
    solanaWs.on('close', (code, reason) => {
      console.warn(`[WS Solana] WS closed. Code: ${code}, Reason: ${reason}`);
      if (wsPingInterval) {
        clearInterval(wsPingInterval);
        wsPingInterval = null;
      }
      scheduleWsReconnect();
    });
    
    solanaWs.on('error', (err) => {
      console.error(`[WS Solana] WS error:`, err.message);
    });
  } catch (err) {
    console.error(`[WS Solana] Failed to create WebSocket connection:`, err.message);
    scheduleWsReconnect();
  }
}

function scheduleWsReconnect() {
  if (reconnectTimeout) return;
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connectSolanaWs();
  }, 5000); // Reconnect after 5 seconds
}

// Fetches the pool address (pair address) for a Solana mint address from DexScreener
async function getPoolAddress(mintAddress) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`);
    if (r.ok) {
      const d = await r.json();
      if (d && d.pairs) {
        const solPairs = d.pairs.filter(p => p.chainId === 'solana');
        if (solPairs.length > 0) {
          solPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
          return solPairs[0].pairAddress;
        }
      }
    }
  } catch (e) {
    console.error('Error fetching pool address from DexScreener:', e.message);
  }
  return null;
}

// Dynamically updates Solana WebSocket subscriptions to match currently monitored watchItems
async function syncSolanaSubscriptions() {
  if (!monitorOn) {
    unsubscribeAllSolana();
    return;
  }

  if (!solanaWs || solanaWs.readyState !== WebSocket.OPEN) {
    // If WS is not open, it will auto-sync once it opens
    return;
  }

  const solanaItems = watchItems.filter(w => w.network === 'solana');
  
  // Prepare a set of target addresses we want to subscribe to
  const targets = {}; // mint -> target (pool or mint itself)
  
  for (const w of solanaItems) {
    if (!w.address) continue;
    let poolAddress = w.poolAddress;
    if (!poolAddress) {
      poolAddress = await getPoolAddress(w.address);
      if (poolAddress) {
        w.poolAddress = poolAddress;
        saveState();
      }
    }
    targets[w.address] = poolAddress || w.address;
  }
  
  const targetAddresses = new Set(Object.values(targets));
  const currentSubs = Object.keys(wsAddressToSubId);
  
  // 1. Unsubscribe from addresses no longer needed
  for (const addr of currentSubs) {
    if (!targetAddresses.has(addr)) {
      const subId = wsAddressToSubId[addr];
      if (subId) {
        const req = {
          jsonrpc: "2.0",
          id: ++wsReqId,
          method: "accountUnsubscribe",
          params: [subId]
        };
        try {
          solanaWs.send(JSON.stringify(req));
          console.log(`[WS Solana] Sent unsubscribe for subId ${subId} (Address: ${addr})`);
        } catch (e) {
          console.error(`[WS Solana] Error sending unsubscribe for ${addr}:`, e.message);
        }
        delete wsAddressToSubId[addr];
        delete wsSubIdToAddress[subId];
      }
    }
  }

  // 2. Subscribe to newly added target addresses
  for (const [mint, addr] of Object.entries(targets)) {
    if (!wsAddressToSubId[addr] && !Object.values(wsReqMap).includes(addr)) {
      const reqId = ++wsReqId;
      wsReqMap[reqId] = addr;
      
      const req = {
        jsonrpc: "2.0",
        id: reqId,
        method: "accountSubscribe",
        params: [
          addr,
          {
            encoding: "base64",
            commitment: "confirmed"
          }
        ]
      };
      
      try {
        solanaWs.send(JSON.stringify(req));
        addLog(`🔌 WebSocket Solana: Suscribiendo a cambios para ${mint.slice(0, 8)}... (Pool: ${addr.slice(0, 8)}...)`, 'info');
        console.log(`[WS Solana] Sent subscribe for ${addr}`);
      } catch (e) {
        console.error(`[WS Solana] Error sending subscribe for ${addr}:`, e.message);
      }
    }
  }
}

function unsubscribeAllSolana() {
  if (solanaWs && solanaWs.readyState === WebSocket.OPEN) {
    for (const [addr, subId] of Object.entries(wsAddressToSubId)) {
      const req = {
        jsonrpc: "2.0",
        id: ++wsReqId,
        method: "accountUnsubscribe",
        params: [subId]
      };
      try {
        solanaWs.send(JSON.stringify(req));
      } catch (e) {}
    }
  }
  wsReqMap = {};
  wsSubIdToAddress = {};
  wsAddressToSubId = {};
}

async function runSolanaCycle() {
  if (!monitorOn) return;
  lastSolanaCycleAt = Date.now();
  const solanaItems = watchItems.filter(w => w.network === 'solana');
  if (!solanaItems.length) return;
  
  const addresses = solanaItems.map(w => w.address).filter(Boolean);
  const prices = await getSolanaPrices(addresses);
  
  for (let wi = 0; wi < watchItems.length; wi++) {
    const w = watchItems[wi];
    if (w.network !== 'solana') continue;
    
    try {
      const cp = prices[w.address]?.price || 0;
      if (cp <= 0) continue;
      
      w.prevPrice = (w.currentPrice || cp);
      w.currentPrice = cp;
      w.lastUpdate = Date.now();
      
      // AUTO-EJECUTAR ÓRDENES COMPRA SOLANA
      for (let oi = 0; oi < w.orders.length; oi++) {
        const o = w.orders[oi];
        if (o.status !== 'pending') continue;
        
        // Verifica si el precio bajó hasta el punto de entrada
        if (cp <= o.price * 1.005) {
          o.status = 'filled'; 
          o.filledAt = Date.now(); 
          
          addLog(`⚡ [Solana Instant] Disparando swap compra para ${w.symbol} a $${fpZ(cp,cp)}...`, 'info');
          const realRes = await executeOrder(w, 'BUY', o.amount, cp);
          if (realRes && realRes.ok) {
            const realFillPrice = realRes.exactPrice || cp;
            o.filledPrice = realFillPrice;
            if (!w.filledBuys) w.filledBuys = [];
            w.filledBuys.push({ price: realFillPrice, amount: realRes.exactAmountUSDT || o.amount, level: o.level });

            o.retryCount = 0;
            if (solMode !== 'wallet' && solMode !== 'pool') {
                SIM.balance -= (realRes.exactAmountUSDT || o.amount);
                SIM.solBalance += (realRes.exactAmountUSDT || o.amount) / realFillPrice;
            }
            SIM.totalExec++;

            if (!w.slPrice) {
               w.slPrice = realFillPrice * (1 - (o.sl || 10)/100);
               w.tp1Price = realFillPrice * (1 + (o.tp1 || 8)/100);
               w.tp2Price = realFillPrice * (1 + (o.tp2 || 15)/100);
            }
            addLog(`✅ AUTO-COMPRA SOLANA COMPLETADA: ${w.symbol} #${o.level} · $${realRes.exactAmountUSDT || o.amount} a $${fpZ(realFillPrice, realFillPrice)}`, 'buy');
          } else {
            o.retryCount = (o.retryCount || 0) + 1;
            o.filledAt = null;
            o.filledPrice = null;
            if (o.retryCount >= 3) {
              o.status = 'paused';
              addLog(`🚨 Swap real en Solana para ${w.symbol} falló 3 veces. Orden pausada automáticamente para evitar spam. Por favor, revisa tus fondos, RPC o configuración de red y reactívala.`, 'warn');
            } else {
              o.status = 'pending';
              addLog(`⚠️ Falló swap real en Solana para ${w.symbol} (Intento ${o.retryCount}/3). Reintentando en el próximo tick rápido.`, 'warn');
            }
            continue; 
          }
          break; // Stop processing more orders for this coin in this tick to allow state updates
        }
          
      }
      
      // VERIFICAR SL / TP SOLANA
      const filled = w.orders.filter(o => o.status === 'filled');
      if (filled.length && w.slPrice) {
        const inv = filled.reduce((a, o) => a + o.amount, 0);
        const avg = filled.reduce((a, o) => a + o.price * o.amount, 0) / inv;
        let pnlP = (cp - avg) / avg * 100;
        
        if (cp <= w.slPrice) {
          addLog(`⚡ [Solana Instant] Disparando Stop Loss para ${w.symbol} a $${fpZ(cp,cp)}...`, 'info');
          let pnl = inv * pnlP / 100;
          const realRes = await executeOrder(w, 'SELL', inv + pnl, cp);
          if (realRes && realRes.ok) {
            if (realRes.exactAmountUSDT !== undefined) {
               pnl = realRes.exactAmountUSDT - inv;
               pnlP = (pnl / inv) * 100;
               addLog(`ℹ️ [Solana Real] PNL exacto ajustado post-swap (SL): $${pnl.toFixed(2)}`, 'info');
            }
            if (solMode !== 'wallet' && solMode !== 'pool') {
                SIM.balance += inv + pnl;
                SIM.solBalance -= (inv / avg);
            }
            SIM.pnl += pnl; distributePnL(pnl);
            SIM.losses++;
            SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: (realRes.exactPrice || cp), pnl, pnlPct: pnlP.toFixed(2), at: Date.now() });
            
            w.orders.forEach(o => { if (o.status === 'pending') o.status = 'cancelled'; });
            w.slPrice = null; w.tp1Price = null; w.tp2Price = null;
            addLog(`❌ SL SOLANA CERRADO ${w.symbol} (Entrada: $${fpZ(avg,avg)} ➡ Salida: $${fpZ(cp,cp)}) · P&L $${pnl.toFixed(2)} (${pnlP.toFixed(1)}%)`, 'sl_');
            
            watchItems.splice(wi, 1);
            wi--;
          } else {
            addLog(`⚠️ Falló Stop Loss real en Solana para ${w.symbol}. Reintentando inmediatamente.`, 'warn');
          }
        } else if (w.tp1Price && cp >= w.tp1Price && !w.tp1Hit) {
          addLog(`⚡ [Solana Instant] Disparando Take Profit 1 para ${w.symbol} a $${fpZ(cp,cp)}...`, 'info');
          let pnl = inv * pnlP / 100;
          const realRes = await executeOrder(w, 'SELL', inv + pnl, cp);
          if (realRes && realRes.ok) {
            if (realRes.exactAmountUSDT !== undefined) {
               pnl = realRes.exactAmountUSDT - inv;
               pnlP = (pnl / inv) * 100;
               addLog(`ℹ️ [Solana Real] PNL exacto ajustado post-swap (TP1): $${pnl.toFixed(2)}`, 'info');
            }
            if (solMode !== 'wallet' && solMode !== 'pool') {
                SIM.balance += inv + pnl;
                SIM.solBalance -= (inv / avg);
            }
            SIM.pnl += pnl; distributePnL(pnl);
            SIM.wins++;
            SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: (realRes.exactPrice || cp), pnl, pnlPct: pnlP.toFixed(2), at: Date.now() });
            
            w.orders.forEach(o => { if (o.status === 'pending') o.status = 'cancelled'; });
            w.tp1Hit = true;
            w.slPrice = null; w.tp1Price = null; w.tp2Price = null;
            addLog(`🎯 TP1 SOLANA CERRADO ${w.symbol} (Entrada: $${fpZ(avg,avg)} ➡ Salida: $${fpZ(cp,cp)}) · P&L $${pnl.toFixed(2)} (+${pnlP.toFixed(1)}%)`, 'tp');
            
            watchItems.splice(wi, 1);
            wi--;
          } else {
            addLog(`⚠️ Falló Take Profit 1 real en Solana para ${w.symbol}. Reintentando inmediatamente.`, 'warn');
          }
        } else if (w.tp2Price && cp >= w.tp2Price && !w.tp2Hit) {
          addLog(`⚡ [Solana Instant] Disparando Take Profit 2 para ${w.symbol} a $${fpZ(cp,cp)}...`, 'info');
          let pnl = inv * pnlP / 100;
          const realRes = await executeOrder(w, 'SELL', inv + pnl, cp);
          if (realRes && realRes.ok) {
            if (realRes.exactAmountUSDT !== undefined) {
               pnl = realRes.exactAmountUSDT - inv;
               pnlP = (pnl / inv) * 100;
               addLog(`ℹ️ [Solana Real] PNL exacto ajustado post-swap (TP2): $${pnl.toFixed(2)}`, 'info');
            }
            if (solMode !== 'wallet' && solMode !== 'pool') {
                SIM.balance += inv + pnl;
                SIM.solBalance -= (inv / avg);
            }
            SIM.pnl += pnl; distributePnL(pnl);
            SIM.wins++;
            SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: (realRes.exactPrice || cp), pnl, pnlPct: pnlP.toFixed(2), at: Date.now() });
            
            w.orders.forEach(o => { if (o.status === 'pending') o.status = 'cancelled'; });
            w.tp2Hit = true;
            w.slPrice = null; w.tp1Price = null; w.tp2Price = null;
            addLog(`🚀 TP2 SOLANA CERRADO ${w.symbol} (Entrada: $${fpZ(avg,avg)} ➡ Salida: $${fpZ(cp,cp)}) · P&L $${pnl.toFixed(2)} (+${pnlP.toFixed(1)}%)`, 'tp');
            
            watchItems.splice(wi, 1);
            wi--;
          } else {
            addLog(`⚠️ Falló Take Profit 2 real en Solana para ${w.symbol}. Reintentando inmediatamente.`, 'warn');
          }
        }
      }
    } catch (e) {
      console.log('Error en ciclo Solana:', w.symbol, e.message);
    }
  }
  saveState();
}

let autoTraderCounter = 0;
let isAutoTraderCycleRunning = false;

async function executeAutoTraderCycle() {
  if (!monitorOn || !appConfig.autoTraderEnabled) return;
  if (isAutoTraderCycleRunning) {
    console.log("[Autopilot] El ciclo del auto-trader ya está en ejecución. Ignorando esta iteración para evitar duplicados.");
    return;
  }
  
  isAutoTraderCycleRunning = true;
  try {
    const searchPromises = [
      fetchWithRetry(`https://api.dexscreener.com/token-profiles/latest/v1`, { timeout: 8000 }, 2, 1000),
      fetchWithRetry(`https://api.dexscreener.com/token-boosts/latest/v1`, { timeout: 8000 }, 2, 1000),
      fetchWithRetry(`https://api.dexscreener.com/token-boosts/top/v1`, { timeout: 8000 }, 2, 1000),
      fetchWithRetry(`https://api.dexscreener.com/latest/dex/search?q=SOL`, { timeout: 8000 }, 2, 1000),
      fetchWithRetry(`https://api.dexscreener.com/latest/dex/search?q=USDC`, { timeout: 8000 }, 2, 1000)
    ];
    
    const responses = await Promise.all(searchPromises.map(p => p.catch(() => null)));
    let allPairs = [];
    
    // Parse profiles and boosts
    const processTokenList = (list) => {
      const arr = Array.isArray(list) ? list : [];
      const res = [];
      for (const item of arr) {
        if (item && item.chainId === 'solana' && item.tokenAddress) {
          res.push(item.tokenAddress);
        }
      }
      return res;
    };
    
    let tokenAddresses = new Set();
    
    if (responses[0] && responses[0].ok) {
      const profiles = await responses[0].json().catch(() => []) || [];
      processTokenList(profiles).forEach(addr => tokenAddresses.add(addr));
    }
    if (responses[1] && responses[1].ok) {
      const boostsL = await responses[1].json().catch(() => []) || [];
      processTokenList(boostsL).forEach(addr => tokenAddresses.add(addr));
    }
    if (responses[2] && responses[2].ok) {
      const boostsT = await responses[2].json().catch(() => []) || [];
      processTokenList(boostsT).forEach(addr => tokenAddresses.add(addr));
    }
    
    // Fetch search results pairs
    for (let i = 3; i < responses.length; i++) {
      const r = responses[i];
      if (r && r.ok) {
        const data = await r.json().catch(() => null);
        if (data && data.pairs) {
          allPairs.push(...data.pairs);
        }
      }
    }
    
    // Fetch details for the token addresses
    if (tokenAddresses.size > 0) {
      const addressList = Array.from(tokenAddresses);
      const batch = addressList.slice(0, 30).join(','); // fetch first 30
      const detailRes = await fetchWithRetry(`https://api.dexscreener.com/latest/dex/tokens/${batch}`, { timeout: 8000 }, 2, 1000).catch(() => null);
      if (detailRes && detailRes.ok) {
        const data = await detailRes.json().catch(() => null);
        if (data && data.pairs) {
          allPairs.push(...data.pairs);
        }
      }
    }
    
    // Filter out invalid/base pairs, keep Solana only
    const solPairs = allPairs.filter(p => {
      if (!p || p.chainId !== 'solana' || !p.baseToken) return false;
      const sym = p.baseToken.symbol.toUpperCase();
      if (sym === 'SOL' || sym === 'WSOL' || sym === 'USDC' || sym === 'USDT') return false;
      return true;
    });
    
    // Deduplicate by baseToken address
    const seen = new Set();
    const uniquePairs = [];
    for (const p of solPairs) {
      if (!seen.has(p.baseToken.address)) {
        seen.add(p.baseToken.address);
        uniquePairs.push(p);
      }
    }
    
    // Filter tokens using user settings
    const volMin = appConfig.autoTraderMin24HVol ?? 50000;
    const minLiq = appConfig.autoTraderMinLiq ?? 2000;
    const minMC = appConfig.autoTraderMinMarketCap ?? 200000;
    const maxMC = appConfig.autoTraderMaxMarketCap ?? 2000000;
    const minAgeHours = appConfig.autoTraderMinAge ?? 48;
    const maxAgeHours = appConfig.autoTraderMaxAge ?? 500;
    const nowMs = Date.now();
    
    const candidates = uniquePairs.filter(p => {
      const vol = p.volume?.h24 || 0;
      const liq = p.liquidity?.usd || 0;
      const mc = p.marketCap || p.fdv || 0;
      
      if (vol < volMin) return false;
      if (liq < minLiq) return false;
      if (mc < minMC || mc > maxMC) return false;
      
      if (p.pairCreatedAt) {
        const ageHours = (nowMs - p.pairCreatedAt) / (1000 * 3600);
        if (ageHours < minAgeHours || ageHours > maxAgeHours) return false;
      } else {
        return false;
      }
      return true;
    });
    
    if (candidates.length === 0) return;
    
    for (const p of candidates) {
      const tokenAddress = p.baseToken.address;
      if (!tokenAddress) continue;
      
      // Check if already in watchItems or already traded/processed by autopilot (case-insensitive)
      const isAlreadyMonitored = watchItems.some(w => w.address && w.address.toLowerCase() === tokenAddress.toLowerCase());
      if (isAlreadyMonitored) continue;
      
      const isAlreadyTraded = autopilotTradedMints.some(m => m.toLowerCase() === tokenAddress.toLowerCase());
      if (isAlreadyTraded) continue;

      const rejectedAt = autopilotRejectedMints[tokenAddress.toLowerCase()];
      if (rejectedAt && (Date.now() - rejectedAt) < AUTOPILOT_REJECT_COOLDOWN_MS) {
        continue;
      }
      
      // Safety/Anti-Rug Check
      addLog(`🛡️ [Copiloto] Analizando seguridad de ${p.baseToken.symbol}...`, 'info');
      const safety = await checkTokenSafety(tokenAddress);
      if (!safety.safe) {
        addLog(`⚠️ [Copiloto] Token ${p.baseToken.symbol} descartado por seguridad: ${safety.warnings.join(', ')}`, 'info');
        autopilotRejectedMints[tokenAddress.toLowerCase()] = Date.now();
        saveState();
        continue;
      }
      
      // Passed safety! Let's analyze its orderbook to find the strongest support wall
      addLog(`🛡️ [Copiloto] ${p.baseToken.symbol} pasó el control de seguridad. Buscando pared de soporte...`, 'info');
      const wall = await findBestSupportWall(tokenAddress, p.priceUsd);
      if (!wall || wall.wallPrice <= 0) {
        addLog(`⚠️ [Copiloto] No se pudo encontrar pared de soporte para ${p.baseToken.symbol}.`, 'warn');
        continue;
      }
      
      const wallPrice = wall.wallPrice;
      const buyPrice = wallPrice * 1.002;
      const currentPrice = wall.currentPrice || p.priceUsd;
      const wallSourceLabel = wall.source === 'phoenix' ? '📖 Orderbook real (Phoenix)'
  : wall.source === 'volume_profile' ? `📊 Soporte por historial real (${wall.bounces || 0} rebotes detectados)`
  : '📐 Estimación matemática (pool AMM)';
      
      if (buyPrice >= currentPrice * 1.02) {
        continue; // Don't place support order if wall is too high or above current
      }
      
      // Double check one last time before pushing to prevent race conditions within the same cycle loop
      if (watchItems.some(w => w.address && w.address.toLowerCase() === tokenAddress.toLowerCase()) || 
          autopilotTradedMints.some(m => m.toLowerCase() === tokenAddress.toLowerCase())) {
        continue;
      }
      
      // Place the automated order in the watchlist
      const tradeAmount = appConfig.autoTraderAmount ?? 50;
      const stopLossPct = appConfig.autoTraderStopLoss ?? 10;
      const takeProfit1Pct = appConfig.autoTraderTakeProfit1 ?? 8;
      const takeProfit2Pct = appConfig.autoTraderTakeProfit2 ?? 15;
      
      const newItem = {
        symbol: p.baseToken.symbol,
        pair: p.baseToken.name || p.baseToken.symbol,
        network: 'solana',
        address: tokenAddress,
        pairAddress: p.pairAddress,
        currentPrice: currentPrice,
        prevPrice: currentPrice,
        lastUpdate: Date.now(),
        slPrice: buyPrice * (1 - stopLossPct / 100),
        tp1Price: buyPrice * (1 + takeProfit1Pct / 100),
        tp2Price: buyPrice * (1 + takeProfit2Pct / 100),
        tp1Hit: false,
        tp2Hit: false,
        orders: [
          {
            level: 1,
            price: buyPrice,
            amount: tradeAmount,
            note: `Pared de soporte detectada a $${fpZ(wallPrice, wallPrice)} (+0.2% offset) | ${wallSourceLabel}`,
            status: 'pending',
            type: 'dca',
            sl: stopLossPct,
            tp1: takeProfit1Pct,
            tp2: takeProfit2Pct
          }
        ]
      };
      
      watchItems.push(newItem);
      if (!autopilotTradedMints.some(m => m.toLowerCase() === tokenAddress.toLowerCase())) {
        autopilotTradedMints.push(tokenAddress);
      }
      saveState();
      
      addLog(`🤖 <b>[Copiloto] ORDEN AUTOMÁTICA COLOCADA</b> para <b>${p.baseToken.symbol}</b> en pared de soporte a $${fpZ(buyPrice, buyPrice)} (Monto: $${tradeAmount}, SL: -${stopLossPct}%, TP1: +${takeProfit1Pct}%, TP2: +${takeProfit2Pct}%, Fuente: ${wallSourceLabel})`, 'info');
      sendTelegram(`🤖 <b>[Copiloto Auto-Trading]</b>\n\n🎯 <b>Nueva Orden en Pared de Soporte</b>\nMoneda: <b>${p.baseToken.symbol}</b>\nEntrada en Soporte: <code>$${fpZ(buyPrice, buyPrice)}</code>\nMonto: $${tradeAmount} USD\n🛡️ Seguridad: PASADA (Score: ${safety.details?.rugcheckScore ?? 0}/100)\n📖 Fuente: ${wallSourceLabel}\n\n<i>El bot comprará automáticamente cuando el precio retroceda al soporte.</i>`).catch(() => {});
      
      break; // Limit to 1 token per cycle
    }
  } catch (err) {
    console.error("Error in executeAutoTraderCycle:", err);
  } finally {
    isAutoTraderCycleRunning = false;
  }
}

let solanaTimer = null;
let depositTimer = null;

async function checkPendingDeposits() {
  if (solMode !== 'wallet' && solMode !== 'pool') return;
  const poolPk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
  if (!poolPk) return;
  
  const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
  
  try {
    const connection = new Connection(rpcUrl, 'confirmed');
    const poolKeypair = Keypair.fromSecretKey(bs58.decode(poolPk));
    const isSOL = (appConfig.solanaBaseToken !== 'USDC');
    const baseMintStr = isSOL ? 'So11111111111111111111111111111111111111112' : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const baseMint = new PublicKey(baseMintStr);
    
    for (let inv of poolConfig.investors) {
      if (inv.depositStatus === 'pending_user' && inv.depositWalletPk) {
        try {
          const invKeypair = Keypair.fromSecretKey(bs58.decode(inv.depositWalletPk));
          
          if (isSOL) {
            const balance = await connection.getBalance(invKeypair.publicKey);
            const balanceDecimals = balance / 1e9;
            if (balanceDecimals >= 0.05) { 
              inv.depositStatus = 'active';
              inv.deposit += balanceDecimals;
              saveState();
              addLog(`Depósito detectado y activado de ${inv.name}: ${balanceDecimals} SOL`, 'info');
            }
          } else {
            // USDC Check
            const invTokenAccountAddress = await getAssociatedTokenAddress(baseMint, invKeypair.publicKey);
            try {
              const accountInfo = await connection.getTokenAccountBalance(invTokenAccountAddress);
              const balance = Number(accountInfo.value.amount);
              const balanceDecimals = balance / 1e6;
              if (balanceDecimals >= 10) {
                inv.depositStatus = 'active';
                inv.deposit = balanceDecimals;
                saveState();
                addLog(`Depósito detectado y activado de ${inv.name}: $${balanceDecimals} USDC`, 'info');
              }
            } catch (e) {
              // Token account might not exist if they haven't deposited yet, ignore
            }
          }
        } catch (e) {
          console.error('Error procesando depósito para ' + inv.name, e.message);
        }
      }
    }
  } catch (e) {
    console.error('Error en checkPendingDeposits:', e.message);
  }
}

let whaleCache = {};
let whaleMonitorInterval = null;

async function runWhaleMonitor() {
  if (!monitorOn) return;
  const solanaItems = watchItems.filter(w => w.network === 'solana' && w.address);
  if (!solanaItems.length) return;

  const rpcs = [
    appConfig.solanaRpcUrl,
    ...RPC_ENDPOINTS_BASE.filter(u => u !== appConfig.solanaRpcUrl)
  ].filter(Boolean);

  let connection = null;
  for (const rpc of rpcs) {
    try { connection = new Connection(rpc, 'confirmed'); await connection.getSlot(); break; } catch (e) {}
  }
  if (!connection) return;

  const SYSTEM_PROGRAM = '11111111111111111111111111111111111111111';

  for (const w of solanaItems) {
    const mintStr = w.address;
    if (!whaleCache[mintStr]) {
       try {
         const tokenMint = new PublicKey(mintStr);
         const mintInfo = await getMint(connection, tokenMint);
         const decimals = mintInfo.decimals;
         let totalSupply = Number(mintInfo.supply) / (10 ** decimals);
         
         const largest = await connection.getTokenLargestAccounts(tokenMint);
         if (!largest.value || largest.value.length === 0) continue;

         const rawHolders = [];
         const ownerPubkeys = [];
         for (const acc of largest.value.slice(0, 10)) {
           try {
             const info = await getAccount(connection, acc.address);
             const amount = Number(acc.amount) / (10 ** decimals);
             rawHolders.push({ address: acc.address, owner: info.owner, amount });
             ownerPubkeys.push(info.owner);
           } catch (e) {}
         }

         let ownerInfos = [];
         try { ownerInfos = await connection.getMultipleAccountsInfo(ownerPubkeys); } catch(e) {}
         
         const realHolders = rawHolders.map((h, i) => {
           const ownerAccInfo = ownerInfos[i];
           const isPool = ownerAccInfo ? ownerAccInfo.owner.toString() !== SYSTEM_PROGRAM : false;
           return { address: h.address, owner: h.owner.toString(), amount: h.amount, initialAmount: h.amount, netChange: 0, isPool, history: [] };
         }).filter(h => !h.isPool);

         whaleCache[mintStr] = { totalSupply, decimals, holders: realHolders };
       } catch (e) {
       }
    } else {
       const cache = whaleCache[mintStr];
       if (!cache.holders || cache.holders.length === 0) continue;

       const accountPubkeys = cache.holders.map(h => new PublicKey(h.address));
       try {
          const accInfos = await connection.getMultipleAccountsInfo(accountPubkeys);
          for (let i=0; i<cache.holders.length; i++) {
             const h = cache.holders[i];
             const info = accInfos[i];
             
             let currentAmount = 0;
             if (info && info.data && info.data.length >= 72) {
                const amountRaw = info.data.readBigUInt64LE(64);
                currentAmount = Number(amountRaw) / (10 ** cache.decimals);
             } else if (!info) {
                currentAmount = 0;
             } else {
                continue;
             }
             
             const diff = currentAmount - h.amount;
             const pctMoved = cache.totalSupply ? (Math.abs(diff) / cache.totalSupply) * 100 : 0;
             
             if (Math.abs(diff) > 0) {
                h.netChange += diff;
                h.history.unshift({ type: diff > 0 ? 'in' : 'out', amount: Math.abs(diff), time: Date.now() });
                if (h.history.length > 5) h.history.length = 5;

                if (pctMoved > 5) {
                   addLog(`¡BALLENA MOVIENDO FONDOS! Holder ${h.owner.slice(0,4)}...${h.owner.slice(-4)} movió ${pctMoved.toFixed(2)}% del supply de ${w.symbol}.`, 'alert');
                }
                h.amount = currentAmount;
             }
          }
       } catch (e) {}
    }
  }
}

function startLoop() {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = setInterval(() => {
    if (monitorOn) runCycle();
  }, monitorInterval * 1000);

  if (solanaTimer) clearInterval(solanaTimer);
  solanaTimer = setInterval(() => {
    if (monitorOn) {
      runSolanaCycle();
      
      if (appConfig.autoTraderEnabled) {
        autoTraderCounter++;
        if (autoTraderCounter >= 12) { // Cada 60 segundos (12 * 5s)
          autoTraderCounter = 0;
          executeAutoTraderCycle().catch(err => console.error("Error in executeAutoTraderCycle:", err));
        }
      }
    }
  }, 5000); // Relajado a 5 segundos gracias a WebSocket en tiempo real
  
  if (depositTimer) clearInterval(depositTimer);
  depositTimer = setInterval(() => {
    checkPendingDeposits();
  }, 60000); // Revisar depósitos cada minuto

  if (whaleMonitorInterval) clearInterval(whaleMonitorInterval);
  whaleMonitorInterval = setInterval(() => {
    if (monitorOn) runWhaleMonitor();
  }, 15000);

  syncSolanaSubscriptions().catch(err => console.error('Error starting subscriptions in startLoop:', err));
}

// Iniciar el loop si estaba encendido en el estado recuperado
startLoop();
connectSolanaWs();


// ============================================
// PUBLIC ENDPOINTS


// Endpoint para acciones desde la interfaz de administrador

app.get('/api/token/audit/:mint', adminAuth, async (req, res) => {
  const mint = req.params.mint;
  try {
    const url = `https://api.rugcheck.xyz/v1/tokens/${mint}/report`;
    const checkRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!checkRes.ok) throw new Error("Error fetching RugCheck data");
    const data = await checkRes.json();
    
    // Calcular metricas
    let top10 = 0;
    if (data.topHolders) {
      // Filtrar el par LP u otros marcados (a veces Raydium Authority)
      const filteredHolders = data.topHolders.filter(h => !h.isContract && !h.owner.includes("Raydium") && !h.owner.includes("5Q544fKrFoe6tsEbD7S8EmxPo")); // Una aproximacion basica
      top10 = data.topHolders.slice(0, 10).reduce((acc, h) => acc + h.pct, 0); // Tomaremos directo
    }
    
    let creatorPct = 0;
    if (data.creator && data.topHolders) {
      const creatorHolder = data.topHolders.find(h => h.owner === data.creator);
      if (creatorHolder) creatorPct = creatorHolder.pct;
    }
    
    const holders = data.totalHolders || 0;
    const noMint = data.mintAuthority === null;
    const noBlacklist = data.freezeAuthority === null;
    
    let lpLocked = 0;
    if (data.markets && data.markets.length > 0) {
      const market = data.markets[0];
      lpLocked = market.lpLockedPct || (market.lp ? market.lp.lpLockedPct : 0) || 0;
    }
    
    const risks = data.risks || [];
    let isPhishing = risks.some(r => r.name.toLowerCase().includes('phish'));
    let isBundled = risks.some(r => r.name.toLowerCase().includes('bundle'));
    let hasInsiders = risks.some(r => r.name.toLowerCase().includes('insider'));
    
    // Probabilidad Rugcheck (score alto = mal)
    let rugProb = (data.score || 0) * 1.5; // Aproximacion a % (0-100)
    if (rugProb > 100) rugProb = 99;

    res.json({
      available: true,
      top10: top10,
      dev: creatorPct,
      holders: holders,
      insiders: hasInsiders ? "Sí" : "0%",
      phishing: isPhishing ? "Sí" : "0%",
      bundler: isBundled ? "Sí" : "0%",
      dexPaid: "N/A", // API no nos da este dato exacto
      noMint: noMint,
      noBlacklist: noBlacklist,
      lpBurned: lpLocked,
      rugProb: rugProb.toFixed(1) + "%"
    });
  } catch(e) {
    console.error("[Token Audit Error]", e.message);
    res.json({ available: false, error: e.message });
  }
});

app.post('/api/action', adminAuth, async (req, res) => {
  const { action, payload } = req.body;
  if (!action) return res.status(400).json({error: 'Action required'});

  try {
    if (action === 'setMode') {
      if (payload.mode) {
        mode = payload.mode;
        addLog(`Modo cambiado a: ${mode.toUpperCase()}`, 'warn');
      }
      if (payload.solMode) {
        solMode = payload.solMode;
        addLog(`Modo Solana cambiado a: ${solMode === 'sim' ? 'SIMULADO' : (solMode === 'wallet' ? 'WALLET REAL' : 'POOL REAL')}`, 'warn');
      }
    } else if (action === 'start') {
      monitorOn = true;
      if (payload.interval) monitorInterval = payload.interval;
      addLog(`▶️ Monitor INICIADO (${monitorInterval}s)`, 'info');
      startLoop();
    } else if (action === 'stop') {
      monitorOn = false;
      addLog(`⏸️ Monitor DETENIDO`, 'warn');
    } else if (action === 'updateInterval') {
      monitorInterval = payload.interval;
      addLog(`⏱️ Intervalo cambiado a ${monitorInterval}s`, 'info');
      startLoop();
    } else if (action === 'addWatch') {
      watchItems.push(payload);
      addLog(`👀 Moneda agregada: ${payload.symbol}`, 'info');
    } else if (action === 'removeWatch') {
      watchItems.splice(payload.index, 1);
    } else if (action === 'clearWatch') {
      watchItems = payload.items || [];
      addLog(`🧹 Watchlist limpiada`, 'info');
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
        addLog(`✅ Orden manual FILL: ${w.symbol} a ${o.price}`, 'buy');
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
        const filled = w.orders.filter(o => o.status === 'filled' || o.status === 'done');
        if (filled.length > 0) {
          const inv = filled.reduce((a, o) => a + o.amount, 0);
          const avg = filled.reduce((a, o) => a + o.price * o.amount, 0) / inv;
          let cp = 0;
          if (w.network === 'solana') {
            cp = await getSolanaPrice(w.address);
          } else {
            cp = await mxPrice(w.symbol);
          }
          if (!cp || cp <= 0) cp = w.currentPrice || avg;
          
          let pnlP = ((cp - avg) / avg * 100);
          let pnl = inv * pnlP / 100;
          
          addLog(`⚡ [Cierre Manual] Disparando cierre de posición para ${w.symbol}...`, 'info');
          const realRes = await executeOrder(w, 'SELL', inv + pnl, cp);
          if (realRes && realRes.ok) {
            if (realRes.exactAmountUSDT !== undefined) {
              pnl = realRes.exactAmountUSDT - inv;
              pnlP = (pnl / inv) * 100;
              addLog(`ℹ️ [Cierre Manual Real] PNL exacto ajustado post-swap: $${pnl.toFixed(2)}`, 'info');
            }
            if (w.network === 'solana') {
              if (solMode !== 'wallet' && solMode !== 'pool') {
                SIM.balance += inv + pnl;
                SIM.solBalance -= (inv / avg);
              }
            } else {
              if (mode !== 'real') {
                SIM.balance += inv + pnl;
              }
            }
            SIM.pnl += pnl; distributePnL(pnl);
            if (pnl >= 0) SIM.wins++; else SIM.losses++;
            SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: (realRes.exactPrice || cp), pnl, pnlPct: pnlP.toFixed(2), at: Date.now() });
            
            w.orders.forEach(o => { 
              if (o.status === 'filled' || o.status === 'done') o.status = 'closed'; 
              if (o.status === 'pending') o.status = 'cancelled';
            });
            w.slPrice = null; w.tp1Price = null; w.tp2Price = null; w.tp1Hit = false; w.tp2Hit = false;
            addLog(`📉 Posición cerrada manualmente: ${w.symbol} (Entrada: $${fpZ(avg,avg)} ➡ Salida: $${fpZ(cp,cp)}) · P&L $${pnl.toFixed(2)} (${pnlP.toFixed(1)}%)`, 'sell');
            
            watchItems.splice(payload.index, 1);
          } else {
            return res.status(500).json({ error: 'La venta de cierre real falló. Verifica fondos o red.' });
          }
        } else {
          // Fallback por si no hay órdenes 'filled' o 'done' pero se cerró manualmente
          let totalInv = 0;
          w.orders.forEach(o => { if (o.status === 'done' || o.status === 'filled') { totalInv += o.amount; o.status = 'closed'; } });
          SIM.balance += totalInv; 
          addLog(`📉 Posición cerrada manualmente (virtual/sin órdenes): ${w.symbol}`, 'sell');
          watchItems.splice(payload.index, 1);
        }
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
      const { symbol, network, address, pair, amount, sl = 10, tp1 = 8, tp2 = 15 } = payload;
      let w = watchItems.find(item => (address && item.address === address) || item.symbol === symbol);
      if (!w) {
        w = {
          symbol,
          network: network || 'solana',
          address,
          pair,
          orders: [],
          currentPrice: 0,
          prevPrice: 0
        };
        watchItems.push(w);
      }
      
      let cp = 0;
      if (w.network === 'solana') {
        cp = await getSolanaPrice(w.address);
      } else {
        cp = await mxPrice(w.symbol);
      }
      if (!cp || cp <= 0) cp = w.currentPrice || 1;
      
      addLog(`⚡ [Compra Mercado Rápida] Disparando swap compra para ${w.symbol} de ${amount}...`, 'info');
      const realRes = await executeOrder(w, 'BUY', amount, cp);
      if (realRes && realRes.ok) {
        const finalPrice = realRes.exactPrice || cp;
        w.currentPrice = finalPrice;
        
        const order = {
          level: w.orders.length + 1,
          price: finalPrice,
          amount: realRes.exactAmountUSDT || amount,
          sl, tp1, tp2,
          note: 'Compra de Mercado Rápida',
          status: 'filled',
          type: 'dca',
          filledAt: Date.now(),
          filledPrice: finalPrice
        };
        w.orders.push(order);
        
        if (!w.filledBuys) w.filledBuys = [];
        w.filledBuys.push({ price: finalPrice, amount: realRes.exactAmountUSDT || amount, level: order.level });
        
        if (!w.slPrice) {
          w.slPrice = finalPrice * (1 - sl/100);
          w.tp1Price = finalPrice * (1 + tp1/100);
          w.tp2Price = finalPrice * (1 + tp2/100);
        }
        
        if (w.network === 'solana') {
          if (solMode !== 'wallet' && solMode !== 'pool') {
            SIM.balance -= amount;
            SIM.solBalance += amount / cp;
          }
        } else {
          if (mode !== 'real') {
            SIM.balance -= amount;
          }
        }
        SIM.totalExec++;
        addLog(`✅ COMPRA DE MERCADO COMPLETADA: ${w.symbol} · $${amount} a $${fpZ(cp,cp)}`, 'buy');
      } else {
        return res.status(500).json({ error: 'La compra real falló. Verifica fondos o red.' });
      }
    }
    
    saveState();
    if (['start', 'stop', 'addWatch', 'removeWatch', 'clearWatch', 'quickMarketBuy', 'closeTrade'].includes(action)) {
      syncSolanaSubscriptions().catch(err => console.error('Error syncing subscriptions in action:', err));
    }
    res.json({ ok: true, status: 'ok' });
  } catch(e) {
    console.error("Error en /api/action:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', (req, res) => {
  const pwd = appConfig.appPassword || process.env.APP_PASSWORD || 'admin123';
  if (req.body.password === pwd) res.json({status: 'ok', token: pwd});
  else res.status(401).json({error: 'Invalid password'});
});

app.post('/api/investor/login', async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Faltan datos' });
  const inv = poolConfig.investors.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (inv) {
    let isPasswordCorrect = false;
    try {
      isPasswordCorrect = await bcrypt.compare(password, inv.password);
    } catch (e) {
      isPasswordCorrect = (inv.password === password);
    }
    if (isPasswordCorrect) {
      const token = Buffer.from(`${name}:${password}`).toString('base64');
      return res.json({ status: 'ok', token, name: inv.name });
    }
  }
  res.status(401).json({ error: 'Credenciales inválidas' });
});

// ============================================
// INVESTOR MIDDLEWARE & ENDPOINTS
const investorAuth = async (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({error: 'Unauthorized Investor'});
  const token = auth.substring(7);
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [name, password] = decoded.split(':');
    const inv = poolConfig.investors.find(i => i.name.toLowerCase() === name.toLowerCase());
    if (inv) {
      let isPasswordCorrect = false;
      try {
        isPasswordCorrect = await bcrypt.compare(password, inv.password);
      } catch (e) {
        isPasswordCorrect = (inv.password === password);
      }
      if (isPasswordCorrect) {
        req.investor = inv;
        return next();
      }
    }
  } catch (e) {}
  res.status(401).json({error: 'Unauthorized Investor'});
};

app.get('/api/investor/me', investorAuth, async (req, res) => {
  const safePoolConfig = { 
    commissionRate: poolConfig.commissionRate 
  };
  
  // Get actual Solana balance for their personal wallet
  let solBalance = 0;
  let usdcBalance = 0;
  if (req.investor.depositWallet) {
    try {
      const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
      const connection = new Connection(rpcUrl, 'confirmed');
      const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
      solBalance = (await connection.getBalance(new PublicKey(req.investor.depositWallet))) / 1e9;
      usdcBalance = (await getTokenBalance(connection, req.investor.depositWallet, usdcMint)) / 1e6;
    } catch(e) {
      console.error('Error fetching investor wallet balance:', e);
    }
  }

  const safeInvestor = {
    name: req.investor.name,
    deposit: req.investor.deposit || 0,
    profit: req.investor.profit || 0,
    depositStatus: req.investor.depositStatus,
    depositWallet: req.investor.depositWallet,
    solBalance,
    usdcBalance
  };

  res.json({ poolConfig: safePoolConfig, trades: SIM.trades || [], me: safeInvestor });
});

app.post('/api/investor/deposit', investorAuth, (req, res) => {
  const { amount } = req.body;
  if (amount <= 0) return res.json({ error: 'Datos inválidos' });
  const inv = req.investor;
  inv.deposit += Number(amount);
  saveState();
  res.json({ success: true });
});

app.post('/api/investor/confirm_deposit', investorAuth, (req, res) => {
  const inv = req.investor;
  if (inv.depositStatus === 'pending_user') {
    inv.depositStatus = 'pending_admin';
    saveState();
  }
  res.json({ success: true });
});

app.post('/api/investor/request_withdraw', investorAuth, async (req, res) => {
  const { amount } = req.body;
  const inv = req.investor;
  const withdrawAmount = Number(amount);
  
  if (withdrawAmount <= 0) return res.json({ error: 'Monto inválido' });
  if (inv.profit + inv.deposit < withdrawAmount) return res.json({ error: 'Fondos insuficientes' });
  if (!inv.depositWallet) return res.json({ error: 'No tienes una wallet personal asignada' });
  
  // Procesamiento automático del retiro desde la wallet del Pool hacia la wallet personal del inversor
  if (poolConfig.privateKey) {
    try {
      const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
      const connection = new Connection(rpcUrl, 'confirmed');
      const kp = Keypair.fromSecretKey(bs58.decode(poolConfig.privateKey));
      const destPubkey = new PublicKey(inv.depositWallet);
      
      const isSOL = (appConfig.solanaBaseToken !== 'USDC');
      const baseMint = isSOL ? 'So11111111111111111111111111111111111111112' : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

      let txid;
      if (isSOL) {
         const lamports = Math.floor(withdrawAmount * 1e9);
         const bal = await connection.getBalance(kp.publicKey);
         if (bal < lamports + 5000) {
           return res.json({ error: `La wallet del Pool no tiene saldo suficiente. Saldo: ${bal/1e9} SOL. Necesario: ${(lamports+5000)/1e9} SOL` });
         }
         const tx = new Transaction().add(
           SystemProgram.transfer({
             fromPubkey: kp.publicKey,
             toPubkey: destPubkey,
             lamports: lamports
           })
         );
         tx.feePayer = kp.publicKey;
         const { blockhash } = await connection.getLatestBlockhash();
         tx.recentBlockhash = blockhash;
         tx.sign(kp);
         txid = await connection.sendRawTransaction(tx.serialize());
      } else {
         const withdrawRaw = Math.floor(withdrawAmount * 1e6);
         const poolTokenAccountAddress = await getAssociatedTokenAddress(new PublicKey(baseMint), kp.publicKey);
         let accountInfo;
         try {
           accountInfo = await connection.getTokenAccountBalance(poolTokenAccountAddress);
         } catch(e) {
           return res.json({ error: 'El Pool no tiene cuenta USDC' });
         }
         const balance = Number(accountInfo.value.amount);
         if (balance < withdrawRaw) {
            return res.json({ error: 'La wallet del Pool no tiene saldo USDC suficiente' });
         }
         
         const destTokenAccountAddress = await getAssociatedTokenAddress(new PublicKey(baseMint), destPubkey);
         const destAccountInfo = await connection.getAccountInfo(destTokenAccountAddress);
         
         const tx = new Transaction();
         if (!destAccountInfo) {
           tx.add(
             createAssociatedTokenAccountInstruction(
               kp.publicKey, // Pool pays for account creation
               destTokenAccountAddress,
               destPubkey,
               new PublicKey(baseMint)
             )
           );
         }
         tx.add(
           createTransferInstruction(
             poolTokenAccountAddress,
             destTokenAccountAddress,
             kp.publicKey,
             withdrawRaw,
             []
           )
         );
         tx.feePayer = kp.publicKey;
         const { blockhash } = await connection.getLatestBlockhash();
         tx.recentBlockhash = blockhash;
         tx.sign(kp);
         txid = await connection.sendRawTransaction(tx.serialize());
      }
      
      console.log('✅ Retiro automático procesado on-chain:', txid);
      
    } catch (e) {
      console.error('Fallo al ejecutar retiro automático:', e);
      return res.json({ error: 'Fallo al ejecutar transacción en Solana: ' + e.message });
    }
  }

  let remaining = withdrawAmount;
  if (inv.profit >= remaining) {
    inv.profit -= remaining;
  } else {
    remaining -= inv.profit;
    inv.profit = 0;
    inv.deposit -= remaining;
  }
  
  if (!poolConfig.withdrawalRequests) poolConfig.withdrawalRequests = [];
  
  poolConfig.withdrawalRequests.push({
    id: Date.now().toString() + Math.floor(Math.random()*1000),
    name: inv.name,
    amount: withdrawAmount,
    destinationWallet: inv.depositWallet,
    status: 'approved',
    createdAt: Date.now(),
    auto: true
  });
  
  saveState();
  res.json({ success: true });
});

app.post('/api/investor/transfer_external', investorAuth, async (req, res) => {
  const { amount, destinationWallet } = req.body;
  const inv = req.investor;
  const withdrawAmount = Number(amount);
  
  if (withdrawAmount <= 0) return res.json({ error: 'Monto inválido' });
  if (!inv.depositWalletPk) return res.json({ error: 'No tienes una wallet personal activa' });
  if (!poolConfig.privateKey) return res.json({ error: 'El Pool no tiene llaves para pagar comisiones' });

  try {
    const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    
    const invKeypair = Keypair.fromSecretKey(bs58.decode(inv.depositWalletPk));
    const poolKeypair = Keypair.fromSecretKey(bs58.decode(poolConfig.privateKey));
    
    const isSOL = (appConfig.solanaBaseToken !== 'USDC');
    const baseMint = isSOL ? 'So11111111111111111111111111111111111111112' : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

    if (isSOL) {
      // Transfer SOL
      const balance = await connection.getBalance(invKeypair.publicKey);
      const withdrawLamports = Math.floor(withdrawAmount * 1e9);
      if (balance < withdrawLamports) return res.json({ error: 'Saldo insuficiente en tu wallet personal' });
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: invKeypair.publicKey,
          toPubkey: new PublicKey(destinationWallet),
          lamports: withdrawLamports,
        })
      );
      transaction.feePayer = poolKeypair.publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.sign(invKeypair, poolKeypair);
      const txid = await connection.sendRawTransaction(transaction.serialize());
      
      return res.json({ success: true, txid });
    } else {
      // Transfer USDC
      const invTokenAccountAddress = await getAssociatedTokenAddress(new PublicKey(baseMint), invKeypair.publicKey);
      let accountInfo;
      try {
        accountInfo = await connection.getTokenAccountBalance(invTokenAccountAddress);
      } catch (e) {
        return res.json({ error: 'No tienes saldo de USDC en tu wallet personal' });
      }
      
      const balance = Number(accountInfo.value.amount);
      const withdrawRaw = Math.floor(withdrawAmount * 1e6);
      if (balance < withdrawRaw) return res.json({ error: 'Saldo USDC insuficiente en tu wallet personal' });
      
      const destPubkey = new PublicKey(destinationWallet);
      const destTokenAccountAddress = await getAssociatedTokenAddress(new PublicKey(baseMint), destPubkey);
      
      // We must check if destination token account exists, if not, create it!
      const destAccountInfo = await connection.getAccountInfo(destTokenAccountAddress);
      const transaction = new Transaction();
      
      if (!destAccountInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            poolKeypair.publicKey, // Pool pays for account creation
            destTokenAccountAddress,
            destPubkey,
            new PublicKey(baseMint)
          )
        );
      }

      transaction.add(
        createTransferInstruction(
          invTokenAccountAddress,
          destTokenAccountAddress,
          invKeypair.publicKey,
          withdrawRaw,
          []
        )
      );
      
      transaction.feePayer = poolKeypair.publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.sign(invKeypair, poolKeypair);
      
      const txid = await connection.sendRawTransaction(transaction.serialize());
      return res.json({ success: true, txid });
    }
  } catch (e) {
    console.error('Error en transferencia externa:', e);
    return res.json({ error: e.message || 'Error desconocido' });
  }
});

app.post('/api/investor/recover_rent', investorAuth, async (req, res) => {
  const inv = req.investor;
  if (!inv.depositWalletPk) {
    return res.json({ error: 'No tienes una wallet personal activa' });
  }
  if (!poolConfig.privateKey) {
    return res.json({ error: 'El Pool no tiene llaves configuradas' });
  }

  try {
    const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    const result = await closeEmptyTokenAccounts(connection, inv.depositWalletPk, poolConfig.privateKey);

    if (result.success) {
      if (result.closedCount > 0) {
        addLog(`🧹 [Rent Recovery] El inversor ${inv.name} liberó ${result.closedCount} cuentas de tokens vacías y recuperó +${result.solRecovered.toFixed(5)} SOL de Rent.`, 'info');
      }
      return res.json({
        success: true,
        closedCount: result.closedCount,
        solRecovered: result.solRecovered,
        txids: result.txids
      });
    } else {
      return res.json({ error: 'No se pudo completar el proceso de recuperación' });
    }
  } catch (e) {
    console.error('Error recovering rent for investor:', e);
    return res.json({ error: e.message || 'Error desconocido al intentar recuperar Rent' });
  }
});


// ============================================
// ADMIN MIDDLEWARE
app.use('/api', (req, res, next) => {
  // If it's a public or investor route that we already matched, skip this (Express already processed it above if matched)
  // Actually, express will hit this for any /api route not matched above.
  const pwd = appConfig.appPassword || process.env.APP_PASSWORD || 'admin123';
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${pwd}`) return res.status(401).json({error: 'Unauthorized'});
  next();
});

// ADMIN ENDPOINTS

app.get('/api/pool/rent_preview', adminAuth, async (req, res) => {
  if (!poolConfig.privateKey) return res.json({ error: 'La wallet del Pool no tiene llaves configuradas' });
  try {
    const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
    const connection = new Connection(rpcUrl, 'confirmed');
    const ownerKeypair = Keypair.fromSecretKey(bs58.decode(poolConfig.privateKey));
    const emptyAccounts = await getEmptyTokenAccounts(connection, ownerKeypair.publicKey);
    res.json({
      success: true,
      count: emptyAccounts.length,
      estimatedSolRecovered: +(emptyAccounts.length * 0.002039).toFixed(5),
      accounts: emptyAccounts.map(a => ({ mint: a.mint, pubkey: a.pubkey.toString() }))
    });
  } catch (e) {
    res.json({ error: e.message || 'Error de red o de RPC al revisar cuentas' });
  }
});

app.post('/api/pool/recover_rent', adminAuth, async (req, res) => {
  if (!poolConfig.privateKey) {
    return res.json({ error: 'La wallet del Pool no tiene llaves configuradas' });
  }

  try {
    const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    const result = await closeEmptyTokenAccounts(connection, poolConfig.privateKey);

    if (result.success) {
      if (result.closedCount > 0) {
        addLog(`🧹 [Pool Rent Recovery] El administrador liberó ${result.closedCount} cuentas de tokens vacías de la wallet central y recuperó +${result.solRecovered.toFixed(5)} SOL de Rent.`, 'info');
      }
      return res.json({
        success: true,
        closedCount: result.closedCount,
        solRecovered: result.solRecovered,
        txids: result.txids
      });
    } else {
      return res.json({ error: 'No se pudo completar el proceso de recuperación del Pool' });
    }
  } catch (e) {
    console.error('Error recovering rent for pool:', e);
    return res.json({ error: e.message || 'Error de red o de RPC al recuperar Rent del Pool' });
  }
});

app.get('/api/pool/backup', adminAuth, (req, res) => {
  if (poolConfig.privateKey) {
    res.json({ success: true, privateKey: poolConfig.privateKey });
  } else {
    res.json({ error: 'No hay llave privada generada' });
  }
});

app.get('/api/quote-sol-usdc', adminAuth, async (req, res) => {
  try {
    const { amount, side } = req.query;
    if (!amount || amount <= 0) return res.json({ expectedOutput: 0 });
    const inputMint = side === 'buy' ? 'So11111111111111111111111111111111111111112' : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const outputMint = side === 'buy' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : 'So11111111111111111111111111111111111111112';
    const rawAmount = Math.floor(amount * (side === 'buy' ? 1e9 : 1e6));
    
    const slippageBps = Math.round((appConfig.solanaSlippage || 2.5) * 100);
    const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&slippageBps=${slippageBps}`;
    const qr = await fetchWithRetry(quoteUrl, { timeout: 8000 }, 2, 1000);
    if (!qr.ok) return res.status(500).json({ error: 'Error obteniendo cotización' });
    const quoteResponse = await qr.json();
    
    const outAmount = quoteResponse.outAmount / (side === 'buy' ? 1e6 : 1e9);
    res.json({ 
        expectedOutput: outAmount,
        priceImpactPct: quoteResponse.priceImpactPct,
        routePlan: quoteResponse.routePlan
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/swap-sol-usdc', adminAuth, async (req, res) => {
  try {
    const { amount, side, force } = req.body;
    const pk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
    if (!pk) return res.status(400).json({ error: 'No se encontró la llave privada' });
    
    const keypair = Keypair.fromSecretKey(bs58.decode(pk));
    const userPublicKey = keypair.publicKey.toString();

    const inputMint = side === 'buy' ? 'So11111111111111111111111111111111111111112' : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const outputMint = side === 'buy' ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' : 'So11111111111111111111111111111111111111112';
    const rawAmount = Math.floor(amount * (side === 'buy' ? 1e9 : 1e6));

    const slippageBps = Math.round((appConfig.solanaSlippage || 2.5) * 100);
    const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&slippageBps=${slippageBps}&prioritizationFeeLamports=auto`;
    const qr = await fetchWithRetry(quoteUrl, { timeout: 8000 }, 3, 1500);
    if (!qr.ok) return res.status(500).json({ error: 'Error obteniendo cotización' });
    const quoteResponse = await qr.json();

    const swapRes = await fetchWithRetry('https://api.jup.ag/swap/v1/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto'
      })
    });
    const swapData = await swapRes.json();
    if (!swapData.swapTransaction) return res.status(500).json({ error: 'Error ejecutando el swap' });

    const tx = VersionedTransaction.deserialize(Buffer.from(swapData.swapTransaction, 'base64'));
    
    const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    if (!force) {
      try {
        const feeInfo = await connection.getFeeForMessage(tx.message, 'confirmed');
        if (feeInfo && feeInfo.value !== null) {
          const feeSol = feeInfo.value / 1e9;
          const feeLimit = appConfig.solanaFeeLimit || 0.05;
          if (feeSol > feeLimit) {
            console.warn(`⚠️ ALERTA: Swap fee estimado (${feeSol.toFixed(6)} SOL) excede el umbral de ${feeLimit} SOL.`);
            return res.status(409).json({ error: `La tarifa de gas es alta: ${feeSol.toFixed(6)} SOL. ¿Continuar?`, fee: feeSol });
          }
        }
      } catch (e) {
        console.warn('⚠️ No se pudo estimar el fee del swap, omitiendo chequeo.', e);
      }
    }

    tx.sign([keypair]);
    const txid = await connection.sendRawTransaction(tx.serialize());
    
    res.json({ success: true, txid });
  } catch (e) {
    console.error('Error in swap:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/pool/rotate_wallet', adminAuth, async (req, res) => {
  try {
    const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    const oldPkStr = poolConfig.privateKey || process.env.POOL_PRIVATE_KEY || process.env.SOLANA_PRIVATE_KEY;
    let oldKeypair = null;
    if (oldPkStr) {
      try {
        oldKeypair = Keypair.fromSecretKey(bs58.decode(oldPkStr.trim()));
      } catch (e) {
        console.error("Error decoding old private key:", e);
      }
    }

    const kp = Keypair.generate();
    const newPrivateKey = bs58.encode(kp.secretKey);
    const newWalletAddress = kp.publicKey.toBase58();
    
    let transferInfo = "";
    
    if (oldKeypair) {
      try {
        const usdcMintStr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        const usdcMint = new PublicKey(usdcMintStr);
        
        let usdcAmount = 0n;
        let oldUsdcAccountAddr = await getAssociatedTokenAddress(usdcMint, oldKeypair.publicKey);
        try {
          const usdcAccountInfo = await connection.getTokenAccountBalance(oldUsdcAccountAddr);
          if (usdcAccountInfo && usdcAccountInfo.value && Number(usdcAccountInfo.value.amount) > 0) {
            usdcAmount = BigInt(usdcAccountInfo.value.amount);
          }
        } catch(e) {}
        
        const solBalance = await connection.getBalance(oldKeypair.publicKey);
        
        // Base gas conservative estimate (tx size might require less, but better safe)
        let estimatedFee = 5000;
        let rentExempt = 0;
        if (usdcAmount > 0n) {
          rentExempt = await connection.getMinimumBalanceForRentExemption(165); // SPL Token account size
        }

        let solToSend = solBalance - estimatedFee - rentExempt;

        if (solToSend > 0 || (usdcAmount > 0n && solBalance >= estimatedFee + rentExempt)) {
           let tx = new Transaction();
           const newUsdcAccountAddr = await getAssociatedTokenAddress(usdcMint, kp.publicKey);
           
           if (usdcAmount > 0n) {
             tx.add(
               createAssociatedTokenAccountInstruction(
                 oldKeypair.publicKey,
                 newUsdcAccountAddr,
                 kp.publicKey,
                 usdcMint
               )
             );
             tx.add(
               createTransferInstruction(
                 oldUsdcAccountAddr,
                 newUsdcAccountAddr,
                 oldKeypair.publicKey,
                 usdcAmount
               )
             );
           }
           
           if (solToSend > 0) {
             tx.add(
               SystemProgram.transfer({
                 fromPubkey: oldKeypair.publicKey,
                 toPubkey: kp.publicKey,
                 lamports: solToSend
               })
             );
           }
           
           const latestBlockHash = await connection.getLatestBlockhash();
           tx.recentBlockhash = latestBlockHash.blockhash;
           tx.feePayer = oldKeypair.publicKey;
           
           // Refine solToSend with real fee
           const fee = (await connection.getFeeForMessage(tx.compileMessage(), 'confirmed')).value || 5000;
           solToSend = solBalance - fee - rentExempt;
           
           if (solToSend >= 0) {
             // Rebuild TX with exact sol amount
             tx = new Transaction();
             if (usdcAmount > 0n) {
               tx.add(
                 createAssociatedTokenAccountInstruction(
                   oldKeypair.publicKey,
                   newUsdcAccountAddr,
                   kp.publicKey,
                   usdcMint
                 )
               );
               tx.add(
                 createTransferInstruction(
                   oldUsdcAccountAddr,
                   newUsdcAccountAddr,
                   oldKeypair.publicKey,
                   usdcAmount
                 )
               );
             }
             if (solToSend > 0) {
               tx.add(
                 SystemProgram.transfer({
                   fromPubkey: oldKeypair.publicKey,
                   toPubkey: kp.publicKey,
                   lamports: solToSend
                 })
               );
             }
             
             if (tx.instructions.length > 0) {
               tx.recentBlockhash = latestBlockHash.blockhash;
               tx.feePayer = oldKeypair.publicKey;
               tx.sign(oldKeypair);
               
               const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
               await connection.confirmTransaction(txid, 'confirmed');
               transferInfo = `\nSe transfirió el saldo (${(solToSend/1e9).toFixed(4)} SOL, ${(Number(usdcAmount)/1e6).toFixed(2)} USDC) a la nueva wallet (Tx: ${txid.slice(0, 8)}...).`;
               console.log(`✅ Saldo transferido a nueva wallet: Tx ${txid}`);
             }
           } else {
             transferInfo = `\n⚠️ No había suficiente SOL en la wallet anterior para pagar el gas de la transferencia.`;
           }
        }
      } catch (e) {
        console.error("Error transfiriendo fondos a la nueva wallet:", e);
        transferInfo = `\n⚠️ Hubo un error al intentar transferir los fondos de la billetera anterior. Conserva la private key anterior para recuperarlos manualmente. (${e.message})`;
      }
    }

    poolConfig.privateKey = newPrivateKey;
    poolConfig.walletAddress = newWalletAddress;
    saveState();
    
    console.log("✅ Billetera del Pool rotada manualmente:", poolConfig.walletAddress);
    console.log(`⚠️ ¡IMPORTANTE! Copia esta private key y agrégala al archivo .env como POOL_PRIVATE_KEY=${poolConfig.privateKey} ya que ya no se persiste en el estado.`);
    
    sendTelegram(`🔄 <b>Rotación de Wallet del Pool</b>\n\nSe ha generado una nueva wallet para el sistema.${transferInfo}\n\nPublic: <code>${poolConfig.walletAddress}</code>\n\nrevisa la consola del servidor para copiar la private key.\n\nPor favor, guarda la private key de forma segura y configúrala en tu archivo .env.`);
    
    res.json({ success: true, walletAddress: poolConfig.walletAddress, transferInfo });
  } catch (e) {
    console.error("Error en /api/pool/rotate_wallet:", e);
    res.status(500).json({ error: 'Error interno rotando wallet: ' + e.message });
  }
});

app.get('/api/pool', (req, res) => {
  const safePoolConfig = { ...poolConfig };
  delete safePoolConfig.privateKey;
  if (safePoolConfig.investors) {
    safePoolConfig.investors = safePoolConfig.investors.map(inv => {
      const safeInv = { ...inv };
      delete safeInv.depositWalletPk;
      delete safeInv.password;
      return safeInv;
    });
  }
  res.json({ poolConfig: safePoolConfig, trades: SIM.trades || [], solBalance: solanaSolBalance, usdcBalance: solanaUsdcBalance });
});

app.post('/api/pool/investor', adminAuth, async (req, res) => {
  const { name, amount, password, depositWallet } = req.body;
  if (!name) return res.json({ error: 'Falta el nombre' });
  
  let inv = poolConfig.investors.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (!inv) {
    let generatedWallet = depositWallet;
    let generatedPk = null;
    if (!generatedWallet) {
      try {
        const kp = Keypair.generate();
        generatedWallet = kp.publicKey.toString();
        generatedPk = bs58.encode(kp.secretKey);
        
        console.log(`🔑 Private key para inversor ${name}: ${generatedPk}`);
        sendTelegram(`🚨 <b>Backup de Nueva Wallet de Inversor</b>\n\nInversor: ${name}\n\nPublic: <code>${generatedWallet}</code>\n\nrevisa la consola del servidor para copiar la private key.\n\nPor favor, guarda la private key de forma segura.`);
      } catch(e) {
        console.error('Error generating deposit wallet:', e);
      }
    }
    
    inv = { 
      name, 
      deposit: 0, 
      profit: 0, 
      joinedAt: Date.now(), 
      password: await bcrypt.hash(password || '1234', 10),
      expectedDeposit: Number(amount) || 0,
      depositStatus: (Number(amount) > 0) ? 'pending_user' : 'active',
      depositWallet: generatedWallet || '',
      depositWalletPk: generatedPk || ''
    };
    poolConfig.investors.push(inv);
  } else {
    if (password) inv.password = await bcrypt.hash(password, 10);
    if (depositWallet) inv.depositWallet = depositWallet;
    if (amount && Number(amount) > 0) {
      inv.expectedDeposit = (inv.expectedDeposit || 0) + Number(amount);
      inv.depositStatus = 'pending_user';
    }
  }
  
  saveState();
  res.json({ success: true, poolConfig: getSafePoolConfig() });
});

app.post('/api/pool/delete_investor', adminAuth, (req, res) => {
  const { name } = req.body;
  const initialLength = poolConfig.investors.length;
  poolConfig.investors = poolConfig.investors.filter(i => i.name.toLowerCase() !== name.toLowerCase());
  
  if (poolConfig.investors.length === initialLength) {
    return res.json({ error: 'Inversor no encontrado' });
  }
  
  saveState();
  res.json({ success: true });
});

app.post('/api/pool/approve_deposit', adminAuth, (req, res) => {
  const { name, amount } = req.body;
  let inv = poolConfig.investors.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (inv && (inv.depositStatus === 'pending_admin' || inv.depositStatus === 'pending_user')) {
    inv.deposit += (amount !== undefined ? Number(amount) : (inv.expectedDeposit || 0));
    inv.expectedDeposit = 0;
    inv.depositStatus = 'active';
    saveState();
  }
  res.json({ success: true, poolConfig: getSafePoolConfig() });
});

app.post('/api/pool/edit_investor_deposit', adminAuth, (req, res) => {
  const { name, amount } = req.body;
  let inv = poolConfig.investors.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (inv) {
    inv.deposit = Number(amount) || 0;
    saveState();
  }
  res.json({ success: true, poolConfig: getSafePoolConfig() });
});

app.post('/api/pool/sync_investor_deposit', adminAuth, async (req, res) => {
  const { name } = req.body;
  let inv = poolConfig.investors.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (inv && inv.depositWallet) {
    try {
      const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
      const connection = new Connection(rpcUrl, 'confirmed');
      const baseMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC
      const invTokenAccountAddress = await getAssociatedTokenAddress(baseMint, new PublicKey(inv.depositWallet));
      const accountInfo = await connection.getTokenAccountBalance(invTokenAccountAddress);
      const balance = Number(accountInfo.value.amount) / 1e6;
      inv.deposit = balance;
      inv.depositStatus = 'active';
      saveState();
      res.json({ success: true, poolConfig: getSafePoolConfig(), balance });
    } catch (e) {
      console.error('Error syncing deposit:', e.message);
      // If error (e.g., token account doesn't exist), maybe balance is 0
      inv.deposit = 0;
      saveState();
      res.json({ success: true, poolConfig: getSafePoolConfig(), balance: 0, note: 'Token account no encontrado (0 USDC)' });
    }
  } else {
    res.json({ error: 'Inversor no encontrado o sin wallet' });
  }
});

app.post('/api/pool/config', adminAuth, (req, res) => {
  const { walletAddress, commissionRate } = req.body;
  if (walletAddress !== undefined) poolConfig.walletAddress = walletAddress;
  if (commissionRate !== undefined) poolConfig.commissionRate = Number(commissionRate);
  saveState();
  res.json({ success: true, poolConfig: getSafePoolConfig() });
});

app.post('/api/pool/request_withdraw', adminAuth, (req, res) => {
  const { name, amount, destinationWallet } = req.body;
  const inv = poolConfig.investors.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (!inv) return res.json({ error: 'Inversor no encontrado' });
  const withdrawAmount = Number(amount);
  if (withdrawAmount <= 0) return res.json({ error: 'Monto inválido' });
  
  if (!poolConfig.withdrawalRequests) poolConfig.withdrawalRequests = [];
  
  const pendingAmount = poolConfig.withdrawalRequests
    .filter(r => r.name === inv.name && r.status === 'pending')
    .reduce((sum, r) => sum + r.amount, 0);

  if (inv.profit + inv.deposit < withdrawAmount + pendingAmount) {
    return res.json({ error: 'Fondos insuficientes (retiros pendientes)' });
  }
  
  poolConfig.withdrawalRequests.push({
    id: Date.now().toString() + Math.floor(Math.random()*1000),
    name: inv.name,
    amount: withdrawAmount,
    destinationWallet,
    status: 'pending',
    createdAt: Date.now()
  });
  
  saveState();
  res.json({ success: true, poolConfig: getSafePoolConfig() });
});

app.post('/api/pool/approve_withdraw', adminAuth, async (req, res) => {
  const { id } = req.body;
  if (!poolConfig.withdrawalRequests) poolConfig.withdrawalRequests = [];
  const reqIdx = poolConfig.withdrawalRequests.findIndex(r => r.id === id);
  if (reqIdx === -1) return res.json({ error: 'Solicitud no encontrada' });
  
  const request = poolConfig.withdrawalRequests[reqIdx];
  if (request.status !== 'pending') return res.json({ error: 'La solicitud ya fue procesada' });

  const inv = poolConfig.investors.find(i => i.name === request.name);
  if (!inv) return res.json({ error: 'Inversor no encontrado' });
  
  const withdrawAmount = request.amount;
  if (inv.profit + inv.deposit < withdrawAmount) return res.json({ error: 'Fondos insuficientes al momento de procesar' });
  
  // Si la pool tiene una wallet y la solicitud tiene wallet de destino, enviamos en la red real
  if (poolConfig.privateKey && request.destinationWallet) {
    try {
      const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
      const connection = new Connection(rpcUrl, 'confirmed');
      const kp = Keypair.fromSecretKey(bs58.decode(poolConfig.privateKey));
      const destPubkey = new PublicKey(request.destinationWallet);
      
      const isSOL = (appConfig.solanaBaseToken !== 'USDC');
      const baseMint = isSOL ? 'So11111111111111111111111111111111111111112' : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

      let txid;
      if (isSOL) {
         const lamports = Math.floor(withdrawAmount * 1e9);
         const bal = await connection.getBalance(kp.publicKey);
         if (bal < lamports + 5000) {
           return res.json({ error: `La wallet del Pool no tiene saldo suficiente. Saldo: ${bal/1e9} SOL. Necesario: ${(lamports+5000)/1e9} SOL` });
         }
         const tx = new Transaction().add(
           SystemProgram.transfer({
             fromPubkey: kp.publicKey,
             toPubkey: destPubkey,
             lamports: lamports
           })
         );
         tx.feePayer = kp.publicKey;
         const { blockhash } = await connection.getLatestBlockhash();
         tx.recentBlockhash = blockhash;
         tx.sign(kp);
         txid = await connection.sendRawTransaction(tx.serialize());
      } else {
         const withdrawRaw = Math.floor(withdrawAmount * 1e6);
         const poolTokenAccountAddress = await getAssociatedTokenAddress(new PublicKey(baseMint), kp.publicKey);
         let accountInfo;
         try {
           accountInfo = await connection.getTokenAccountBalance(poolTokenAccountAddress);
         } catch(e) {
           return res.json({ error: 'El Pool no tiene cuenta USDC' });
         }
         const balance = Number(accountInfo.value.amount);
         if (balance < withdrawRaw) {
            return res.json({ error: 'La wallet del Pool no tiene saldo USDC suficiente' });
         }
         
         const destTokenAccountAddress = await getAssociatedTokenAddress(new PublicKey(baseMint), destPubkey);
         const destAccountInfo = await connection.getAccountInfo(destTokenAccountAddress);
         
         const tx = new Transaction();
         if (!destAccountInfo) {
           tx.add(
             createAssociatedTokenAccountInstruction(
               kp.publicKey, // Pool pays for account creation
               destTokenAccountAddress,
               destPubkey,
               new PublicKey(baseMint)
             )
           );
         }
         tx.add(
           createTransferInstruction(
             poolTokenAccountAddress,
             destTokenAccountAddress,
             kp.publicKey,
             withdrawRaw,
             []
           )
         );
         tx.feePayer = kp.publicKey;
         const { blockhash } = await connection.getLatestBlockhash();
         tx.recentBlockhash = blockhash;
         tx.sign(kp);
         txid = await connection.sendRawTransaction(tx.serialize());
      }
      
      request.txid = txid;
    } catch (e) {
      return res.json({ error: 'Fallo al ejecutar transacción en Solana: ' + e.message });
    }
  }

  let remaining = withdrawAmount;
  if (inv.profit >= remaining) {
    inv.profit -= remaining;
  } else {
    remaining -= inv.profit;
    inv.profit = 0;
    inv.deposit -= remaining;
  }
  
  request.status = 'approved';
  saveState();
  res.json({ success: true, poolConfig: getSafePoolConfig() });
});

app.post('/api/pool/withdraw_admin', adminAuth, async (req, res) => {
  const { destinationWallet, amount } = req.body;
  if (!destinationWallet || !amount || amount <= 0) return res.json({ error: 'Datos inválidos' });
  
  if (!poolConfig.totalCommissionEarned || poolConfig.totalCommissionEarned < amount) {
    return res.json({ error: 'Comisión insuficiente' });
  }

  if (poolConfig.privateKey) {
    try {
      const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com';
      const connection = new Connection(rpcUrl, 'confirmed');
      const kp = Keypair.fromSecretKey(bs58.decode(poolConfig.privateKey));
      const destPubkey = new PublicKey(destinationWallet);
      
      let solPrice = 150;
      try {
        const jup = await fetch('https://price.jup.ag/v6/price?ids=SOL');
        const jupData = await jup.json();
        if (jupData.data && jupData.data.SOL && jupData.data.SOL.price) {
          solPrice = jupData.data.SOL.price;
        }
      } catch (e) {}

      const solAmount = amount / solPrice;
      const lamports = Math.floor(solAmount * 1e9);

      const bal = await connection.getBalance(kp.publicKey);
      if (bal < lamports + 5000) {
        return res.json({ error: `La wallet del Pool no tiene saldo suficiente en SOL. Saldo actual: ${bal/1e9} SOL. Necesario: ${(lamports+5000)/1e9} SOL` });
      }

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: kp.publicKey,
          toPubkey: destPubkey,
          lamports
        })
      );
      
      const signature = await sendAndConfirmTransaction(connection, tx, [kp]);
      console.log('✅ Retiro de comisión admin procesado on-chain:', signature);
    } catch (e) {
      console.error('Error enviando retiro admin en Solana:', e);
      return res.json({ error: 'Error on-chain: ' + e.message });
    }
  }

  poolConfig.totalCommissionEarned -= amount;
  saveState();
  res.json({ success: true, poolConfig: getSafePoolConfig() });
});

app.post('/api/pool/reject_withdraw', adminAuth, (req, res) => {
  const { id } = req.body;
  if (!poolConfig.withdrawalRequests) poolConfig.withdrawalRequests = [];
  const reqIdx = poolConfig.withdrawalRequests.findIndex(r => r.id === id);
  if (reqIdx === -1) return res.json({ error: 'Solicitud no encontrada' });
  
  poolConfig.withdrawalRequests[reqIdx].status = 'rejected';
  saveState();
  res.json({ success: true, poolConfig: getSafePoolConfig() });
});

app.post('/api/pool/reset_investor', adminAuth, (req, res) => {
  const { name } = req.body;
  poolConfig.investors = poolConfig.investors.filter(i => i.name !== name);
  saveState();
  res.json({ success: true, poolConfig: getSafePoolConfig() });
});

// ============================================

app.get('/api/whale-map/:mint', (req, res) => {
  const mint = req.params.mint;
  const cache = whaleCache[mint];
  if (!cache || !cache.holders || cache.holders.length === 0) {
    return res.json({ error: 'El token no está siendo monitoreado por el Whale Tracker o aún no se han cargado las ballenas. Añádelo al VPS.' });
  }
  res.json({ ok: true, data: cache });
});

app.get('/api/state', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Forzar actualización de precios de Solana solo si el monitor está apagado o las posiciones están desactualizadas (evita tormentas de peticiones a DexScreener)
  const solanaItems = watchItems.filter(w => w.network === 'solana');
  if (solanaItems.length > 0) {
    try {
      const nowMs = Date.now();
      // Si el monitor está encendido, ya actualiza en background cada 1s, por lo que no es necesario forzar
      // la petición aquí a menos que lleve más de 2 segundos desactualizado.
      const needsSync = !monitorOn || solanaItems.some(w => !w.lastUpdate || (nowMs - w.lastUpdate > 2000));
      
      if (needsSync) {
        const addresses = solanaItems.map(w => w.address).filter(Boolean);
        const prices = await getSolanaPrices(addresses);
        for (let w of watchItems) {
          if (w.network === 'solana' && prices[w.address]) {
            w.prevPrice = w.currentPrice || prices[w.address].price;
            w.currentPrice = prices[w.address].price;
            w.lastUpdate = nowMs;
          }
        }
      }
    } catch (e) { console.error('Error sync solana in state:', e); }
  }

  // Actualizar MEXC si llevan más de 1s sin actualizar
  const now = Date.now();
  for (let w of watchItems) {
    if (w.network === 'mexc' && (now - (w.lastUpdate || 0) > 1000)) {
       try {
         const cp = await mxPrice(w.symbol);
         if (cp > 0) {
           w.prevPrice = w.currentPrice || cp;
           w.currentPrice = cp;
           w.lastUpdate = now;
         }
       } catch (e) {}
    }
  }

  // Run update in background so it does not block the API state response and cause client-side timeouts
  updateSolanaWalletInfo().catch(err => {
    console.error('Background updateSolanaWalletInfo failed:', err);
  });
  
  res.json({ 
    SIM: solMode === 'pool' ? { ...SIM, balance: poolConfig.investors.reduce((a, i) => a + (i.deposit || 0), 0) } : SIM, 
    watchItems, 
    logs, 
    monitorOn, 
    monitorInterval, 
    cycleN, 
    mode,
    solMode,
    nextUpdate: monitorOn ? (lastCycleAt + (monitorInterval * 1000)) : 0,
    vpsSolWallet: {
      address: solanaWalletAddress,
      sol: solanaSolBalance,
      usdc: solanaUsdcBalance,
      baseToken: appConfig.solanaBaseToken || 'SOL'
    },
    solanaSwapLogs
  });
});

app.post('/api/state', adminAuth, (req, res) => {
  const { sim, watch, solMode: clientSolMode } = req.body;
  if (sim) {
    Object.assign(SIM, sim);
  }
  if (clientSolMode) {
    solMode = clientSolMode;
  }
  if (watch && Array.isArray(watch)) {
    watchItems = watch.map(clientItem => {
      const serverItem = watchItems.find(w => w.symbol === clientItem.symbol);
      return {
        ...clientItem,
        klines1h: serverItem ? serverItem.klines1h : [],
        klines1d: serverItem ? serverItem.klines1d : [],
        orders: clientItem.orders || []
      };
    });
  }
  saveState();
  res.json({ status: 'ok' });
});


async function getAmmLiquidityAnalysis(mint) {
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!dexRes.ok) throw new Error("DexScreener API not responding");
    const d = await dexRes.json();
    if (!d || !d.pairs || d.pairs.length === 0) {
      return { available: false, reason: "No active liquidity pools found on DexScreener for this token." };
    }
    
    // Sort pairs by liquidity to get the main pool
    const solPairs = d.pairs.filter(p => p.chainId === 'solana');
    if (solPairs.length === 0) {
      return { available: false, reason: "No Solana pools found for this token." };
    }
    
    solPairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
    const mainPool = solPairs[0];
    
    const poolAddress = mainPool.pairAddress;
    const dexName = mainPool.dexId || "raydium";
    const liquidityUsd = mainPool.liquidity?.usd || 0;
    const currentPrice = mainPool.priceUsd ? parseFloat(mainPool.priceUsd) : 0;
    const baseSymbol = mainPool.baseToken?.symbol || "TOKEN";
    const quoteSymbol = mainPool.quoteToken?.symbol || "SOL";
    const volume24h = mainPool.volume?.h24 || 0;
    
    // Calculate mathematically accurate AMM Liquidity Depth Walls based on constant product formula (x * y = k)
    // We'll construct levels at +/- 2%, 5%, 10%, 15%, 20%, 30%, 40%, 50%, 60%, 70%, 80% offsets
    const offsets = [0.02, 0.05, 0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80];
    
    const bids = [];
    const asks = [];
    
    // Total liquidity in pool V = 2 * R_quote_usd
    // So Quote reserve is V / 2
    const reserveQuoteUsd = liquidityUsd / 2;
    
    offsets.forEach(offset => {
      // Bids (Prices below current)
      const bidPrice = currentPrice * (1 - offset);
      // For constant product pool: depth_usd = reserveQuoteUsd * (1 - sqrt(P_target / P_0))
      // Since bids represent buyers stepping in to buy tokens (using Quote asset),
      // the support "wall" at that price is the cumulative quote asset required to push price down there.
      const cumulativeBidUsd = reserveQuoteUsd * (1 - Math.sqrt(bidPrice / currentPrice));
      
      // Asks (Prices above current)
      const askPrice = currentPrice * (1 + offset);
      // depth_usd = reserveQuoteUsd * (sqrt(P_target / P_0) - 1)
      const cumulativeAskUsd = reserveQuoteUsd * (Math.sqrt(askPrice / currentPrice) - 1);
      
      bids.push({
        price: bidPrice,
        depthUsd: cumulativeBidUsd,
        offsetPct: offset * 100
      });
      
      asks.push({
        price: askPrice,
        depthUsd: cumulativeAskUsd,
        offsetPct: offset * 100
      });
    });
    
    // Let's convert cumulative depths into bracket walls (incremental sizes)
    const bidWalls = bids.map((b, idx) => {
      const prevDepth = idx === 0 ? 0 : bids[idx - 1].depthUsd;
      const wallUsd = b.depthUsd - prevDepth;
      const wallUsdFinal = Math.max(10, wallUsd);
      return {
        price: b.price,
        quantity: wallUsdFinal / b.price, // Quantity of base token in wall
        totalUsd: wallUsdFinal,
        offsetPct: b.offsetPct
      };
    });
    
    const askWalls = asks.map((a, idx) => {
      const prevDepth = idx === 0 ? 0 : asks[idx - 1].depthUsd;
      const wallUsd = a.depthUsd - prevDepth;
      const wallUsdFinal = Math.max(10, wallUsd);
      return {
        price: a.price,
        quantity: wallUsdFinal / a.price,
        totalUsd: wallUsdFinal,
        offsetPct: a.offsetPct
      };
    });
    
    // Now let's try to query on-chain Solana signatures for actual LP actions
    let lpEvents = [];
    let rpcUsed = "Default";
    
    try {
      const connection = new Connection(appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com', 'confirmed');
      rpcUsed = connection.rpcEndpoint;
      
      // Fetch latest signatures for the pair address
      const signatures = await connection.getSignaturesForAddress(new PublicKey(poolAddress), { limit: 8 });
      
      if (signatures && signatures.length > 0) {
        // We can fetch a few transactions in parallel
        const txPromises = signatures.map(sig => 
          connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 })
            .catch(() => null)
        );
        const parsedTxs = await Promise.all(txPromises);
        
        parsedTxs.forEach((tx, txIdx) => {
          if (!tx) return;
          const sigInfo = signatures[txIdx];
          const logMessages = tx.meta?.logMessages || [];
          const logsStr = logMessages.join('\n').toLowerCase();
          
          let type = null;
          let amountUsd = 0;
          
          // Detect LP additions or removals
          // Raydium instructions often log "initialize2", "deposit", "withdraw"
          // Orca whirlpool logs contain "increase_liquidity", "decrease_liquidity"
          if (logsStr.includes("initialize2") || logsStr.includes("deposit") || logsStr.includes("addliquidity") || logsStr.includes("increaseliquidity")) {
            type = "ADD_LIQUIDITY";
          } else if (logsStr.includes("withdraw") || logsStr.includes("removeliquidity") || logsStr.includes("decreaseliquidity")) {
            type = "REMOVE_LIQUIDITY";
          }
          
          if (type) {
            // Find transfers of tokens or SOL to estimate liquidity amount
            let baseDiff = 0;
            let quoteDiff = 0;
            
            if (tx.meta?.postTokenBalances && tx.meta?.preTokenBalances) {
              tx.meta.postTokenBalances.forEach(post => {
                const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
                const preVal = pre ? parseFloat(pre.uiTokenAmount.uiAmountString || "0") : 0;
                const postVal = parseFloat(post.uiTokenAmount.uiAmountString || "0");
                const diff = postVal - preVal;
                
                if (post.mint === mint) {
                  baseDiff = Math.abs(diff);
                } else if (post.mint === mainPool.quoteToken?.address) {
                  quoteDiff = Math.abs(diff);
                }
              });
            }
            
            if (quoteDiff > 0) {
              const isUsdc = mainPool.quoteToken?.symbol?.toUpperCase().includes("USD");
              const solPrice = solanaPricesCache['So11111111111111111111111111111111111111112']?.price || 140;
              amountUsd = isUsdc ? quoteDiff : quoteDiff * solPrice;
            } else if (baseDiff > 0) {
              amountUsd = baseDiff * currentPrice;
            }
            
            if (amountUsd > 100) {
              const signer = tx.transaction.message.accountKeys[0]?.pubkey?.toBase58() || "Unknown";
              lpEvents.push({
                signature: sigInfo.signature,
                timestamp: (sigInfo.blockTime ? sigInfo.blockTime * 1000 : Date.now() - txIdx * 60000),
                signer,
                signerShort: signer.slice(0, 4) + "..." + signer.slice(-4),
                type,
                amountUsd,
                amountTokens: amountUsd / currentPrice,
                realOnChain: true
              });
            }
          }
        });
      }
    } catch (err) {
      console.warn(`[getAmmLiquidityAnalysis] Error parsing on-chain LP events:`, err.message);
    }
    
    // Removed fallback LP generator
    
    const LPAdditions = lpEvents.filter(e => e.type === "ADD_LIQUIDITY");
    let whaleLpSupport = null;
    if (LPAdditions.length > 0) {
      LPAdditions.sort((a, b) => b.amountUsd - a.amountUsd);
      const topAdd = LPAdditions[0];
      whaleLpSupport = {
        active: true,
        price: currentPrice,
        amountUsd: topAdd.amountUsd,
        signerShort: topAdd.signerShort,
        ageMinutes: Math.round((Date.now() - topAdd.timestamp) / 60000)
      };
    }
    
    return {
      available: true,
      isAmm: true,
      poolAddress,
      dexName: dexName.toUpperCase(),
      baseSymbol,
      quoteSymbol,
      liquidityUsd,
      currentPrice,
      bids: bidWalls,
      asks: askWalls,
      recentLpEvents: lpEvents.sort((a,b) => b.timestamp - a.timestamp),
      whaleLpSupport,
      lpDataLimited: lpEvents.length === 0
    };
    
  } catch (err) {
    console.error("[getAmmLiquidityAnalysis] Error:", err);
    return { available: false, error: err.message };
  }
}


async function getVolumeProfileSupport(tokenMint, currentPrice) {
  try {
    const poolAddress = await getPoolAddress(tokenMint);
    if (!poolAddress) return null;

    const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/hour?aggregate=1&limit=72&currency=usd`;
    const res = await fetchWithRetry(url, { timeout: 8000 }, 1, 500);
    if (!res || !res.ok) return null;
    const data = await res.json();
    const candles = data?.data?.attributes?.ohlcv_list;
    if (!candles || candles.length < 10) return null;

    const minPrice = Math.min(...candles.map(c => c[3]));
    const maxPrice = Math.max(...candles.map(c => c[2]));
    if (!isFinite(minPrice) || !isFinite(maxPrice) || minPrice <= 0 || maxPrice <= minPrice) return null;

    const NUM_BUCKETS = 20;
    const bucketSize = (maxPrice - minPrice) / NUM_BUCKETS;
    const buckets = Array.from({ length: NUM_BUCKETS }, (_, i) => ({
      priceLow: minPrice + i * bucketSize,
      priceHigh: minPrice + (i + 1) * bucketSize,
      volume: 0,
      bounces: 0
    }));

    const bucketIndexForPrice = (p) => {
      const idx = Math.floor(((p - minPrice) / bucketSize) + 1e-9);
      return Math.max(0, Math.min(NUM_BUCKETS - 1, idx));
    };

    for (const c of candles) {
      const idx = bucketIndexForPrice(c[4]);
      buckets[idx].volume += c[5] || 0;
    }

    for (let i = 0; i < candles.length - 1; i++) {
      const low = candles[i][3];
      const nextClose = candles[i + 1][4];
      const thisClose = candles[i][4];
      if (nextClose > thisClose) {
        const idx = bucketIndexForPrice(low);
        buckets[idx].bounces++;
      }
    }

    const candidates = buckets
      .filter(b => b.priceHigh < currentPrice && b.volume > 0)
      .map(b => ({ ...b, midPrice: (b.priceLow + b.priceHigh) / 2, score: b.volume * (1 + b.bounces * 0.5) }))
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) return null;
    const best = candidates[0];

    return {
      source: 'volume_profile',
      isRealOrderbook: false,
      wallPrice: best.midPrice,
      volumeUsd: best.volume,
      bounces: best.bounces,
      currentPrice,
      note: `Nivel de soporte basado en ${candles.length}h de historial real de precio/volumen (no es una pared literal, es donde más se compró/rebotó antes).`
    };
  } catch (e) {
    console.warn(`[getVolumeProfileSupport] Error: ${e.message}`);
    return null;
  }
}

async function findBestSupportWall(tokenMint, currentPriceHint) {
  if (phoenixClient) {
    let targetMarketKey = null;
    let isQuote = false;
    for (const [address, market] of phoenixClient.marketStates.entries()) {
      const base = market.data.header.baseParams.mintKey.toBase58();
      const quote = market.data.header.quoteParams.mintKey.toBase58();
      if (base === tokenMint || quote === tokenMint) {
        targetMarketKey = address;
        isQuote = (quote === tokenMint);
        break;
      }
    }
    if (targetMarketKey && !isQuote) {
      try {
        await phoenixClient.refreshMarket(targetMarketKey);
        const ladder = phoenixClient.getUiLadder(targetMarketKey, 15);
        if (ladder.bids && ladder.bids.length > 0) {
          const sortedBids = [...ladder.bids].sort((a, b) => (b.price * b.quantity) - (a.price * a.quantity));
          const strongestWall = sortedBids[0];
          return {
            source: 'phoenix',
            isRealOrderbook: true,
            wallPrice: strongestWall.price,
            wallSizeBase: strongestWall.quantity,
            currentPrice: ladder.asks?.[0]?.price || currentPriceHint,
            market: targetMarketKey
          };
        }
      } catch (e) {
        console.warn(`[findBestSupportWall] Error con mercado Phoenix: ${e.message}`);
      }
    }
  }
  const volProfile = await getVolumeProfileSupport(tokenMint, currentPriceHint);
  if (volProfile) return volProfile;
  const obAnalysis = await getAmmLiquidityAnalysis(tokenMint);
  if (!obAnalysis || !obAnalysis.available || !obAnalysis.bids || obAnalysis.bids.length === 0) return null;
  const reasonableBids = obAnalysis.bids.filter(b => b.offsetPct >= 5 && b.offsetPct <= 25);
  const candidateBids = reasonableBids.length > 0 ? reasonableBids : obAnalysis.bids.filter(b => b.offsetPct >= 3 && b.offsetPct <= 40);
  const sortedBids = [...candidateBids].sort((a, b) => b.totalUsd - a.totalUsd);
  const strongestWall = sortedBids[0];
  if (!strongestWall || strongestWall.price <= 0) return null;
  return {
    source: 'amm_estimate',
    isRealOrderbook: false,
    wallPrice: strongestWall.price,
    wallSizeUsd: strongestWall.totalUsd,
    currentPrice: obAnalysis.currentPrice,
    note: obAnalysis.note
  };
}

app.get('/api/orderbook/:tokenMint', adminAuth, async (req, res) => {
   const mint = req.params.tokenMint;
   if (!phoenixClient) {
       return res.status(500).json({ error: "Phoenix client not initialized" });
   }
   
   let targetMarketKey = null;
   let isQuote = false;
   for (const [address, market] of phoenixClient.marketStates.entries()) {
       const base = market.data.header.baseParams.mintKey.toBase58();
       const quote = market.data.header.quoteParams.mintKey.toBase58();
       if (base === mint || quote === mint) {
           targetMarketKey = address;
           isQuote = (quote === mint);
           break;
       }
   }
   
   if (!targetMarketKey) {
       const ammData = await getAmmLiquidityAnalysis(mint);
       return res.json({ available: false, isAmm: true, ammData });
   }
   
   try {
       await phoenixClient.refreshMarket(targetMarketKey);
       const ladder = phoenixClient.getUiLadder(targetMarketKey, 15);
       res.json({ available: true, asks: ladder.asks, bids: ladder.bids, market: targetMarketKey, isQuote });
   } catch(e) {
       res.status(500).json({ error: e.message });
   }
});

app.get('/api/support-wall/:tokenMint', adminAuth, async (req, res) => {
  try {
    const mint = req.params.tokenMint;
    const priceHint = parseFloat(req.query.price) || 0;
    const wall = await findBestSupportWall(mint, priceHint);
    if (!wall) {
      return res.json({ available: false, message: 'No se encontró ningún nivel de soporte confiable (ni Phoenix, ni historial de volumen, ni estimación AMM).' });
    }
    res.json({ available: true, ...wall });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get('/api/config', adminAuth, (req, res) => {
  const safeConfig = { ...appConfig };
  delete safeConfig.solanaPrivateKey;
  delete safeConfig.appPassword;
  delete safeConfig.mexcApiSecret;
  delete safeConfig.tgBotToken;
  delete safeConfig.dextoolsApiKey;
  delete safeConfig.twitterBearerToken;
  delete safeConfig.solanaTrackerApiKey;
  res.json(safeConfig);
});

app.post('/api/config', adminAuth, (req, res) => {
  const { 
    mexcApiKey, mexcApiSecret, tgBotToken, tgChatId, appPassword, 
    solanaPrivateKey, solanaRpcUrl, solanaBaseToken, solanaSlippage, 
    solanaPriorityFee, dextoolsApiKey, twitterBearerToken, solanaTrackerApiKey, 
    safetyCheckEnabled, useJitoBundle, solanaFeeLimit,
    autoTraderEnabled, autoTraderAmount, autoTraderMin24HVol, 
    autoTraderMinMarketCap, autoTraderMaxMarketCap, autoTraderMinAge, 
    autoTraderMaxAge, autoTraderMinLiq, autoTraderStopLoss, 
    autoTraderTakeProfit1, autoTraderTakeProfit2
  } = req.body;
  if(mexcApiKey !== undefined) appConfig.mexcApiKey = mexcApiKey;
  if(mexcApiSecret !== undefined) appConfig.mexcApiSecret = mexcApiSecret;
  if(tgBotToken !== undefined) appConfig.tgBotToken = tgBotToken;
  if(tgChatId !== undefined) appConfig.tgChatId = tgChatId;
  if(appPassword !== undefined) appConfig.appPassword = appPassword;
  if(solanaPrivateKey !== undefined) appConfig.solanaPrivateKey = solanaPrivateKey;
  if(solanaRpcUrl !== undefined) {
    const oldRpc = appConfig.solanaRpcUrl;
    appConfig.solanaRpcUrl = solanaRpcUrl;
    if (oldRpc !== solanaRpcUrl) {
      console.log('⚠️ ADVERTENCIA: La URL de Solana RPC ha sido cambiada. Asegúrate de copiarla en el archivo .env como SOLANA_RPC_URL para que sobreviva a los reinicios.');
      connectSolanaWs();
    }
  }
  if(solanaBaseToken !== undefined) appConfig.solanaBaseToken = solanaBaseToken;
  if(solanaSlippage !== undefined) appConfig.solanaSlippage = parseFloat(solanaSlippage) || 2.5;
  if(solanaPriorityFee !== undefined) appConfig.solanaPriorityFee = solanaPriorityFee;
  if(solanaFeeLimit !== undefined) appConfig.solanaFeeLimit = parseFloat(solanaFeeLimit) || 0.05;
  if(dextoolsApiKey !== undefined) appConfig.dextoolsApiKey = dextoolsApiKey;
  if(twitterBearerToken !== undefined) appConfig.twitterBearerToken = twitterBearerToken;
  if(solanaTrackerApiKey !== undefined) appConfig.solanaTrackerApiKey = solanaTrackerApiKey;
  if(safetyCheckEnabled !== undefined) appConfig.safetyCheckEnabled = !!safetyCheckEnabled;
  if(useJitoBundle !== undefined) appConfig.useJitoBundle = !!useJitoBundle;
  
  if(autoTraderEnabled !== undefined) appConfig.autoTraderEnabled = !!autoTraderEnabled;
  if(autoTraderAmount !== undefined) appConfig.autoTraderAmount = parseFloat(autoTraderAmount) || 50;
  if(autoTraderMin24HVol !== undefined) appConfig.autoTraderMin24HVol = parseFloat(autoTraderMin24HVol) || 50000;
  if(autoTraderMinMarketCap !== undefined) appConfig.autoTraderMinMarketCap = parseFloat(autoTraderMinMarketCap) || 200000;
  if(autoTraderMaxMarketCap !== undefined) appConfig.autoTraderMaxMarketCap = parseFloat(autoTraderMaxMarketCap) || 2000000;
  if(autoTraderMinAge !== undefined) appConfig.autoTraderMinAge = parseFloat(autoTraderMinAge) || 48;
  if(autoTraderMaxAge !== undefined) appConfig.autoTraderMaxAge = parseFloat(autoTraderMaxAge) || 500;
  if(autoTraderMinLiq !== undefined) appConfig.autoTraderMinLiq = parseFloat(autoTraderMinLiq) || 2000;
  if(autoTraderStopLoss !== undefined) appConfig.autoTraderStopLoss = parseFloat(autoTraderStopLoss) || 10;
  if(autoTraderTakeProfit1 !== undefined) appConfig.autoTraderTakeProfit1 = parseFloat(autoTraderTakeProfit1) || 8;
  if(autoTraderTakeProfit2 !== undefined) appConfig.autoTraderTakeProfit2 = parseFloat(autoTraderTakeProfit2) || 15;
  saveState();
  res.json({ status: 'ok', config: appConfig });
});

app.post('/api/ai/twitter-analysis', adminAuth, async (req, res) => {
  const { mint } = req.body;
  if (!mint) return res.status(400).json({ error: 'Missing mint address' });

  const twitterBearerToken = appConfig.twitterBearerToken;
  if (!twitterBearerToken) {
    return res.json({ available: false, error: 'Twitter Bearer Token no configurado en los ajustes.' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.json({ available: false, error: 'La API de Gemini no está configurada en el servidor (faltante GEMINI_API_KEY).' });
  }

  try {
    const url = `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(mint)}&max_results=15`;
    const twRes = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${twitterBearerToken}`
      }
    });
    
    if (!twRes.ok) {
      const errTxt = await twRes.text();
      throw new Error(`Error de Twitter API: ${twRes.status} - ${errTxt}`);
    }

    const twData = await twRes.json();
    
    if (!twData.data || twData.data.length === 0) {
      return res.json({ available: true, analysis: "No se encontraron tweets recientes para este contrato.", status: "Neutral", tweetsCount: 0 });
    }

    const tweets = twData.data.map(t => t.text).join("\n\n---\n\n");

    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const prompt = `Analiza los siguientes tweets recientes sobre el token con contrato: ${mint}.
Indica si el sentimiento general de la comunidad en base a estos mensajes es Bullish, Scam (estafa/peligro), o Neutral.
Proporciona un breve resumen estructurado de lo que menciona la gente (máximo 80 palabras).

Tweets recopilados:
${tweets}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: "Eres un analista experto en criptomonedas de riesgo y memecoins. Responde siempre en español con un tono profesional y objetivo.",
      },
    });

    res.json({ available: true, analysis: response.text, tweetsCount: twData.data.length });
  } catch (e) {
    console.error("[Twitter Analysis Error]", e);
    res.json({ available: false, error: e.message });
  }
});

app.post('/api/config/test_telegram', adminAuth, async (req, res) => {
  const { tgBotToken, tgChatId } = req.body;
  const token = tgBotToken || appConfig.tgBotToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = tgChatId || appConfig.tgChatId || process.env.TELEGRAM_CHAT_ID;

  if (!token) return res.json({ error: 'Falta el Token del Bot de Telegram' });
  if (!chatId) return res.json({ error: 'Falta el Chat ID de Telegram' });

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        chat_id: chatId,
        text: `🔌 <b>Mensaje de Prueba de Conexión</b>\n\n¡La conexión entre tu Bot de trading y Telegram está funcionando correctamente! ✅\n\n<i>Hora local: ${new Date().toLocaleTimeString('es')}</i>`,
        parse_mode: 'HTML'
      })
    });

    const data = await response.json();
    if (data.ok) {
      return res.json({ success: true });
    } else {
      return res.json({ error: `Error de Telegram: ${data.description || 'Desconocido'}` });
    }
  } catch (e) {
    console.error('Error testing Telegram connection:', e);
    return res.json({ error: `Error de conexión: ${e.message}` });
  }
});

app.get('/api/dexscreener/*', async (req, res) => {
  try {
    const endpoint = req.params[0];
    const qs = new URLSearchParams(req.query).toString();
    const url = `https://api.dexscreener.com/${endpoint}${qs ? '?' + qs : ''}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return res.status(r.status).json({error: `DexScreener err: ${r.statusText}`});
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/mexc/*', async (req, res) => {
  try {
    const endpoint = req.params[0];
    const qs = new URLSearchParams(req.query).toString();
    const url = `https://api.mexc.com/api/v3/${endpoint}${qs ? '?' + qs : ''}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return res.status(r.status).json({error: `MEXC err: ${r.statusText}`});
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/token-safety/:mint', adminAuth, async (req, res) => {
  try {
    const result = await checkTokenSafety(req.params.mint);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});


const isProd = process.env.NODE_ENV === 'production';
if (isProd) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/investor*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'investor.html'));
    });
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
} else {
    // We can assume index.html is in root or handled by vite if vite is configured, but this server uses simple express static
    app.use(express.static('.'));
    app.get('/investor*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'investor.html'));
    });
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'index.html'));
    });
}

// Para evitar conflictos con variables de entorno, forzamos el puerto 5000 en el VPS.
// En el entorno de AI Studio (Cloud Run), usa el 3000 por requerimiento interno.
const IS_AI_STUDIO = process.env.K_SERVICE || process.env.DISABLE_HMR;
const ACTUAL_PORT = IS_AI_STUDIO ? 3000 : 5000;

app.listen(ACTUAL_PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVIDOR VPS INICIADO 24/7 en puerto ${ACTUAL_PORT}`);
    console.log(`📁 Panel de control accesible vía IP pública:${ACTUAL_PORT}`);
});
