const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

content = content.replace(
    /const order = \{level:w\.orders\.length\+1,price:\+price,amount:\+\(amt\|\|50\),note:note\|\|'',status:'pending',type:'dca'\};/,
    `const exp=prompt('Expirar en (horas), 0 o vacío=nunca','24');\n  const order = {level:w.orders.length+1,price:+price,amount:+(amt||50),note:note||'',status:'pending',type:'dca'};\n  if (exp && +exp > 0) order.expireAt = Date.now() + (+exp) * 3600000;`
);

fs.writeFileSync('index.html', content);
