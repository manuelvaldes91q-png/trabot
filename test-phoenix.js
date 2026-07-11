import { Connection, PublicKey } from '@solana/web3.js';
import * as phoenix from '@ellipsis-labs/phoenix-sdk';

async function test() {
  try {
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const client = await phoenix.Client.create(connection);
    
    // Some known markets: 
    // SOL/USDC: 4DoNfym5CRvwcqzSb4GeA1zpm1B2r9EUVG47s9a4qP29
    
    console.log(Object.keys(client));
    const market = client.marketStates.get('4DoNfym5CRvwcqzSb4GeA1zpm1B2r9EUVG47s9a4qP29');
    if (market) {
        const ob = market.getUiOrderBook();
        console.log("Asks:", ob.asks.slice(0, 3));
        console.log("Bids:", ob.bids.slice(0, 3));
    } else {
        console.log("Market not found, keys:", Array.from(client.marketStates.keys()).slice(0, 5));
    }
  } catch(e) {
    console.error(e);
  }
}
test();
