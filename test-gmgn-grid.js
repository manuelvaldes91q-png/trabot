const makeGrid = (res) => {
    let rcRisks = res.details?.rugcheckRisks || [];
    
    // Top 10
    let top10Pct = res.details?.holderConcentration?.top10Pct;
    let top10Str = top10Pct !== null && top10Pct !== undefined ? top10Pct + '%' : '--';
    let top10Color = top10Pct !== null && top10Pct > 50 ? 'var(--r)' : (top10Pct !== null ? 'var(--g)' : 'var(--t3)');
    let top10Icon = top10Pct !== null && top10Pct > 50 ? '⚠️ ' : (top10Pct !== null ? '✅ ' : '');

    // DEV
    let creatorBalance = res.details?.creatorBalance || 0;
    // We don't have total supply from RC easily in this context, but if top10 has pct we can guess, 
    // or just say "--" if unknown. Wait, creatorBalance might be in tokens, not %.
    let devPct = '0%';
    let devColor = 'var(--g)';

    // Holders
    let holders = res.details?.totalHolders || '--';

    // Snipers
    let snipers = '0%'; // Hardcoded for now unless we calculate it

    // Insiders
    let insiders = res.details?.graphInsidersDetected ? res.details.graphInsidersDetected + '%' : '0%';
    let insidersColor = res.details?.graphInsidersDetected > 0 ? 'var(--r)' : 'var(--g)';

    // Phishing
    let phishing = '0%';
    
    // Bundler
    let bundler = '0%';

    // Dex Paid
    let hasMarkets = res.details?.markets && res.details.markets.length > 0;
    let dexPaid = hasMarkets ? 'Paid' : 'Unpaid';
    let dexPaidColor = hasMarkets ? 'var(--g)' : 'var(--t3)';

    // No Mint
    let noMint = res.details?.mintAuthorityRevoked;
    let noMintStr = noMint === true ? '✅ ' : (noMint === false ? '❌ ' : '--');
    let noMintColor = noMint === true ? 'var(--g)' : (noMint === false ? 'var(--r)' : 'var(--t3)');

    // No Blacklist
    // Freeze auth or blacklist in RC
    let noBlacklist = res.details?.freezeAuthorityRevoked;
    let noBlacklistStr = noBlacklist === true ? '✅ ' : (noBlacklist === false ? '❌ ' : '--');
    let noBlacklistColor = noBlacklist === true ? 'var(--g)' : (noBlacklist === false ? 'var(--r)' : 'var(--t3)');

    // Quemado
    let isLpUnlocked = rcRisks.some(r => r.toLowerCase().includes('lp unlocked') || r.toLowerCase().includes('liquidity not locked'));
    let quemadoStr = !isLpUnlocked ? '🔥 100%' : '0%';
    let quemadoColor = !isLpUnlocked ? 'var(--g)' : 'var(--r)';

    // Probabilidad de Rug
    let probRug = res.details?.rugcheckScore || 0;
    let probRugColor = probRug > 50 ? 'var(--r)' : (probRug > 10 ? 'var(--y)' : 'var(--g)');
    let probRugStr = probRug + '%';
    
    return `
      <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;background:rgba(0,0,0,0.2);padding:12px;border-radius:6px;margin-bottom:8px;">
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">Top 10</div>
            <div style="font-size:11px;font-weight:700;color:${top10Color};font-family:var(--mono)">${top10Icon}${top10Str}</div>
        </div>
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">DEV</div>
            <div style="font-size:11px;font-weight:700;color:${devColor};font-family:var(--mono)">👨‍🍳 ${devPct}</div>
        </div>
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">Holders</div>
            <div style="font-size:11px;font-weight:700;color:var(--t1);font-family:var(--mono)">${holders}</div>
        </div>
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">Snipers</div>
            <div style="font-size:11px;font-weight:700;color:var(--g);font-family:var(--mono)">🎯 ${snipers}</div>
        </div>
        
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">Insiders</div>
            <div style="font-size:11px;font-weight:700;color:${insidersColor};font-family:var(--mono)">${insiders}</div>
        </div>
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">Phishing</div>
            <div style="font-size:11px;font-weight:700;color:var(--g);font-family:var(--mono)">${phishing}</div>
        </div>
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">Bundler</div>
            <div style="font-size:11px;font-weight:700;color:var(--g);font-family:var(--mono)">${bundler}</div>
        </div>
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">Dex Paid</div>
            <div style="font-size:11px;font-weight:700;color:${dexPaidColor};font-family:var(--mono)">${dexPaid}</div>
        </div>

        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">No Mint</div>
            <div style="font-size:11px;font-weight:700;color:${noMintColor};font-family:var(--mono)">${noMintStr}</div>
        </div>
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">No Blacklist</div>
            <div style="font-size:11px;font-weight:700;color:${noBlacklistColor};font-family:var(--mono)">${noBlacklistStr}</div>
        </div>
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">Quemado</div>
            <div style="font-size:11px;font-weight:700;color:${quemadoColor};font-family:var(--mono)">${quemadoStr}</div>
        </div>
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">Prob de Rug</div>
            <div style="font-size:11px;font-weight:700;color:${probRugColor};font-family:var(--mono)">${probRugStr}</div>
        </div>
      </div>
    `;
}
console.log('OK');
