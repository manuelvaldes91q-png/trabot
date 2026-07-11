import { Connection, PublicKey } from '@solana/web3.js';
import * as phoenix from '@ellipsis-labs/phoenix-sdk';

async function test() {
  try {
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const client = await phoenix.Client.create(connection, { skipFetch: false });
    
    // Find market for a token mint, e.g., SOL
    const tokenMint = 'So11111111111111111111111111111111111111112';
    
    let targetMarket = null;
    let targetMarketId = null;
    for (const [address, market] of client.marketStates.entries()) {
        const base = market.data.header.baseParams.mintKey.toBase58();
        const quote = market.data.header.quoteParams.mintKey.toBase58();
        if (base === tokenMint && quote === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v') { // SOL/USDC
            targetMarket = market;
            targetMarketId = address;
            break;
        }
    }
    
    if (targetMarket) {
        console.log("Market ID:", targetMarketId);
        const ob = targetMarket.getUiOrderBook();
        console.log("Asks:", ob.asks.slice(0, 3));
        console.log("Bids:", ob.bids.slice(0, 3));
    }
  } catch(e) {
    console.error(e);
  }
}
test();
