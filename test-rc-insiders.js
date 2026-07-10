async function testRc() {
  const res = await fetch('https://api.rugcheck.xyz/v1/tokens/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/report');
  const json = await res.json();
  const networks = json.insiderNetworks || [];
  let totalAmount = 0;
  for (const n of networks) {
    totalAmount += n.tokenAmount;
  }
  const supply = json.token?.supply || 1;
  const pct = (totalAmount / supply) * 100;
  console.log("Total insider tokens:", totalAmount);
  console.log("Supply:", supply);
  console.log("Pct:", pct);
}
testRc();
