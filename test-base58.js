import { PublicKey } from '@solana/web3.js';
import "dotenv/config";
const appConfig = {};
const usdcMintStr = appConfig.solanaBaseToken || process.env.SOLANA_BASE_TOKEN || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
console.log("String is:", JSON.stringify(usdcMintStr));
try {
  new PublicKey(usdcMintStr);
  console.log("OK");
} catch(e) {
  console.log(e.message);
}
