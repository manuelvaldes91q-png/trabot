const fs = require('fs');
let content = fs.readFileSync('server.js', 'utf8');

const targetContent = `app.get('/api/mexc/*', async (req, res) => {
  try {
    const endpoint = req.params[0];
    const qs = new URLSearchParams(req.query).toString();
    const url = \`https://api.mexc.com/api/v3/\${endpoint}\${qs ? '?' + qs : ''}\`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return res.status(r.status).json({error: \`MEXC err: \${r.statusText}\`});
    const data = await r.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});`;

// Remove from old location
if (content.includes(targetContent)) {
    content = content.replace(targetContent, '');
    
    // Insert before ADMIN MIDDLEWARE
    const adminMarker = `// ============================================\n// ADMIN MIDDLEWARE`;
    content = content.replace(adminMarker, targetContent + '\n\n' + adminMarker);
    fs.writeFileSync('server.js', content);
    console.log('Moved MEXC proxy successfully');
} else {
    console.log('Could not find MEXC proxy block to move');
}

