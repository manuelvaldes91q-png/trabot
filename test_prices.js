import { Connection } from '@solana/web3.js';
import raydiumPkg from '@raydium-io/raydium-sdk-v2';
const { LIQUIDITY_VERSION_TO_STATE_LAYOUT } = raydiumPkg;
console.log(LIQUIDITY_VERSION_TO_STATE_LAYOUT ? "OK layout" : "FAIL layout");
