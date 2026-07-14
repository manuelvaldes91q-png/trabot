const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const targetStr = `                  const res = await myFetch('/api/token/audit/' + p.baseToken.address);
                  if (res.ok) {
                    const data = await res.json();
                    if (data.available) {
                      const rugProb = parseFloat(data.rugProb) || 0;
                      // Criterios estrictos de seguridad
                      if (rugProb < 20 && data.top10 < 30 && data.dev < 10 && data.noMint && data.noBlacklist && data.lpBurned > 80 && data.insiders === '0%' && data.phishing === '0%') {
                        return p;
                      }
                    }
                  }`;

const newStr = `                  const res = await myFetch('/api/token-safety/' + p.baseToken.address);
                  if (res.ok) {
                    const safety = await res.json();
                    if (safety && safety.safe) {
                      // También comprobar el auditor (rugcheck base)
                      const auditRes = await myFetch('/api/token/audit/' + p.baseToken.address);
                      if (auditRes.ok) {
                        const data = await auditRes.json();
                        if (data.available) {
                          const rugProb = parseFloat(data.rugProb) || 0;
                          if (rugProb < 20 && data.top10 < 30 && data.dev < 10 && data.noMint && data.noBlacklist && data.lpBurned > 80 && data.insiders === '0%' && data.phishing === '0%') {
                            return p;
                          }
                        }
                      }
                    }
                  }`;
content = content.replace(targetStr, newStr);
fs.writeFileSync('index.html', content);
