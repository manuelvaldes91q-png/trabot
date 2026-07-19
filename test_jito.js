async function test() {
  const bundleReq = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getTipAccounts',
    params: []
  };
  const res = await fetch('https://mainnet.block-engine.jito.wtf/api/v1/bundles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bundleReq)
  });
  console.log(await res.json());
}
test();
