const fs = require('fs');

let content = fs.readFileSync('server.js', 'utf8');

const replacement = `
      // Check if we want Jito
      let txid;
      let signatureBuf;
      if (transaction.signatures && transaction.signatures.length > 0) {
        signatureBuf = transaction.signatures[0];
      } else if (transaction.signatures) {
        signatureBuf = transaction.signatures[0];
      }
      
      // If versioned transaction (Jupiter) the signatures array is Uint8Array[]
      txid = bs58.encode(signatureBuf);

      let bundleUuid = null;
      if (appConfig.useJitoBundle) {
        try {
          bundleUuid = await sendViaJitoBundle(connection, transaction, keypair);
          addLog(\`🚀 Transacción enviada vía Jito Bundle (protección anti-sandwich) para \${w.symbol}... (\${txid.slice(0,8)})\`, 'info');
        } catch (jitoErr) {
          addLog(\`⚠️ Jito bundle falló (\${jitoErr.message}). Enviando por RPC normal como respaldo...\`, 'warn');
          await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 2 });
        }
      } else {
        addLog(\`🚀 Enviando transacción real de Solana para \${w.symbol}... (\${txid.slice(0,8)})\`, 'info');
        await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false, maxRetries: 2 });
      }

      addLog(\`✅ Transacción enviada: \${txid.slice(0, 8)}... Esperando confirmación...\`, 'info');

      // Robust polling for confirmation, works even without knowing the exact lastValidBlockHeight
      let confirmed = false;
      const startTime = Date.now();
      const MAX_WAIT_MS = 60000; // 60 seconds max wait
      
      while (Date.now() - startTime < MAX_WAIT_MS) {
        const statuses = await connection.getSignatureStatuses([txid]);
        const status = statuses && statuses.value && statuses.value[0];
        
        if (status) {
          if (status.err) {
            throw new Error(\`Transacción falló on-chain: \${JSON.stringify(status.err)}\`);
          }
          if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
            confirmed = true;
            break;
          }
        }
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!confirmed) {
        throw new Error(\`Timeout: La transacción \${txid} no se confirmó en \${MAX_WAIT_MS/1000}s. Probablemente expiró.\`);
      }
`;

// Replace from `let txid;` down to `}, 'confirmed');`
content = content.replace(
    /let txid;\s*if \(appConfig\.useJitoBundle\) \{[\s\S]*?\}, 'confirmed'\);/,
    replacement.trim()
);

fs.writeFileSync('server.js', content);
