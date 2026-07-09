const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const bs58 = require('bs58');
const { Connection, Keypair, VersionedTransaction, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction, getAccount, createCloseAccountInstruction, createAssociatedTokenAccountInstruction, getMint } = require('@solana/spl-token');
const appConfig = { solanaRpcUrl: 'https://api.mainnet-beta.solana.com' };

async function fetchWithRetry(url, options, retries = 2, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (res.ok || i === retries - 1) return res;
        } catch (err) {
            if (i === retries - 1) throw err;
        }
        await new Promise(r => setTimeout(r, delay));
    }
}

async function checkTokenSafety(tokenMint) {
  const result = { safe: true, warnings: [], details: {} };
  try {
    const rcRes = await fetchWithRetry(`https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report/summary`, { timeout: 8000 }, 2, 1000);
    if (rcRes && rcRes.ok) {
      const rc = await rcRes.json();
      const score = rc.score_normalised ?? rc.score ?? 0;
      result.details.rugcheckScore = score;
      result.details.rugcheckRisks = (rc.risks || []).map(r => r.name);
    }
  } catch(e) {}

  const rpcs = [
    appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL,
    'https://api.mainnet-beta.solana.com',
    'https://rpc.ankr.com/solana'
  ].filter(Boolean);

  let mintInfo = null;
  let authorityCheckSuccess = false;
  
  for (const rpc of rpcs) {
    try {
      const connection = new Connection(rpc, 'confirmed');
      mintInfo = await getMint(connection, new PublicKey(tokenMint));
      authorityCheckSuccess = true;
      break;
    } catch (e) {
      console.log(`Error checking authority with ${rpc}: ${e.message}`);
    }
  }

  if (authorityCheckSuccess && mintInfo) {
    result.details.mintAuthorityRevoked = mintInfo.mintAuthority === null;
    result.details.freezeAuthorityRevoked = mintInfo.freezeAuthority === null;
  }
  
  try {
    result.details.sellSimulation = { attempted: false, success: false, error: null };
    
    let largestAccounts = null;
    let simConnection = null;
    
    for (const rpc of rpcs) {
      try {
        const conn = new Connection(rpc, 'confirmed');
        largestAccounts = await conn.getTokenLargestAccounts(new PublicKey(tokenMint));
        simConnection = conn;
        break; // Éxito
      } catch (e) {
         console.log(`Error getTokenLargestAccounts con ${rpc}: ${e.message}`);
      }
    }
    
    if (largestAccounts && largestAccounts.value && largestAccounts.value.length > 0) {
      result.details.sellSimulation.attempted = true;
    }
  } catch(e) {
      result.warnings.push(`Simulación falló: ${e.message}`);
  }
  return result;
}

checkTokenSafety('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v').then(console.log);
