async function testRc() {
  const res = await fetch('https://api.rugcheck.xyz/v1/tokens/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/report');
  const json = await res.json();
  console.log({
    totalHolders: json.totalHolders,
    score: json.score,
    rugged: json.rugged,
    knownAccounts: json.knownAccounts,
    graphInsidersDetected: json.graphInsidersDetected,
    insiderNetworks: json.insiderNetworks,
    totalMarketLiquidity: json.totalMarketLiquidity
  });
}
testRc();
