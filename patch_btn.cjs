const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const replacement = `          </select>
        </div>
      </div>
    </div>
    <div style="margin-top: 12px;">
      <button class="btn btn-g btn-sm" id="btnScan" onclick="startScan()" style="width:100%; padding:8px; font-weight:700;">⚡ ESCANEAR SOLANA</button>
    </div>
  </div>`;

content = content.replace(/<\/select>\n\s*<\/div>\n\s*<\/div>\n\s*<\/div>\n\s*<\/div>/, replacement);
fs.writeFileSync('index.html', content);
