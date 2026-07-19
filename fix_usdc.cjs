const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const updatedCalc = `
            let priceInSol = 0;
            const quoteIsSol = decoded.quoteMint.toString().toLowerCase() === 'so11111111111111111111111111111111111111112';
            const baseIsSol = decoded.baseMint.toString().toLowerCase() === 'so11111111111111111111111111111111111111112';
            const quoteIsUsdc = decoded.quoteMint.toString() === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
            const baseIsUsdc = decoded.baseMint.toString() === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

            let priceInBaseCurrency = 0;
            let finalPrice = 0;

            if (isBaseSol) {
                // quote is token, base is SOL
                priceInBaseCurrency = (baseBalance / Math.pow(10, baseDecimals)) / (quoteBalance / Math.pow(10, quoteDecimals));
                const solPrice = solanaPricesCache['So11111111111111111111111111111111111111112']?.price || 140;
                finalPrice = priceInBaseCurrency * solPrice;
            } else if (quoteIsSol) {
                // base is token, quote is SOL
                priceInBaseCurrency = (quoteBalance / Math.pow(10, quoteDecimals)) / (baseBalance / Math.pow(10, baseDecimals));
                const solPrice = solanaPricesCache['So11111111111111111111111111111111111111112']?.price || 140;
                finalPrice = priceInBaseCurrency * solPrice;
            } else if (quoteIsUsdc) {
                finalPrice = (quoteBalance / Math.pow(10, quoteDecimals)) / (baseBalance / Math.pow(10, baseDecimals));
            } else if (baseIsUsdc) {
                finalPrice = (baseBalance / Math.pow(10, baseDecimals)) / (quoteBalance / Math.pow(10, quoteDecimals));
            } else {
                // Unknown pair, maybe SOL?
                priceInBaseCurrency = (quoteBalance / Math.pow(10, quoteDecimals)) / (baseBalance / Math.pow(10, baseDecimals));
                const solPrice = solanaPricesCache['So11111111111111111111111111111111111111112']?.price || 140;
                finalPrice = priceInBaseCurrency * solPrice;
            }
`;

content = content.replace(
    /let priceInSol = 0;[\s\S]*?const finalPrice = priceInSol \* solPrice;/,
    updatedCalc.trim()
);

fs.writeFileSync('server.js', content);
