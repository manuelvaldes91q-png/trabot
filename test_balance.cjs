const { Connection, PublicKey } = require('@solana/web3.js');
async function test() {
  const rpc = 'https://solana-rpc.publicnode.com';
  const connection = new Connection(rpc);
  const solLamports = await connection.getBalance(new PublicKey('D32AkaSjxB8yYyW9FpXj4R3B1Xz3N6GpN2L9hb83n7Yx'));
  console.log('SOL:', solLamports / 1e9);
}
test();
