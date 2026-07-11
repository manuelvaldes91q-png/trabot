import { Connection, PublicKey } from '@solana/web3.js';
import * as phoenix from '@ellipsis-labs/phoenix-sdk';

async function test() {
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const client = await phoenix.Client.create(connection);
    
    console.log("Keys:", Array.from(client.marketStates.keys()).slice(0, 3));
    const marketKey = Array.from(client.marketStates.keys())[0];
    try {
        const ladder = client.getUiLadder(marketKey, 5);
        console.log("Ladder for", marketKey);
        console.log("Asks:", ladder.asks);
        console.log("Bids:", ladder.bids);
    } catch(e) { console.error(e.message); }
}
test();
