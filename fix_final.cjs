const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

// Fix the Chart.js script tag
content = content.replace(
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js">function',
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>\n<script>\nfunction'
);

// Check if initServerState is missing and append it before </script></body></html>
if (!content.includes('initServerState().then(')) {
  const initCode = `
function setSt(txt,pct){const e=document.getElementById('stxt');if(e)e.textContent=txt;if(pct!=null&&document.getElementById('pbf'))document.getElementById('pbf').style.width=pct+'%';}
// INIT
initServerState().then(() => {
  updateDash();
});
if('Notification'in window&&Notification.permission==='granted'){notifOn=true;document.getElementById('btnNotif').textContent='🔔 Notif. ON';document.getElementById('btnNotif').className='btn btn-g btn-sm';}
addLog('DIP HUNTER v6 listo — Escáner + Monitor 10s + Auto-Ejecución + Editor de órdenes (Guarda en Cloud/VPS)','info');
`;
  content = content.replace('</script></body></html>', initCode + '</script></body></html>');
}

fs.writeFileSync('index.html', content);
console.log("Fixed!");
