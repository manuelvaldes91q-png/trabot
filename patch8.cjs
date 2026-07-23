const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

code = code.replace(
  'Agrega tus nodos RPC personalizados (ej. Alchemy, Quicknode, Helius) y establécelos como prioritarios en el orden deseado. Los nodos de la lista de prioridad se usarán secuencialmente; el resto actuará como failover en rotación.',
  'Agrega tus nodos RPC personalizados (ej. Alchemy, Quicknode, Helius) y establécelos como prioritarios en el orden deseado. Los nodos de la lista de prioridad se usarán secuencialmente; el resto actuará como failover en rotación.'
); // Do nothing really, just verify I have no stray things

fs.writeFileSync('index.html', code);
