import fs from 'fs';
let code = fs.readFileSync('server.js', 'utf8');

const trackerFunc = `
async function fetchSolanaTrackerData(tokenMint) {
  const apiKey = appConfig.solanaTrackerApiKey || process.env.SOLANATRACKER_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetchWithRetry(\`https://data.solanatracker.io/tokens/\${tokenMint}\`, {
      headers: { 'x-api-key': apiKey },
      timeout: 8000
    }, 2, 1000);
    if (!res || !res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

async function detectSnipersAndBundlers(connection, tokenMint, currentHoldersMap) {
  return { snipers: 0, bundlers: 0, sniperWalletsCount: 0, bundlerGroups: 0, note: "Fallback local detection not implemented yet" };
}

`;

if (!code.includes('fetchSolanaTrackerData')) {
    code = code.replace('async function checkTokenSafety', trackerFunc + 'async function checkTokenSafety');
}

const innerLogic = `
        const currentHoldersMap = new Map(allHolders.map(h => [h.address, h.pct || 0]));
        const trackerData = await fetchSolanaTrackerData(tokenMint);

        if (trackerData) {
          result.details.solanaTrackerRaw = trackerData;
          result.warnings.push('ℹ️ Datos de Solana Tracker recibidos — revisa result.details.solanaTrackerRaw para confirmar los nombres exactos de campos de snipers/bundlers y terminar de conectarlos.');
        } else {
          const snipeResult = await detectSnipersAndBundlers(simConnection, tokenMint, currentHoldersMap);
          result.details.snipers = snipeResult.snipers;
          result.details.bundlers = snipeResult.bundlers;
          result.details.sniperWalletsCount = snipeResult.sniperWalletsCount;
          result.details.bundlerGroups = snipeResult.bundlerGroups;
          if (snipeResult.note) result.warnings.push(\`ℹ️ \${snipeResult.note}\`);
          if (snipeResult.bundlers !== null && snipeResult.bundlers > 30) {
            result.warnings.push(\`⚠️ Posible bundling detectado: \${snipeResult.bundlerGroups} grupo(s) de wallets fondeadas desde el mismo origen antes de comprar.\`);
          }
        }
`;

if (code.includes('if (top10Pct !== null && top10Pct > 80) {') && !code.includes('fetchSolanaTrackerData(tokenMint)')) {
    code = code.replace(
      'if (top10Pct !== null && top10Pct > 80) {',
      innerLogic + '\n        if (top10Pct !== null && top10Pct > 80) {'
    );
}

fs.writeFileSync('server.js', code);
