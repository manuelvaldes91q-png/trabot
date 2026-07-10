const makeGrid = (res) => {
    let rcRisks = res.details?.rugcheckRisks || [];
    let lpLocked = !rcRisks.some(r => r.toLowerCase().includes('lp unlocked') || r.toLowerCase().includes('liquidity not locked'));
    
    // We can map boolean to text
    const formatBool = (val, trueText, falseText) => {
        if (val === true) return `<div style="color:var(--g);display:flex;align-items:center;gap:3px"><span>✅</span> ${trueText}</div>`;
        if (val === false) return `<div style="color:var(--r);display:flex;align-items:center;gap:3px"><span>❌</span> ${falseText}</div>`;
        return `<div style="color:var(--t3)">--</div>`;
    };

    let top10Pct = res.details?.holderConcentration?.top10Pct;
    let top10Str = top10Pct !== null && top10Pct !== undefined ? top10Pct + '%' : '--';
    let top10Color = top10Pct > 50 ? 'var(--r)' : 'var(--g)';

    let mintStr = formatBool(res.details?.mintAuthorityRevoked, 'No Mint', 'Activa');
    let freezeStr = formatBool(res.details?.freezeAuthorityRevoked, 'No Freeze', 'Activa');
    let lpStr = formatBool(lpLocked, 'Bloqueada', 'Desbloqueada');
    
    let isHoneypot = res.details?.sellSimulation?.attempted && !res.details?.sellSimulation?.success;
    let hpStr = formatBool(!isHoneypot, 'Pasó Venta', 'Honeypot');

    return `
    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;background:rgba(0,0,0,0.2);padding:10px;border-radius:6px;margin-bottom:8px;">
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">Top 10</div>
            <div style="font-size:10px;font-weight:700;color:${top10Color};font-family:var(--mono)">${top10Str}</div>
        </div>
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">Mint Auth</div>
            <div style="font-size:10px;font-weight:700;font-family:var(--mono)">${mintStr}</div>
        </div>
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">Freeze Auth</div>
            <div style="font-size:10px;font-weight:700;font-family:var(--mono)">${freezeStr}</div>
        </div>
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">Liquidez (LP)</div>
            <div style="font-size:10px;font-weight:700;font-family:var(--mono)">${lpStr}</div>
        </div>
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">Test Venta</div>
            <div style="font-size:10px;font-weight:700;font-family:var(--mono)">${hpStr}</div>
        </div>
        <div style="display:flex;flex-direction:column;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-bottom:2px">RugCheck</div>
            <div style="font-size:10px;font-weight:700;color:\${riskBarColor};font-family:var(--mono)">\${rcScore}</div>
        </div>
    </div>
    `;
}
console.log('OK');
