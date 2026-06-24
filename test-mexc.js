const fs = require('fs');
fetch('https://api.mexc.com/api/v3/ticker/price')
  .then(r => r.json())
  .then(d => console.log(Array.isArray(d) ? d.slice(0,2) : d))
  .catch(console.error);
