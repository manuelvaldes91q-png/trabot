const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const targetStr = `    const rpcs = getRpcEndpoints();
    let connection = null;
    for (const rpc of rpcs) {
      try {
        connection = new Connection(rpc, { commitment: 'confirmed', disableRetryOnRateLimit: true });
        await connection.getSlot(); // Test connection
        break;
      } catch (e) {
        connection = null;
      }
    }
    if (!connection) {
      console.error("All RPCs failed for updateSolanaWalletInfo.");
      return;
    }

    for (let w of watchItems) {
      if (w.network === 'solana' && w.address) {
        try {
          // Prevent hitting strict RPC rate limits on bulk balance checks
          await new Promise(r => setTimeout(r, 600));
          const bal = await getTokenUiBalance(connection, solanaWalletAddress, w.address);
          w.onChainBalance = bal;
        } catch (e) {
          if (!e.message.includes('429') && !e.message.includes('rate limit')) {
             console.error(\`Error fetching balance for \${w.symbol}:\`, e.message);
          }
        }
      }
    }

    const solLamports = await connection.getBalance(keypair.publicKey);
    solanaSolBalance = solLamports / 1e9;
    
    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const usdcBalRaw = await getTokenBalance(connection, solanaWalletAddress, usdcMint);
    solanaUsdcBalance = usdcBalRaw / 1e6;
    const usdtMint = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
    const usdtBalRaw = await getTokenBalance(connection, solanaWalletAddress, usdtMint);
    solanaUsdtBalance = usdtBalRaw / 1e6;`;

const replaceStr = `    // Update custom tokens
    for (let w of watchItems) {
      if (w.network === 'solana' && w.address) {
        try {
          await new Promise(r => setTimeout(r, 600));
          const bal = await withRpcFallback(c => getTokenUiBalance(c, solanaWalletAddress, w.address));
          w.onChainBalance = bal;
        } catch (e) {
          console.error(\`Error fetching balance for \${w.symbol}:\`, e.message);
        }
      }
    }

    // Update main balances using fallback wrapper
    const solLamports = await withRpcFallback(c => c.getBalance(keypair.publicKey));
    solanaSolBalance = solLamports / 1e9;
    
    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const usdcBalRaw = await withRpcFallback(c => getTokenBalance(c, solanaWalletAddress, usdcMint));
    solanaUsdcBalance = usdcBalRaw / 1e6;
    
    const usdtMint = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
    const usdtBalRaw = await withRpcFallback(c => getTokenBalance(c, solanaWalletAddress, usdtMint));
    solanaUsdtBalance = usdtBalRaw / 1e6;`;

code = code.replace(targetStr, replaceStr);

fs.writeFileSync('server.js', code);
console.log('Patched updateSolanaWalletInfo to use withRpcFallback');
