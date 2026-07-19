const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

content = content.replace(
    /<input type="number" id="f_liqMin" class="ds-input" placeholder="Min" value="100">/,
    '<input type="number" id="f_liqMin" class="ds-input" placeholder="Min" value="0">'
);
content = content.replace(
    /<input type="number" id="f_mcMin" class="ds-input" placeholder="Min" value="200">/,
    '<input type="number" id="f_mcMin" class="ds-input" placeholder="Min" value="0">'
);
content = content.replace(
    /<input type="number" id="f_mcMax" class="ds-input" placeholder="Max" value="100">/,
    '<input type="number" id="f_mcMax" class="ds-input" placeholder="Max" value="">'
);
content = content.replace(
    /<input type="number" id="f_volMin" class="ds-input" placeholder="Min" value="500">/,
    '<input type="number" id="f_volMin" class="ds-input" placeholder="Min" value="0">'
);
content = content.replace(
    /<input type="checkbox" id="cfSafeOnly" style="margin-right:6px;" checked>/,
    '<input type="checkbox" id="cfSafeOnly" style="margin-right:6px;">'
);

fs.writeFileSync('index.html', content);
