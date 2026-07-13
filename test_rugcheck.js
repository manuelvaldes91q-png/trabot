async function test() {
  const mint = "gCETSgf89gXTMZGSDWamDvmjoxypsJL55rjf2o4pump";
  const url = `https://api.rugcheck.xyz/v1/tokens/${mint}/report`;
  const res = await fetch(url);
  const data = await res.json();
  
  let top10 = 0;
  if (data.topHolders) {
    top10 = data.topHolders.slice(0, 10).reduce((acc, h) => acc + h.pct, 0);
  }
  
  let creatorPct = 0;
  if (data.creator && data.topHolders) {
    const creatorHolder = data.topHolders.find(h => h.owner === data.creator);
    if (creatorHolder) creatorPct = creatorHolder.pct;
  }
  
  const holders = data.totalHolders || 0;
  const noMint = data.mintAuthority === null;
  const noBlacklist = data.freezeAuthority === null;
  
  let lpLocked = 0;
  if (data.markets && data.markets.length > 0) {
    const market = data.markets[0];
    if (market.lp) {
      lpLocked = market.lp.lpLockedPct || 0;
    } else {
      lpLocked = market.lpLockedPct || 0;
    }
  }
  
  const risks = data.risks || [];
  const score = data.score || 0;
  
  console.log(JSON.stringify({ top10, creatorPct, holders, noMint, noBlacklist, lpLocked, risks, score }, null, 2));
}
test();
