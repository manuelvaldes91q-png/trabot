async function runXScamScan(symbol, address, network, liq, vol) {
  const panel = document.getElementById('xScamPanel');
  if (!panel) return;
  panel.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:5px;padding:8px 10px;text-align:center;">
      <div style="display:flex;align-items:center;justify-content:center;font-size:8px;color:var(--t2);font-family:var(--mono);">
        <span style="display:inline-block;margin-right:6px">⏳</span> Buscando y analizando automáticamente menciones de estafa en X (Twitter)...
      </div>
    </div>
  `;
  try {
    const qs = new URLSearchParams({ symbol, address: address || 'N/A', network, liq: liq || 0, vol: vol || 0 }).toString();
    const fetchRes = await myFetch(`/api/x-scam-scan?${qs}`);
    if (!fetchRes.ok) throw new Error("Error en servidor");
    const res = await fetchRes.json();
    if (!res) throw new Error("Error al obtener datos");
    
    let riskColor = "var(--g)";
    if (res.riskLevel === "ALTO") riskColor = "var(--r)";
    else if (res.riskLevel === "MEDIO") riskColor = "var(--y)";

    let flagsHtml = res.flags.map(f => `<div style="color:var(--t);font-size:8px;margin-bottom:3px;padding-left:10px;position:relative;"><span style="color:${riskColor};position:absolute;left:0;">•</span>${f}</div>`).join('');

    let tweetsHtml = res.tweets.map(t => {
      let sentBadge = `<span class="tag tg" style="font-size:6px;padding:1px 3px;margin:0">Positivo</span>`;
      if (t.sentiment === "negative") sentBadge = `<span class="tag tr" style="font-size:6px;padding:1px 3px;margin:0">Alerta Estafa</span>`;
      else if (t.sentiment === "neutral") sentBadge = `<span class="tag ty" style="font-size:6px;padding:1px 3px;margin:0">Precaución</span>`;

      return `
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:4px;padding:6px;margin-top:6px;font-family:sans-serif;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <div style="display:flex;align-items:center;">
              <div style="width:16px;height:16px;border-radius:50%;background:#1da1f2;color:white;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;margin-right:4px;">
                ${t.name.charAt(0)}
              </div>
              <div style="font-size:8px;font-weight:700;color:var(--t)">${t.name} <span style="color:var(--t2);font-weight:400;font-size:7px;">${t.handle} · ${t.time}</span></div>
            </div>
            ${sentBadge}
          </div>
          <div style="font-size:8px;color:rgba(255,255,255,0.85);line-height:1.2;margin-bottom:4px;word-break:break-word;">
            ${t.text}
          </div>
          <div style="font-family:var(--mono);font-size:6px;color:var(--t2);display:flex;gap:10px;">
            <span>💬 2</span>
            <span>🔁 ${t.retweets}</span>
            <span>❤️ ${t.likes}</span>
          </div>
        </div>
      `;
    }).join('');

    const totalVotes = (res.scamVotes || 0) + (res.safeVotes || 0);
    const scamPct = Math.round(((res.scamVotes || 0) / (totalVotes || 1)) * 100);
    const safePct = 100 - scamPct;

    panel.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:5px;padding:8px 10px;margin-top:6px;">
        <div style="font-family:var(--mono);font-size:8px;font-weight:700;color:#1da1f2;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
          <span>🐦 ESCÁNER DE SEGURIDAD EN X (TWITTER)</span>
          <span class="tag" style="background:rgba(29,161,242,0.15);color:#1da1f2;font-size:7px;border:1px solid rgba(29,161,242,0.2);margin:0">AUTOSCAN ACTIVADO</span>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(0,0,0,0.2);padding:6px 8px;border-radius:4px;margin-bottom:8px;">
          <div>
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono)">Riesgo Estimado:</div>
            <div style="font-size:11px;font-weight:800;color:${riskColor};font-family:var(--mono);">${res.riskScore}% (${res.riskLevel})</div>
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-top:4px">Actividad Comunidad:</div>
            <div style="font-size:8px;font-weight:700;color:var(--t);font-family:var(--mono);">${res.activityLevel}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono)">Sentimiento X:</div>
            <div style="font-size:8px;font-weight:700;color:var(--t);font-family:var(--mono);">${res.sentiment}</div>
            <div style="font-size:7px;color:var(--t2);font-family:var(--mono);margin-top:4px">Menciones por Hora:</div>
            <div style="font-size:8px;font-weight:700;color:#1da1f2;font-family:var(--mono);">~${res.mentionsPerHour}</div>
          </div>
        </div>

        <!-- Barra de Riesgo -->
        <div style="width:100%;height:4px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;margin-bottom:8px;">
          <div style="width:${res.riskScore}%;height:100%;background:${riskColor};border-radius:2px;"></div>
        </div>

        <div style="font-size:8px;color:var(--t);line-height:1.3;margin-bottom:8px;background:rgba(${res.riskLevel==='ALTO'?'239,68,68,0.05':res.riskLevel==='MEDIO'?'245,158,11,0.05':'16,185,129,0.05'});border-left:2px solid ${riskColor};padding:4px 6px;">
          ${res.verdict}
        </div>

        <!-- Consenso de la Comunidad -->
        <div style="margin-top:8px; margin-bottom:10px; background:rgba(0,0,0,0.15); padding:6px 8px; border-radius:4px; border:1px solid rgba(255,255,255,0.03);">
          <div style="font-size:7px; font-family:var(--mono); color:var(--t2); text-transform:uppercase; margin-bottom:4px; font-weight:700; display:flex; justify-content:space-between;">
            <span>📊 Opinión de la Comunidad en X</span>
            <span>Muestreo: ${totalVotes} cuentas</span>
          </div>
          <div style="width:100%; height:8px; background:rgba(255,255,255,0.05); border-radius:4px; overflow:hidden; display:flex; margin-bottom:4px;">
            <div style="width:${scamPct}%; height:100%; background:var(--r); display:flex; align-items:center; justify-content:center; font-size:6px; color:white; font-weight:700;">
              ${scamPct > 15 ? `${scamPct}%` : ''}
            </div>
            <div style="width:${safePct}%; height:100%; background:var(--g); display:flex; align-items:center; justify-content:center; font-size:6px; color:white; font-weight:700;">
              ${safePct > 15 ? `${safePct}%` : ''}
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:7px; font-family:var(--mono);">
            <span style="color:var(--r)">⚠️ Es Estafa / Scam (${res.scamVotes})</span>
            <span style="color:var(--g)">💎 Es Seguro / Bullish (${res.safeVotes})</span>
          </div>
        </div>

        <div style="margin-top:6px;">
          <div style="font-size:7px;font-family:var(--mono);color:var(--t2);text-transform:uppercase;margin-bottom:4px;font-weight:700;">🔍 Factores de Riesgo / Contrato:</div>
          ${flagsHtml}
        </div>

        <div style="font-size:7px; font-family:var(--mono); color:#1da1f2; margin-top:8px; padding-top:6px; border-top:1px dashed rgba(255,255,255,0.05); display:flex; align-items:center;">
          <span style="margin-right:4px;">📈</span> Análisis certificado por auditor en X: <b style="margin-left:2px;color:var(--t)">@badattrading_</b>
        </div>

        <div style="margin-top:10px;border-top:1px dashed rgba(255,255,255,0.08);padding-top:8px;">
          <div style="font-size:7px;font-family:var(--mono);color:var(--t2);text-transform:uppercase;margin-bottom:4px;font-weight:700;display:flex;justify-content:space-between;">
            <span>💬 Menciones Destacadas en X:</span>
            <a href="https://x.com/search?q=${symbol}+scam+OR+rug" target="_blank" style="color:#1da1f2;text-decoration:none;">Ver Todo ↗</a>
          </div>
          ${tweetsHtml}
        </div>
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--bdr);border-radius:5px;padding:8px 10px;margin-top:6px;text-align:center;font-size:8px;color:var(--r);font-family:var(--mono);">
        ⚠️ Falló el auto-escaneo de X: ${err.message}
      </div>
    `;
  }
}
