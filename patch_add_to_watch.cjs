const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

content = content.replace(
    /const note=document\.getElementById\('af_note'\)\?\.value\|\|'';/,
    `const note=document.getElementById('af_note')?.value||'';\n  const expHours=document.getElementById('af_expire')?.value? +document.getElementById('af_expire').value : 0;`
);

content = content.replace(
    /const orders=\[\{level:1,price:p1,amount:amt1,sl:sl_,tp1:tp1_,tp2:tp2_,note,status:'pending',type:'entry'\}\];/,
    `const orders=[{level:1,price:p1,amount:amt1,sl:sl_,tp1:tp1_,tp2:tp2_,note,status:'pending',type:'entry'}];\n  if (expHours > 0) orders[0].expireAt = Date.now() + expHours * 3600000;`
);

fs.writeFileSync('index.html', content);
