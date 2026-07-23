const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

code = code.replace(
  'Agrega tus propios nodos RPC personalizados. El sistema los prueba automáticamente al agregarlos y los integra de inmediato en la rotación y failover inteligente.',
  'Agrega tus nodos RPC personalizados y establécelos como prioritarios en el orden deseado. Los nodos de la lista de prioridad se usarán secuencialmente; el resto actuará como failover en rotación.'
);

fs.writeFileSync('index.html', code);
