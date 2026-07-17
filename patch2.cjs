const fs = require('fs');
let server = fs.readFileSync('server.js', 'utf8');

const target = `async function getTokenBalance(connection, ownerPubKey, tokenMintStr) {`;

const replacement = `async function getTokenUiBalance(connection, ownerPubKey, tokenMintStr) {
  try {
    const owner = new PublicKey(ownerPubKey);
    if (tokenMintStr === 'So11111111111111111111111111111111111111112') {
      const nativeBal = await connection.getBalance(owner);
      let wsolBalRaw = 0;
      try {
        const mint = new PublicKey(tokenMintStr);
        const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
        if (accounts && accounts.value && accounts.value.length) {
          wsolBalRaw = Number(accounts.value[0].account.data.parsed.info.tokenAmount.amount);
        }
      } catch (e) {}
      return (nativeBal + wsolBalRaw) / 1e9;
    }
    const mint = new PublicKey(tokenMintStr);
    const accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint });
    if (accounts && accounts.value && accounts.value.length) {
      return accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
    }
    return 0;
  } catch (e) {
    return 0;
  }
}

async function getTokenBalance(connection, ownerPubKey, tokenMintStr) {`;

server = server.replace(target, replacement);
fs.writeFileSync('server.js', server);
