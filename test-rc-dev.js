async function testRc() {
  const res = await fetch('https://api.rugcheck.xyz/v1/tokens/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/report');
  const json = await res.json();
  console.log("creator:", json.creator);
  console.log("creatorBalance:", json.creatorBalance);
  console.log("token supply:", json.token?.supply);
  console.log("token decimals:", json.token?.decimals);
}
testRc();
