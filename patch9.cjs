const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

code = code.replace(
  '<option value="all" ${epRole === \'all\' ? \'selected\' : \'\'}>Todas (Críticas y Secundarias)</option>',
  '<option value="all" ${epRole === \'all\' ? \'selected\' : \'\'}>Ambos (Swaps y Cotizaciones)</option>'
);

code = code.replace(
  '<option value="critical" ${epRole === \'critical\' ? \'selected\' : \'\'}>Solo Críticas (Swaps, Transfers)</option>',
  '<option value="critical" ${epRole === \'critical\' ? \'selected\' : \'\'}>Solo Swaps (Críticos)</option>'
);

code = code.replace(
  '<option value="monitoring" ${epRole === \'monitoring\' ? \'selected\' : \'\'}>Solo Secundarias (Cotizaciones)</option>',
  '<option value="monitoring" ${epRole === \'monitoring\' ? \'selected\' : \'\'}>Solo Cotizaciones (Monitoreo)</option>'
);

fs.writeFileSync('index.html', code);
