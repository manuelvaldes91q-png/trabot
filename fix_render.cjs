const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const targetStr = `  const now=Date.now();
  
  let data=scanResults.filter(d => {
    const ageDays = (now - (d.pairCreatedAt||0)) / (24*60*60*1000);
    return ageDays >= minAge && (d.marketCap||0) >= minCap;
  });`;

const newStr = `  const now=Date.now();
  
  let data=scanResults.filter(d => {
    // Si no tiene pairCreatedAt, asumimos que pasa el filtro (MEXC tokens) o si es muy viejo.
    const ageDays = d.pairCreatedAt ? (now - d.pairCreatedAt) / (24*60*60*1000) : 999999;
    const mc = d.marketCap !== undefined ? d.marketCap : 999999999999;
    return ageDays >= minAge && mc >= minCap;
  });`;

content = content.replace(targetStr, newStr);

content = content.replace(
  "liq,",
  "liq, marketCap: p.marketCap || p.fdv || 0, pairCreatedAt: p.pairCreatedAt || 0,"
);

fs.writeFileSync('index.html', content);
