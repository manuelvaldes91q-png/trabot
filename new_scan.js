async function runSafetyScan(symbol, address, network) {
  const panel = document.getElementById('xScamPanel');
  if (!panel) return;
  
  if (network !== 'solana') {
    panel.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:5px;padding:8px 10px;margin-top:6px;text-align:center;font-size:8px;color:var(--y);font-family:var(--mono);">
        ⚠️ Escáner de seguridad avanzado (RugCheck + Simulador) solo disponible para Solana.
      </div>
    `;
    return;
  }

  panel.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:5px;padding:8px 10px;text-align:center;">
      <div style="display:flex;align-items:center;justify-content:center;font-size:8px;color:var(--t2);font-family:var(--mono);">
        <span style="display:inline-block;margin-right:6px">🛡️</span> Analizando seguridad del token (RugCheck + Honeypot Check)...
      </div>
    </div>
  `;
  try {
    const fetchRes = await myFetch(`/api/token-safety/${address}`);
    if (!fetchRes.ok) throw new Error("Error en servidor al consultar seguridad");
    const res = await fetchRes.json();
    if (!res) throw new Error("Error al obtener datos");
    
    let riskColor = res.safe ? "var(--g)" : "var(--r)";
    let riskText = res.safe ? "SEGURO" : "ALTO RIESGO / SCAM";
    let rcScore = res.details?.rugcheckScore || 0;
    
    let riskBarColor = rcScore > 50 ? "var(--r)" : (rcScore > 10 ? "var(--y)" : "var(--g)");
    
    let alertsHtml = res.warnings.length === 0 
      ? '<div style="color:var(--g);font-size:8px;padding:4px 0;">✅ Ningún riesgo on-chain detectado.</div>' 
      : res.warnings.map(w => `<div style="color:var(--r);font-size:8px;margin-bottom:3px;padding-left:10px;position:relative;"><span style="color:var(--r);position:absolute;left:0;">•</span>${w}</div>`).join('');
      
    let simResult = '';
    if (res.details?.sellSimulation?.attempted) {
      if (res.details.sellSimulation.success) {
        simResult = '<div style="color:var(--g);font-size:8px;margin-top:4px;">✅ Simulación de venta exitosa (No parece ser honeypot).</div>';
      } else {
        simResult = `<div style="color:var(--r);font-size:8px;margin-top:4px;font-weight:bold;">🚨 ERROR EN VENTA: ${res.details.sellSimulation.error || 'Simulación falló'} (ALTA PROBABILIDAD DE HONEYPOT)</div>`;
      }
    }

    panel.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:5px;padding:8px 10px;margin-top:6px;">
        <div style="font-family:var(--mono);font-size:8px;font-weight:700;color:var(--g);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
          <span style="color:#a855f7">🛡️ ESCÁNER ANTI-RUG / HONEYPOT</span>
          <span class="tag" style="background:rgba(168,85,247,0.15);color:#a855f7;font-size:7px;border:1px solid rgba(168,85,247,0.2);margin:0">ACTIVO</span>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.2);padding:6px 8px;border-radius:4px;margin-bottom:8px;">
          <div>
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono)">Estado del Token:</div>
            <div style="font-size:11px;font-weight:800;color:${riskColor};font-family:var(--mono);">${riskText}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono)">RugCheck Score:</div>
            <div style="font-size:11px;font-weight:800;color:${riskBarColor};font-family:var(--mono);">${rcScore} / 100</div>
          </div>
        </div>

        <div style="font-size:7px;font-family:var(--mono);color:var(--t2);text-transform:uppercase;margin-bottom:4px;font-weight:700;">🔍 Detalle de Seguridad:</div>
        <div style="background:rgba(0,0,0,0.15); border-radius:4px; border:1px solid rgba(255,255,255,0.03); padding:6px 8px;">
          <div style="display:flex; justify-content:space-between; font-size:8px; font-family:var(--mono); margin-bottom:4px;">
            <span>Mint Authority (Imprimir más):</span>
            <span style="color:${res.details?.mintAuthorityRevoked ? 'var(--g)' : 'var(--r)'}">${res.details?.mintAuthorityRevoked ? 'REVOCADA ✅' : 'ACTIVA ❌'}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:8px; font-family:var(--mono); margin-bottom:4px;">
            <span>Freeze Authority (Bloquear ventas):</span>
            <span style="color:${res.details?.freezeAuthorityRevoked ? 'var(--g)' : 'var(--r)'}">${res.details?.freezeAuthorityRevoked ? 'REVOCADA ✅' : 'ACTIVA ❌'}</span>
          </div>
          ${simResult}
        </div>

        <div style="margin-top:8px;">
          <div style="font-size:7px;font-family:var(--mono);color:var(--t2);text-transform:uppercase;margin-bottom:4px;font-weight:700;">⚠️ Alertas / Advertencias:</div>
          ${alertsHtml}
        </div>
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:5px;padding:8px 10px;margin-top:6px;text-align:center;font-size:8px;color:var(--r);font-family:var(--mono);">
        ⚠️ Falló el chequeo de seguridad: ${err.message}
      </div>
    `;
  }
}
