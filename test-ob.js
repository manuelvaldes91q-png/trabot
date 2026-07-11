async function test() {
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/pairs/solana/4doNfym5CRvwcqzSb4GeA1zpm1B2r9EUVG47s9a4qP29'); // SOL/USDC Phoenix
    const json = await res.json();
    console.log(json.pair);
  } catch(e) { console.log(e); }
}
test();
