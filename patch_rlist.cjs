const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

const replacement = `    <div style="margin-top:6px">
      <div class="pb"><div class="pbf" id="pbf"></div></div>
      <div class="stxt" id="stxt"></div>
    </div>
  </div>
  
  <!-- Lista de resultados (flex:1 para usar el resto del espacio) -->
  <div class="rlist" id="rlist"></div>
</div>`;

content = content.replace(/    <div style="margin-top:6px">\n      <div class="pb"><div class="pbf" id="pbf"><\/div><\/div>\n      <div class="stxt" id="stxt"><\/div>\n    <\/div>\n  <\/div>\n<\/div>/, replacement);

fs.writeFileSync('index.html', content);
