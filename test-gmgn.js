async function testGmgn() {
  try {
    const res = await fetch('https://gmgn.ai/api/v1/token_security_sol/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const text = await res.text();
    console.log("Status:", res.status);
    console.log(text.substring(0, 100));
  } catch(e) {
    console.error(e);
  }
}
testGmgn();
