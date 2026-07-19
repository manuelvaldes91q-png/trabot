import { Connection, PublicKey } from '@solana/web3.js';
import pkg from '@raydium-io/raydium-sdk-v2';
const { LIQUIDITY_VERSION_TO_STATE_LAYOUT } = pkg;
import { getAccount } from '@solana/spl-token';

async function test() {
    const conn = new Connection('https://api.mainnet-beta.solana.com');
    // Random pool: JUP/USDC for example
    // Or PONKE / SOL... Let's use DexScreener to get a pair
    const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
    const d = await r.json();
    const pair = d.pairs.find(p => p.dexId === 'raydium');
    console.log(pair.pairAddress);
    
    const acc = await conn.getAccountInfo(new PublicKey(pair.pairAddress));
    const layout = LIQUIDITY_VERSION_TO_STATE_LAYOUT[4];
    const decoded = layout.decode(acc.data);
    console.log("baseVault:", decoded.baseVault.toString());
    console.log("quoteVault:", decoded.quoteVault.toString());
}
test().catch(console.error);
