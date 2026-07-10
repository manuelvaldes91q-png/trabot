async function testRc() {
  const res = await fetch('https://api.rugcheck.xyz/v1/tokens/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/report/summary');
  const json = await res.json();
  console.log(Object.keys(json));
}
testRc();
