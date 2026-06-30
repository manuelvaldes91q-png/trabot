import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import "dotenv/config";
import { Connection, Keypair, VersionedTransaction, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, getAccount } from '@solana/spl-token';
import bs58 from 'bs58';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ============================================
// STATE DEL BOT (SE MANTIENE EN LA MEMORIA RAM Y SE GUARDA EN ARCHIVO)
// ============================================
let SIM = { balance: 1000, solBalance: 10, initBal: 1000, trades: [], pnl: 0, wins: 0, losses: 0, totalExec: 0 };
let watchItems = [];
let logs = [];
let monitorOn = false;
let monitorInterval = 15;
let cycleN = 0;
let mode = 'simulated';
let solMode = 'sim'; // 'sim' o 'wallet'
let appConfig = {
  mexcApiKey: process.env.MEXC_API_KEY || '',
  mexcApiSecret: process.env.MEXC_API_SECRET || '',
  tgBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
  tgChatId: process.env.TELEGRAM_CHAT_ID || '',
  solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY || '',
  solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  solanaBaseToken: process.env.SOLANA_BASE_TOKEN || 'SOL',
  solanaSlippage: process.env.SOLANA_SLIPPAGE ? parseFloat(process.env.SOLANA_SLIPPAGE) : 2.5,
  solanaPriorityFee: process.env.SOLANA_PRIORITY_FEE || 'auto',
  dextoolsApiKey: process.env.DEXTOOLS_API_KEY || ''
};

let poolConfig = {
  walletAddress: '',
  commissionRate: 0.20,
  investors: [],
  totalCommissionEarned: 0
};

function distributePnL(pnl) {
  if (!pnl || pnl === 0) return;
  if (!poolConfig.investors || poolConfig.investors.length === 0) return;
  
  const totalDeposits = poolConfig.investors.reduce((sum, inv) => sum + (inv.deposit || 0), 0);
  if (totalDeposits <= 0) return;

  const adminCommission = pnl > 0 ? (pnl * poolConfig.commissionRate) : 0;
  
  if (pnl > 0) {
    // Del 20% total (ejemplo), 3% de la ganancia total (0.03 absoluto) va para recargar SOL de fees
    const feeReserveShare = pnl * 0.03;
    const adminNetShare = adminCommission - feeReserveShare;
    
    poolConfig.totalCommissionEarned = (poolConfig.totalCommissionEarned || 0) + adminNetShare;
    poolConfig.solFeeReserve = (poolConfig.solFeeReserve || 0) + feeReserveShare;
    
    if (poolConfig.solFeeReserve >= 5 && poolConfig.privateKey) {
      // Trigger async swap
      swapUSDCToSOLForFees(poolConfig.solFeeReserve);
      poolConfig.solFeeReserve = 0;
    }
  }
  
  const netPnL = pnl > 0 ? (pnl - adminCommission) : pnl;
  
  for (let inv of poolConfig.investors) {
    const share = (inv.deposit || 0) / totalDeposits;
    inv.profit = (inv.profit || 0) + (netPnL * share);
  }
}

async function swapUSDCToSOLForFees(amountUSDC) {
  try {
    addLog(`🔄 Auto-abasteciendo SOL para fees del pool (${amountUSDC.toFixed(2)} USDC)...`, 'info');
    const w = { symbol: 'SOL', address: 'So11111111111111111111111111111111111111112', network: 'solana' };
    const realRes = await executeSolanaTrade(w, 'BUY', amountUSDC, 0);
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
    fs.writeFileSync(tmp, JSON.stringify({ SIM, watchItems, logs, monitorOn, monitorInterval, mode, solMode, appConfig, poolConfig }));
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
      if (data.solMode) solMode = data.solMode;
      if (data.appConfig) appConfig = {...appConfig, ...data.appConfig};
      if (data.poolConfig) poolConfig = data.poolConfig;
      
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
    saveState();
  }
}
loadState();

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
            console.warn(`DexTools API fetch failed for ${addr}:`, e.message);
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
             console.warn(`Jupiter fetch failed, fallback to DexScreener:`, e.message);
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

async function getTokenBalance(connection, ownerPubKey, tokenMintStr) {
  try {
    const owner = new PublicKey(ownerPubKey);
    if (tokenMintStr === 'So11111111111111111111111111111111111111112') {
      const bal = await connection.getBalance(owner);
      return bal;
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

let solanaWalletAddress = '';
let solanaSolBalance = 0;
let solanaUsdcBalance = 0;
let lastSolanaBalanceUpdate = 0;
let solanaSwapLogs = [];

async function updateSolanaWalletInfo() {
  const pk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
  if (!pk) {
    solanaWalletAddress = '';
    solanaSolBalance = 0;
    solanaUsdcBalance = 0;
    return;
  }
  
  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(pk));
    solanaWalletAddress = keypair.publicKey.toString();
    
    const now = Date.now();
    if (now - lastSolanaBalanceUpdate < 10000 && solMode === 'wallet') {
      return;
    }
    
    if (solMode !== 'wallet') {
        solanaUsdcBalance = SIM.balance || 1000;
        solanaSolBalance = SIM.solBalance || 10;
        return;
    }
    
    const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
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
  if (solMode !== 'wallet') return { ok: true, txid: 'simulated' };
  
  const pk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
  if (!pk) {
    addLog(`⚠️ No se puede ejecutar orden real en Solana para ${w.symbol}: Falta Solana Private Key en Config o Pool.`, 'warn');
    return { ok: false };
  }
  
  const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');
  
  try {
    const keypair = Keypair.fromSecretKey(bs58.decode(pk));
    const userPublicKey = keypair.publicKey.toString();
    
    const isSOL = (appConfig.solanaBaseToken !== 'USDC');
    const baseMint = isSOL ? 'So11111111111111111111111111111111111111112' : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const targetMint = w.address;
    
    if (!targetMint) {
      addLog(`⚠️ Error Solana trade: Falta la dirección del token para ${w.symbol}`, 'warn');
      return { ok: false };
    }
    
    let inputMint, outputMint, rawAmount;
    
    // Check balance before trade to calculate exact PNL
    const baseBalBefore = await getTokenBalance(connection, userPublicKey, baseMint);
    
    if (side === 'BUY') {
      inputMint = baseMint;
      outputMint = targetMint;
      
      if (isSOL) {
        const solPrice = await mxPrice('SOL') || 140;
        rawAmount = Math.floor((amountUSDT / solPrice) * 1e9); // lamports
      } else {
        rawAmount = Math.floor(amountUSDT * 1e6); // USDC decimals is 6
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
    
    const slipPercent = appConfig.solanaSlippage || 2.5;
    const slippageBps = Math.floor(slipPercent * 100);
    addLog(`🌀 Consultando cotización Jupiter para ${side} ${w.symbol} (Monto: ${rawAmount}, Slippage: ${slipPercent}%)...`, 'info');
    
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${rawAmount}&slippageBps=${slippageBps}`;
    const qr = await fetch(quoteUrl, { signal: AbortSignal.timeout(8000) });
    if (!qr.ok) {
      const errTxt = await qr.text();
      addLog(`❌ Error Jupiter Quote: ${errTxt}`, 'warn');
      return { ok: false };
    }
    const quoteResponse = await qr.json();
    
    let priorityFee = 'auto';
    if (appConfig.solanaPriorityFee && appConfig.solanaPriorityFee !== 'auto') {
      priorityFee = parseInt(appConfig.solanaPriorityFee) || 200000;
    }
    
    const sr = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: priorityFee
      })
    });
    
    if (!sr.ok) {
      const errTxt = await sr.text();
      addLog(`❌ Error Jupiter Swap API: ${errTxt}`, 'warn');
      return { ok: false };
    }
    const { swapTransaction } = await sr.json();
    
    const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    transaction.sign([keypair]);
    
    addLog(`🚀 Enviando transacción real de Solana para ${w.symbol}...`, 'info');
    const txid = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 2
    });
    
    addLog(`✅ Transacción enviada: ${txid.slice(0, 8)}... Esperando confirmación...`, 'info');
    
    const latestBlockHash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txid
    }, 'confirmed');
    
    // Check balance after trade
    const baseBalAfter = await getTokenBalance(connection, userPublicKey, baseMint);
    const diffRaw = side === 'SELL' ? (baseBalAfter - baseBalBefore) : (baseBalBefore - baseBalAfter);
    let exactAmountUSDT = 0;
    
    if (isSOL) {
       const solPrice = await mxPrice('SOL') || 140;
       exactAmountUSDT = (diffRaw / 1e9) * solPrice;
    } else {
       exactAmountUSDT = diffRaw / 1e6;
    }
    
    addLog(`🎉 Solana trade ${side} confirmado con éxito para ${w.symbol}! TxID: ${txid}`, side==='BUY'?'buy':'sell');
    
    solanaSwapLogs.unshift({ txid, symbol: w.symbol, side, amountUSDT, time: Date.now() });
    if(solanaSwapLogs.length > 50) solanaSwapLogs.pop();
    
    return { ok: true, txid, exactAmountUSDT };
  } catch (err) {
    addLog(`❌ Error en ejecución de Solana: ${err.message}`, 'warn');
    return { ok: false };
  }
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
        const pnlP = (cp - avg) / avg * 100;
        
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
               addLog(`ℹ️ [Solana Real] PNL exacto ajustado post-swap: $${pnl.toFixed(2)}`, 'info');
            }
            if(mode!=='real') SIM.balance += inv + pnl;
            SIM.pnl += pnl; distributePnL(pnl);
            SIM.losses++;
          } else continue;
          SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: cp, pnl, pnlPct: pnlP.toFixed(2), at: Date.now() });
          
          w.orders.forEach(o => { if (o.status === 'pending') o.status = 'cancelled'; });
          w.slPrice = null; w.tp1Price = null; w.tp2Price = null;
          addLog(`❌ SL ${w.symbol}: $${fpZ(cp,cp)} · P&L $${pnl.toFixed(2)} (${pnlP.toFixed(1)}%)`, 'sl_');
          
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
          SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: cp, pnl, pnlPct: pnlP.toFixed(2), at: Date.now() });
          
          w.orders.forEach(o => { if (o.status === 'pending') o.status = 'cancelled'; });
          w.tp1Hit = true;
          w.slPrice = null; w.tp1Price = null; w.tp2Price = null;
          addLog(`🎯 TP1 CERRADO ${w.symbol}: $${fpZ(cp,cp)} · P&L $${pnl.toFixed(2)} (+${pnlP.toFixed(1)}%)`, 'tp');
          
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
          SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: cp, pnl, pnlPct: pnlP.toFixed(2), at: Date.now() });
          
          w.orders.forEach(o => { if (o.status === 'pending') o.status = 'cancelled'; });
          w.tp2Hit = true;
          w.slPrice = null; w.tp1Price = null; w.tp2Price = null;
          addLog(`🚀 TP2 CERRADO ${w.symbol}: $${fpZ(cp,cp)} · P&L $${pnl.toFixed(2)} (+${pnlP.toFixed(1)}%)`, 'tp');
          
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
          o.filledPrice = cp;
          
          if (!w.filledBuys) w.filledBuys = [];
          w.filledBuys.push({ price: cp, amount: o.amount, level: o.level });
          
          addLog(`⚡ [Solana Instant] Disparando swap compra para ${w.symbol} a $${fpZ(cp,cp)}...`, 'info');
          const realRes = await executeOrder(w, 'BUY', o.amount, cp);
          if (realRes && realRes.ok) {
            if (solMode !== 'wallet') {
                SIM.balance -= o.amount;
                SIM.solBalance += o.amount / cp;
            }
            SIM.totalExec++;
          } else {
            // Si falla la transacción real en Solana, revertimos estado a pending para intentar de nuevo
            o.status = 'pending';
            o.filledAt = null;
            o.filledPrice = null;
            w.filledBuys.pop();
            addLog(`⚠️ Falló swap real en Solana para ${w.symbol}. Reintentando en el próximo tick rápido.`, 'warn');
            continue; 
          }
          
          if (!w.slPrice) {
             w.slPrice = o.price * (1 - (o.sl || 10)/100);
             w.tp1Price = o.price * (1 + (o.tp1 || 8)/100);
             w.tp2Price = o.price * (1 + (o.tp2 || 15)/100);
          }
          addLog(`✅ AUTO-COMPRA SOLANA COMPLETADA: ${w.symbol} #${o.level} · $${o.amount}`, 'buy');
          break; // sólo una por ciclo
        }
      }
      
      // VERIFICAR SL / TP SOLANA
      const filled = w.orders.filter(o => o.status === 'filled');
      if (filled.length && w.slPrice) {
        const inv = filled.reduce((a, o) => a + o.amount, 0);
        const avg = filled.reduce((a, o) => a + o.price * o.amount, 0) / inv;
        const pnlP = (cp - avg) / avg * 100;
        
        if (cp <= w.slPrice) {
          addLog(`⚡ [Solana Instant] Disparando Stop Loss para ${w.symbol} a $${fpZ(cp,cp)}...`, 'info');
          let pnl = inv * pnlP / 100;
          const realRes = await executeOrder(w, 'SELL', inv + pnl, cp);
          if (realRes && realRes.ok) {
            if (realRes.exactAmountUSDT !== undefined) {
               pnl = realRes.exactAmountUSDT - inv;
               addLog(`ℹ️ [Solana Real] PNL exacto ajustado post-swap (SL): $${pnl.toFixed(2)}`, 'info');
            }
            if (solMode !== 'wallet') {
                SIM.balance += inv + pnl;
                SIM.solBalance -= (inv / avg);
            }
            SIM.pnl += pnl; distributePnL(pnl);
            SIM.losses++;
            SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: cp, pnl, pnlPct: pnlP.toFixed(2), at: Date.now() });
            
            w.orders.forEach(o => { if (o.status === 'pending') o.status = 'cancelled'; });
            w.slPrice = null; w.tp1Price = null; w.tp2Price = null;
            addLog(`❌ SL SOLANA CERRADO ${w.symbol}: $${fpZ(cp,cp)} · P&L $${pnl.toFixed(2)} (${pnlP.toFixed(1)}%)`, 'sl_');
            
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
               addLog(`ℹ️ [Solana Real] PNL exacto ajustado post-swap (TP1): $${pnl.toFixed(2)}`, 'info');
            }
            if (solMode !== 'wallet') {
                SIM.balance += inv + pnl;
                SIM.solBalance -= (inv / avg);
            }
            SIM.pnl += pnl; distributePnL(pnl);
            SIM.wins++;
            SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: cp, pnl, pnlPct: pnlP.toFixed(2), at: Date.now() });
            
            w.orders.forEach(o => { if (o.status === 'pending') o.status = 'cancelled'; });
            w.tp1Hit = true;
            w.slPrice = null; w.tp1Price = null; w.tp2Price = null;
            addLog(`🎯 TP1 SOLANA CERRADO ${w.symbol}: $${fpZ(cp,cp)} · P&L $${pnl.toFixed(2)} (+${pnlP.toFixed(1)}%)`, 'tp');
            
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
               addLog(`ℹ️ [Solana Real] PNL exacto ajustado post-swap (TP2): $${pnl.toFixed(2)}`, 'info');
            }
            if (solMode !== 'wallet') {
                SIM.balance += inv + pnl;
                SIM.solBalance -= (inv / avg);
            }
            SIM.pnl += pnl; distributePnL(pnl);
            SIM.wins++;
            SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: cp, pnl, pnlPct: pnlP.toFixed(2), at: Date.now() });
            
            w.orders.forEach(o => { if (o.status === 'pending') o.status = 'cancelled'; });
            w.tp2Hit = true;
            w.slPrice = null; w.tp1Price = null; w.tp2Price = null;
            addLog(`🚀 TP2 SOLANA CERRADO ${w.symbol}: $${fpZ(cp,cp)} · P&L $${pnl.toFixed(2)} (+${pnlP.toFixed(1)}%)`, 'tp');
            
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

let solanaTimer = null;
let depositTimer = null;

async function checkPendingDeposits() {
  if (solMode !== 'wallet') return;
  const poolPk = poolConfig.privateKey || appConfig.solanaPrivateKey || process.env.SOLANA_PRIVATE_KEY;
  if (!poolPk) return;
  
  const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  
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
            if (balanceDecimals > 0.005) { // Needs some SOL for fee if not using fee payer, but we use pool as fee payer anyway
              // Transfer SOL
              const transaction = new Transaction().add(
                SystemProgram.transfer({
                  fromPubkey: invKeypair.publicKey,
                  toPubkey: poolKeypair.publicKey,
                  lamports: balance,
                })
              );
              transaction.feePayer = poolKeypair.publicKey;
              const { blockhash } = await connection.getLatestBlockhash();
              transaction.recentBlockhash = blockhash;
              transaction.sign(invKeypair, poolKeypair);
              await connection.sendRawTransaction(transaction.serialize());
              inv.depositStatus = 'active';
              inv.deposit += balanceDecimals;
              saveState();
              addLog(`Depósito detectado y transferido de ${inv.name}: ${balanceDecimals} SOL`, 'info');
            }
          } else {
            // USDC Check
            const invTokenAccountAddress = await getAssociatedTokenAddress(baseMint, invKeypair.publicKey);
            try {
              const accountInfo = await connection.getTokenAccountBalance(invTokenAccountAddress);
              const balance = Number(accountInfo.value.amount);
              const balanceDecimals = balance / 1e6;
              if (balanceDecimals >= 0.01) {
                const poolTokenAccountAddress = await getAssociatedTokenAddress(baseMint, poolKeypair.publicKey);
                const transaction = new Transaction().add(
                  createTransferInstruction(
                    invTokenAccountAddress,
                    poolTokenAccountAddress,
                    invKeypair.publicKey,
                    balance,
                    []
                  )
                );
                transaction.feePayer = poolKeypair.publicKey;
                const { blockhash } = await connection.getLatestBlockhash();
                transaction.recentBlockhash = blockhash;
                transaction.sign(invKeypair, poolKeypair);
                const txid = await connection.sendRawTransaction(transaction.serialize());
                inv.depositStatus = 'active';
                inv.deposit += balanceDecimals;
                saveState();
                addLog(`Depósito detectado y transferido de ${inv.name}: $${balanceDecimals} USDC`, 'info');
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

function startLoop() {
  if (loopTimer) clearInterval(loopTimer);
  loopTimer = setInterval(() => {
    if (monitorOn) runCycle();
  }, monitorInterval * 1000);

  if (solanaTimer) clearInterval(solanaTimer);
  solanaTimer = setInterval(() => {
    if (monitorOn) runSolanaCycle();
  }, 1000); // Monitoreo de alta frecuencia cada 1 segundo para Solana
  
  if (depositTimer) clearInterval(depositTimer);
  depositTimer = setInterval(() => {
    checkPendingDeposits();
  }, 60000); // Revisar depósitos cada minuto
}

// Iniciar el loop si estaba encendido en el estado recuperado
startLoop();


// ============================================
// PUBLIC ENDPOINTS

app.post('/api/login', (req, res) => {
  const pwd = appConfig.appPassword || process.env.APP_PASSWORD || 'admin123';
  if (req.body.password === pwd) res.json({status: 'ok', token: pwd});
  else res.status(401).json({error: 'Invalid password'});
});

app.post('/api/investor/login', (req, res) => {
  const { name, password } = req.body;
  if (!name || !password) return res.status(400).json({ error: 'Faltan datos' });
  const inv = poolConfig.investors.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (inv && inv.password === password) {
    const token = Buffer.from(`${name}:${password}`).toString('base64');
    res.json({ status: 'ok', token, name: inv.name });
  } else {
    res.status(401).json({ error: 'Credenciales inválidas' });
  }
});

// ============================================
// INVESTOR MIDDLEWARE & ENDPOINTS
const investorAuth = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({error: 'Unauthorized Investor'});
  const token = auth.substring(7);
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [name, password] = decoded.split(':');
    const inv = poolConfig.investors.find(i => i.name.toLowerCase() === name.toLowerCase());
    if (inv && inv.password === password) {
      req.investor = inv;
      return next();
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
      const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
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

app.post('/api/investor/request_withdraw', investorAuth, (req, res) => {
  const { amount } = req.body;
  const inv = req.investor;
  const withdrawAmount = Number(amount);
  if (withdrawAmount <= 0) return res.json({ error: 'Monto inválido' });
  if (inv.profit + inv.deposit < withdrawAmount) return res.json({ error: 'Fondos insuficientes' });
  
  if (!poolConfig.withdrawalRequests) poolConfig.withdrawalRequests = [];
  
  poolConfig.withdrawalRequests.push({
    id: Date.now().toString() + Math.floor(Math.random()*1000),
    name: inv.name,
    amount: withdrawAmount,
    destinationWallet: inv.depositWallet,
    status: 'pending',
    createdAt: Date.now()
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
    const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
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

app.get('/api/pool/backup', (req, res) => {
  if (poolConfig.privateKey) {
    res.json({ success: true, privateKey: poolConfig.privateKey });
  } else {
    res.json({ error: 'No hay llave privada generada' });
  }
});

app.get('/api/pool', (req, res) => {
  const safePoolConfig = { ...poolConfig };
  delete safePoolConfig.privateKey;
  res.json({ poolConfig: safePoolConfig, trades: SIM.trades || [] });
});

app.post('/api/pool/investor', (req, res) => {
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
      } catch(e) {
        console.error('Error generating deposit wallet:', e);
      }
    }
    
    inv = { 
      name, 
      deposit: 0, 
      profit: 0, 
      joinedAt: Date.now(), 
      password: password || '1234',
      expectedDeposit: Number(amount) || 0,
      depositStatus: (Number(amount) > 0) ? 'pending_user' : 'active',
      depositWallet: generatedWallet || '',
      depositWalletPk: generatedPk || ''
    };
    poolConfig.investors.push(inv);
  } else {
    if (password) inv.password = password;
    if (depositWallet) inv.depositWallet = depositWallet;
    if (amount && Number(amount) > 0) {
      inv.expectedDeposit = (inv.expectedDeposit || 0) + Number(amount);
      inv.depositStatus = 'pending_user';
    }
  }
  
  saveState();
  res.json({ success: true, poolConfig });
});

app.post('/api/pool/delete_investor', (req, res) => {
  const { name } = req.body;
  const initialLength = poolConfig.investors.length;
  poolConfig.investors = poolConfig.investors.filter(i => i.name.toLowerCase() !== name.toLowerCase());
  
  if (poolConfig.investors.length === initialLength) {
    return res.json({ error: 'Inversor no encontrado' });
  }
  
  saveState();
  res.json({ success: true });
});

app.post('/api/pool/approve_deposit', (req, res) => {
  const { name } = req.body;
  let inv = poolConfig.investors.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (inv && inv.depositStatus === 'pending_admin') {
    inv.deposit += inv.expectedDeposit || 0;
    inv.expectedDeposit = 0;
    inv.depositStatus = 'active';
    saveState();
  }
  res.json({ success: true, poolConfig });
});

app.post('/api/pool/config', (req, res) => {
  const { walletAddress, commissionRate } = req.body;
  if (walletAddress !== undefined) poolConfig.walletAddress = walletAddress;
  if (commissionRate !== undefined) poolConfig.commissionRate = Number(commissionRate);
  saveState();
  res.json({ success: true, poolConfig });
});

app.post('/api/pool/request_withdraw', (req, res) => {
  const { name, amount, destinationWallet } = req.body;
  const inv = poolConfig.investors.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (!inv) return res.json({ error: 'Inversor no encontrado' });
  const withdrawAmount = Number(amount);
  if (withdrawAmount <= 0) return res.json({ error: 'Monto inválido' });
  if (inv.profit + inv.deposit < withdrawAmount) return res.json({ error: 'Fondos insuficientes' });
  
  if (!poolConfig.withdrawalRequests) poolConfig.withdrawalRequests = [];
  
  poolConfig.withdrawalRequests.push({
    id: Date.now().toString() + Math.floor(Math.random()*1000),
    name: inv.name,
    amount: withdrawAmount,
    destinationWallet,
    status: 'pending',
    createdAt: Date.now()
  });
  
  saveState();
  res.json({ success: true, poolConfig });
});

app.post('/api/pool/approve_withdraw', async (req, res) => {
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
      const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
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
  res.json({ success: true, poolConfig });
});

app.post('/api/pool/withdraw_admin', async (req, res) => {
  const { destinationWallet, amount } = req.body;
  if (!destinationWallet || !amount || amount <= 0) return res.json({ error: 'Datos inválidos' });
  
  if (!poolConfig.totalCommissionEarned || poolConfig.totalCommissionEarned < amount) {
    return res.json({ error: 'Comisión insuficiente' });
  }

  if (poolConfig.privateKey) {
    try {
      const rpcUrl = appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
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
  res.json({ success: true, poolConfig });
});

app.post('/api/pool/reject_withdraw', (req, res) => {
  const { id } = req.body;
  if (!poolConfig.withdrawalRequests) poolConfig.withdrawalRequests = [];
  const reqIdx = poolConfig.withdrawalRequests.findIndex(r => r.id === id);
  if (reqIdx === -1) return res.json({ error: 'Solicitud no encontrada' });
  
  poolConfig.withdrawalRequests[reqIdx].status = 'rejected';
  saveState();
  res.json({ success: true, poolConfig });
});

app.post('/api/pool/reset_investor', (req, res) => {
  const { name } = req.body;
  poolConfig.investors = poolConfig.investors.filter(i => i.name !== name);
  saveState();
  res.json({ success: true, poolConfig });
});

// ============================================

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
    SIM, 
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

app.post('/api/state', (req, res) => {
  const { sim, watch } = req.body;
  if (sim) {
    Object.assign(SIM, sim);
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

app.get('/api/config', (req, res) => {
  // Solo enviar a la vista web para que vea qué variables están seteadas o si están vacías.
  res.json(appConfig);
});

app.post('/api/config', (req, res) => {
  const { mexcApiKey, mexcApiSecret, tgBotToken, tgChatId, appPassword, solanaPrivateKey, solanaRpcUrl, solanaBaseToken, solanaSlippage, solanaPriorityFee, dextoolsApiKey } = req.body;
  if(mexcApiKey !== undefined) appConfig.mexcApiKey = mexcApiKey;
  if(mexcApiSecret !== undefined) appConfig.mexcApiSecret = mexcApiSecret;
  if(tgBotToken !== undefined) appConfig.tgBotToken = tgBotToken;
  if(tgChatId !== undefined) appConfig.tgChatId = tgChatId;
  if(appPassword !== undefined) appConfig.appPassword = appPassword;
  if(solanaPrivateKey !== undefined) appConfig.solanaPrivateKey = solanaPrivateKey;
  if(solanaRpcUrl !== undefined) appConfig.solanaRpcUrl = solanaRpcUrl;
  if(solanaBaseToken !== undefined) appConfig.solanaBaseToken = solanaBaseToken;
  if(solanaSlippage !== undefined) appConfig.solanaSlippage = parseFloat(solanaSlippage) || 2.5;
  if(solanaPriorityFee !== undefined) appConfig.solanaPriorityFee = solanaPriorityFee;
  if(dextoolsApiKey !== undefined) appConfig.dextoolsApiKey = dextoolsApiKey;
  saveState();
  res.json({ status: 'ok', config: appConfig });
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

app.post('/api/action', async (req, res) => {
  const { action, payload } = req.body;
  
  if (action === 'setMode') {
    if (payload.mode) {
      mode = payload.mode;
      addLog(`Modo Global cambiado a: ${mode.toUpperCase()}`, 'warn');
    }
    if (payload.solMode) {
      solMode = payload.solMode;
      addLog(`Modo Solana cambiado a: ${solMode === 'wallet' ? 'WALLET REAL' : 'SIMULADO'}`, 'warn');
    }
    saveState();
    return res.json({ ok: true });
  } else if (action === 'start') {
    monitorOn = true; 
    monitorInterval = payload.interval || 15;
    addLog(`🚀 Monitor VPS activo — ${monitorInterval}s`, 'info');
    startLoop();
    saveState();
    return res.json({ status: 'ok', monitorOn: true });

  } else if (action === 'updateInterval') {
    monitorInterval = payload.interval || 15;
    if (monitorOn) {
      startLoop(); // Restart loop with new interval
    }
    
  } else if (action === 'stop') {
    monitorOn = false;
    addLog('⏹ Monitor VPS detenido', 'warn');
    saveState();
    return res.json({ status: 'ok', monitorOn: false });

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
        if (w.realSellOrderIds && w.realSellOrderIds.length) {
           for (let id of w.realSellOrderIds) await mxCancelOrder(w.symbol, id);
        }
        const inv = filled.reduce((a, o) => a + o.amount, 0);
        const avg = filled.reduce((a, o) => a + o.price * o.amount, 0) / inv;
        const cp = w.currentPrice || w.cp;
        let pnl = inv * (cp - avg) / avg;
        
        if (w.network === 'solana') {
           const res = await executeOrder(w, 'SELL', inv + pnl, cp);
           if (res.ok) {
              if (res.exactAmountUSDT !== undefined) {
                 pnl = res.exactAmountUSDT - inv;
                 addLog(`ℹ️ [Solana Real] PNL exacto ajustado post-swap (Manual): $${pnl.toFixed(2)}`, 'info');
              }
              if (solMode !== 'wallet') {
                 SIM.balance += inv + pnl;
                 SIM.solBalance -= (inv / avg);
              }
           }
        } else {
           if (mode === 'real') await executeOrder(w, 'SELL', inv + pnl, cp);
           if (mode !== 'real') SIM.balance += inv + pnl;
        }
        
        SIM.pnl += pnl; distributePnL(pnl);
        if (pnl > 0) SIM.wins++; else SIM.losses++;
        SIM.trades.push({ symbol: w.symbol, avgEntry: avg, exit: cp, pnl, pnlPct: ((cp - avg) / avg * 100).toFixed(2), at: Date.now() });
        
        watchItems.splice(wi, 1);
        addLog(`💰 CERRADO MANUAL ${w.symbol} · P&L $${pnl.toFixed(2)}`, 'sell');
      }
    }
    
  } else if (action === 'resetSim') {
    SIM.balance = SIM.initBal || 1000;
    SIM.solBalance = 10;
    SIM.pnl = 0;
    SIM.wins = 0;
    SIM.losses = 0;
    SIM.trades = [];
    SIM.totalExec = 0;
    
    // Optional: also clear logs & history
    if (payload && payload.clearLogs) {
        logs = [];
        solanaSwapLogs = [];
    }
    
    addLog(`♻️ Simulación reseteada a estado inicial`, 'info');
    saveState();
    return res.json({ ok: true, sim: SIM });
    
  } else if (action === 'quickMarketBuy') {
    const { symbol, network, address, pair, amount } = payload;
    let w = watchItems.find(x => x.symbol === symbol);
    let cp = 0;
    
    if (network === 'solana') {
        cp = await getSolanaPrice(address);
    } else {
        cp = await mxPrice(symbol);
    }

    if (!cp || cp <= 0) return res.json({ error: 'No se pudo obtener el precio actual.' });

    if (!w) {
        w = { symbol, pair, network, address, currentPrice: cp, orders: [], lastUpdate: Date.now() };
        watchItems.push(w);
    }

    const order = { level: w.orders.length + 1, price: cp, amount: +amount, note: 'Market Buy', status: 'filled', type: 'market', fillPrice: cp, filledAt: Date.now() };
    w.orders.push(order);
    
    if (!w.filledBuys) w.filledBuys = [];
    w.filledBuys.push({ price: cp, amount: +amount, level: order.level });
    
    SIM.totalExec++;

    const realRes = await executeOrder(w, 'BUY', order.amount, cp);
    if (!realRes || !realRes.ok) {
       addLog(`⚠️ Fallo Market Buy real en ${network} para ${symbol}. Operación simulada ejecutada.`, 'warn');
    } else {
       addLog(`⚡ Market Buy real exitoso para ${symbol} (Tx: ${realRes.txid})`, 'buy');
    }
    
    if (network === 'solana') {
       if (solMode !== 'wallet') {
         SIM.balance -= order.amount;
         SIM.solBalance += (order.amount / cp);
       }
    } else {
       if (mode !== 'real') SIM.balance -= order.amount;
    }

    addLog(`⚡ COMPRA INSTANTÁNEA (Mercado) de ${symbol} por $${order.amount} a $${cp}.`, 'buy');
    saveState();
    return res.json({ ok: true });

  } else if (action === 'manualFill') {
    const w = watchItems[payload.wi];
    const o = w.orders[payload.oi];
    const cp = w.currentPrice || w.cp;
    
    o.status = 'filled'; 
    o.filledAt = Date.now(); 
    o.filledPrice = cp;
    if (!w.filledBuys) w.filledBuys = [];
    w.filledBuys.push({ price: cp, amount: o.amount, level: o.level });
    
    if (w.network === 'solana') {
      SIM.balance -= o.amount;
      SIM.solBalance += o.amount / cp;
    } else {
      SIM.balance -= o.amount; 
    }
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
    const cp = o.filledPrice || w.currentPrice || w.cp;
    SIM.balance += o.amount; 
    if (w.network === 'solana') {
      SIM.solBalance -= o.amount / cp;
    }
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
      app.get('/investor', (req, res) => res.sendFile(path.join(__dirname, 'investor.html')));
      app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
    } else {
      app.use(express.static(__dirname));
      app.get('/investor', (req, res) => res.sendFile(path.join(__dirname, 'investor.html')));
      app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 SERVIDOR VPS INICIADO 24/7 en puerto ${PORT}`);
    console.log(`📂 Panel de control accesible vía IP pública:${PORT} o enlace generado.`);
  });
}

startServer();
