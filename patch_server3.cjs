const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

// Step 1: Add to @solana/spl-token
content = content.replace(
  "import { getAssociatedTokenAddress, createTransferInstruction, getAccount, createCloseAccountInstruction, createAssociatedTokenAccountInstruction, getMint } from '@solana/spl-token';",
  "import { getAssociatedTokenAddress, createTransferInstruction, getAccount, createCloseAccountInstruction, createAssociatedTokenAccountInstruction, getMint, TOKEN_2022_PROGRAM_ID, getExtensionTypes, ExtensionType } from '@solana/spl-token';"
);

// Step 2: Add deserializeMetadata after bs58
const step2Code = `
const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUERdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

function deserializeMetadata(accountInfo) {
  const buf = accountInfo.data;
  let offset = 1 + 32 + 32;
  function readString() {
    const len = buf.readUInt32LE(offset);
    offset += 4;
    const str = buf.slice(offset, offset + len).toString('utf8').replace(/\\0/g, '').trim();
    offset += len;
    return str;
  }
  const name = readString();
  const symbol = readString();
  const uri = readString();
  offset += 2;
  const hasCreators = buf.readUInt8(offset);
  offset += 1;
  if (hasCreators === 1) {
    const creatorsLen = buf.readUInt32LE(offset);
    offset += 4;
    offset += creatorsLen * 34;
  }
  offset += 1;
  const isMutable = buf.readUInt8(offset) === 1;
  return { name, symbol, uri, isMutable };
}
`;
content = content.replace("import bs58 from 'bs58';", "import bs58 from 'bs58';\n" + step2Code);

// Step 3: Add new check functions before checkTokenSafety
const step3Code = `
async function checkToken2022Extensions(tokenMint) {
  const result = { isToken2022: false, dangerousExtensions: [], warning: null };
  const rpcs = [appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL, 'https://solana.drpc.org', 'https://solana-rpc.publicnode.com', 'https://rpc.ankr.com/solana'].filter(Boolean);
  for (const rpc of rpcs) {
    try {
      const connection = new Connection(rpc, 'confirmed');
      const mintPubkey = new PublicKey(tokenMint);
      const accountInfo = await connection.getAccountInfo(mintPubkey);
      if (!accountInfo) return result;
      const isToken2022 = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
      result.isToken2022 = isToken2022;
      if (!isToken2022) return result;
      const mintInfo = await getMint(connection, mintPubkey, 'confirmed', TOKEN_2022_PROGRAM_ID);
      const extensionTypes = getExtensionTypes(mintInfo.tlvData);
      const dangerous = [];
      if (extensionTypes.includes(ExtensionType.PermanentDelegate)) dangerous.push('PermanentDelegate: el creador puede mover/quitar tus tokens sin tu permiso.');
      if (extensionTypes.includes(ExtensionType.TransferFeeConfig)) dangerous.push('TransferFeeConfig: cada transferencia tiene un "impuesto" que el creador puede cambiar.');
      if (extensionTypes.includes(ExtensionType.TransferHook)) dangerous.push('TransferHook: lógica personalizada en cada transferencia — puede bloquear ventas selectivamente.');
      result.dangerousExtensions = dangerous;
      if (dangerous.length > 0) result.warning = \`⚠️ Token-2022 con extensión(es) peligrosa(s): \${dangerous.join(' | ')}\`;
      return result;
    } catch (e) { console.warn(\`[checkToken2022Extensions] Falló con \${rpc}: \${e.message}\`); }
  }
  return result;
}

async function checkLpLockStatus(tokenMint) {
  const result = { checked: false, lpLockedPct: null, warning: null };
  try {
    const res = await fetchWithRetry(\`https://api.rugcheck.xyz/v1/tokens/\${tokenMint}/report\`, { timeout: 8000 }, 2, 1000);
    if (!res || !res.ok) return result;
    const data = await res.json();
    if (data.markets && data.markets.length > 0) {
      const market = data.markets[0];
      const lpLockedPct = market.lpLockedPct ?? (market.lp ? market.lp.lpLockedPct : null);
      if (lpLockedPct !== null && lpLockedPct !== undefined) {
        result.checked = true;
        result.lpLockedPct = lpLockedPct;
        if (lpLockedPct < 50) result.warning = \`⚠️ Solo \${lpLockedPct}% de la liquidez está bloqueada/quemada — el creador podría retirar el resto en cualquier momento.\`;
      }
    }
  } catch (e) { console.warn(\`[checkLpLockStatus] Error: \${e.message}\`); }
  return result;
}

async function checkMetadataMutability(tokenMint) {
  const result = { checked: false, isMutable: null, warning: null };
  const rpcs = [appConfig.solanaRpcUrl || process.env.SOLANA_RPC_URL, 'https://solana.drpc.org', 'https://solana-rpc.publicnode.com'].filter(Boolean);
  for (const rpc of rpcs) {
    try {
      const connection = new Connection(rpc, 'confirmed');
      const mintPubkey = new PublicKey(tokenMint);
      const [metadataPda] = PublicKey.findProgramAddressSync([Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()], TOKEN_METADATA_PROGRAM_ID);
      const accountInfo = await connection.getAccountInfo(metadataPda);
      if (!accountInfo) return result;
      const metadata = deserializeMetadata(accountInfo);
      result.checked = true;
      result.isMutable = metadata.isMutable;
      if (metadata.isMutable) result.warning = \`⚠️ La metadata (nombre/símbolo/imagen) del token es MUTABLE — el creador podría cambiar su identidad después.\`;
      return result;
    } catch (e) { console.warn(\`[checkMetadataMutability] Falló con \${rpc}: \${e.message}\`); }
  }
  return result;
}
`;
content = content.replace("async function checkTokenSafety(tokenMint) {", step3Code + "\nasync function checkTokenSafety(tokenMint) {");

// Step 4: Inside checkTokenSafety
const step4Code = `
  try {
    const t2022 = await checkToken2022Extensions(tokenMint);
    result.details.token2022 = t2022;
    if (t2022.warning) { result.safe = false; result.warnings.push(t2022.warning); }
  } catch (e) { result.warnings.push(\`No se pudo revisar extensiones Token-2022: \${e.message}\`); }

  try {
    const lpLock = await checkLpLockStatus(tokenMint);
    result.details.lpLock = lpLock;
    if (lpLock.warning) { result.safe = false; result.warnings.push(lpLock.warning); }
  } catch (e) { result.warnings.push(\`No se pudo revisar bloqueo de liquidez: \${e.message}\`); }

  try {
    const metaCheck = await checkMetadataMutability(tokenMint);
    result.details.metadata = metaCheck;
    if (metaCheck.warning) result.warnings.push(metaCheck.warning);
  } catch (e) { result.warnings.push(\`No se pudo revisar metadata: \${e.message}\`); }
`;
// Replace the LAST "return result;" inside checkTokenSafety.
content = content.replace(/  return result;\n}\nasync function ensureGasFunding/, step4Code + "\n  return result;\n}\nasync function ensureGasFunding");

fs.writeFileSync('server.js', content);
