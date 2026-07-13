const fs = require('fs');

const endpointCode = `
app.get('/api/token/audit/:mint', adminAuth, async (req, res) => {
  const mint = req.params.mint;
  try {
    const url = \`https://api.rugcheck.xyz/v1/tokens/\${mint}/report\`;
    const checkRes = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!checkRes.ok) throw new Error("Error fetching RugCheck data");
    const data = await checkRes.json();
    
    // Calcular metricas
    let top10 = 0;
    if (data.topHolders) {
      // Filtrar el par LP u otros marcados (a veces Raydium Authority)
      const filteredHolders = data.topHolders.filter(h => !h.isContract && !h.owner.includes("Raydium") && !h.owner.includes("5Q544fKrFoe6tsEbD7S8EmxPo")); // Una aproximacion basica
      top10 = data.topHolders.slice(0, 10).reduce((acc, h) => acc + h.pct, 0); // Tomaremos directo
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
      lpLocked = market.lpLockedPct || (market.lp ? market.lp.lpLockedPct : 0) || 0;
    }
    
    const risks = data.risks || [];
    let isPhishing = risks.some(r => r.name.toLowerCase().includes('phish'));
    let isBundled = risks.some(r => r.name.toLowerCase().includes('bundle'));
    let hasInsiders = risks.some(r => r.name.toLowerCase().includes('insider'));
    
    // Probabilidad Rugcheck (score alto = mal)
    let rugProb = (data.score || 0) * 1.5; // Aproximacion a % (0-100)
    if (rugProb > 100) rugProb = 99;

    res.json({
      available: true,
      top10: top10,
      dev: creatorPct,
      holders: holders,
      insiders: hasInsiders ? "Sí" : "0%",
      phishing: isPhishing ? "Sí" : "0%",
      bundler: isBundled ? "Sí" : "0%",
      dexPaid: "N/A", // API no nos da este dato exacto
      noMint: noMint,
      noBlacklist: noBlacklist,
      lpBurned: lpLocked,
      rugProb: rugProb.toFixed(1) + "%"
    });
  } catch(e) {
    console.error("[Token Audit Error]", e.message);
    res.json({ available: false, error: e.message });
  }
});
`;

const content = fs.readFileSync('server.js', 'utf8');
const targetStr = "app.post('/api/action', adminAuth, async (req, res) => {";
if (content.includes(targetStr)) {
  const updated = content.replace(targetStr, endpointCode + '\n' + targetStr);
  fs.writeFileSync('server.js', updated);
  console.log("Success");
} else {
  console.log("Could not find target");
}
