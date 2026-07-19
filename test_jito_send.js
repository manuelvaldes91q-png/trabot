import { Connection, Keypair, Transaction, SystemProgram, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

async function test() {
  const kp = Keypair.generate();
  const conn = new Connection('https://api.mainnet-beta.solana.com');
  const tipAccount = '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5';
  
  const blockhash = await conn.getLatestBlockhash();
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: new PublicKey(tipAccount),
      lamports: 1000
    })
  );
  tx.recentBlockhash = blockhash.blockhash;
  tx.feePayer = kp.publicKey;
  tx.sign(kp);

  const txBase58 = bs58.encode(tx.serialize());
  const txBase64 = tx.serialize().toString('base64');
  
  // test base58
  const req1 = { jsonrpc: '2.0', id: 1, method: 'sendBundle', params: [[txBase58]] };
  const res1 = await fetch('https://mainnet.block-engine.jito.wtf/api/v1/bundles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req1) });
  console.log("base58 response:", await res1.json());
  
  // test base64 (which is what current code uses)
  const req2 = { jsonrpc: '2.0', id: 1, method: 'sendBundle', params: [[txBase64], { encoding: 'base64' }] };
  const res2 = await fetch('https://mainnet.block-engine.jito.wtf/api/v1/bundles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req2) });
  console.log("base64 response:", await res2.json());
}
test();
