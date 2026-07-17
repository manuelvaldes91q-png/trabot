const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const target = `      const diffRaw = side === 'SELL' ? (baseBalAfter - baseBalBefore) : (baseBalBefore - baseBalAfter);
      let exactAmountUSDT = 0;
      if (isSOL) {
        const solPrice = await mxPrice('SOL') || 140;
        exactAmountUSDT = (diffRaw / 1e9) * solPrice;
      } else {
        exactAmountUSDT = diffRaw / 1e6;
      }`;

const replacement = `      const diffRaw = side === 'SELL' ? (baseBalAfter - baseBalBefore) : (baseBalBefore - baseBalAfter);
      let exactAmountUSDT = 0;
      if (side === 'BUY') {
         // Para compras, usar el monto exacto de entrada (sin contar comisiones de red/renta)
         exactAmountUSDT = isSOL ? (rawAmount / 1e9) * (await mxPrice('SOL') || 140) : (rawAmount / 1e6);
      } else {
         // Para ventas, diffRaw (recibido neto descontando comisiones de gas)
         exactAmountUSDT = isSOL ? (diffRaw / 1e9) * (await mxPrice('SOL') || 140) : (diffRaw / 1e6);
      }`;

server = server.replace(target, replacement);
fs.writeFileSync('server.js', server);
