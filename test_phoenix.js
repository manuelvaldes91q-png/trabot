import { Connection } from '@solana/web3.js';
import * as phoenix from '@ellipsis-labs/phoenix-sdk';

async function initPhoenix() {
  let phoenixClient = null;
  const rpcs = ['https://api.mainnet-beta.solana.com'];
  for (const rpc of rpcs) {
    try {
      const connection = new Connection(rpc);
      phoenixClient = await phoenix.Client.create(connection, { skipFetch: false });
      console.log(`Phoenix client initialized with ${phoenixClient.marketStates.size} markets using ${rpc}`);
      return;
    } catch (e) {
      console.warn(`Phoenix init failed on ${rpc}: ${e.message}`);
    }
  }
  console.error("Phoenix init failed on all RPCs.");
}

initPhoenix();
