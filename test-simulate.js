import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { getAccount } from '@solana/spl-token';
import fetch from 'node-fetch';

async function testSimulate(tokenMint) {
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  try {
    const largestAccounts = await connection.getTokenLargestAccounts(new PublicKey(tokenMint));
    if (largestAccounts.value.length === 0) return { ok: false, msg: 'no holders' };
    
    // find a holder with some balance
    let owner = null;
    let amount = 1000;
    for (const acc of largestAccounts.value) {
       try {
           const info = await getAccount(connection, acc.address);
           if (info.amount > 0) {
               owner = info.owner;
               amount = Math.min(Number(info.amount), 1000000);
               break;
           }
       } catch(e) {}
    }
    
    if (!owner) return { ok: false, msg: 'no owner' };
    
    const quoteUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${tokenMint}&outputMint=So11111111111111111111111111111111111111112&amount=${amount}&slippageBps=1000`;
    console.log("quoteUrl", quoteUrl);
    const qr = await fetch(quoteUrl);
    const quoteResponse = await qr.json();
    
    if (!quoteResponse.routePlan) return { ok: false, msg: 'no route on jupiter' };
    
    const sr = await fetch('https://api.jup.ag/swap/v1/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            quoteResponse,
            userPublicKey: owner.toString(),
            wrapAndUnwrapSol: true
        })
    });
    const swapRes = await sr.json();
    if (swapRes.swapTransaction) {
        const txBuf = Buffer.from(swapRes.swapTransaction, 'base64');
        const tx = VersionedTransaction.deserialize(txBuf);
        const simRes = await connection.simulateTransaction(tx, { sigVerify: false });
        console.log("simRes", simRes.value);
        return { ok: true, err: simRes.value.err, logs: simRes.value.logs };
    }
    return { ok: false, msg: 'no swap tx' };
  } catch (e) {
    console.error(e);
  }
}

testSimulate('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263').then(console.log);
