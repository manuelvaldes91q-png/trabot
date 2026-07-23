const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const escapeFn = `
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
`;

if (!code.includes('function escapeHtml')) {
  code = code.replace('<script>', '<script>\n' + escapeFn);
}

// Fix sessions rendering
code = code.replace(
  /\$\{s\.userAgent\}/g,
  '${escapeHtml(s.userAgent)}'
);
code = code.replace(
  /\$\{s\.ip\}/g,
  '${escapeHtml(s.ip)}'
);

// Fix failed logins rendering
code = code.replace(
  /\$\{f\.userAgent\}/g,
  '${escapeHtml(f.userAgent)}'
);
code = code.replace(
  /\$\{f\.ip\}/g,
  '${escapeHtml(f.ip)}'
);

fs.writeFileSync('index.html', code);
