// Mock test of rotate math
const solBalance = 5000000;
let solToSend = 0;
const usdcAmount = 1000n;
let fee = 5000;
let rentExempt = 2039280;

solToSend = solBalance - fee;
if (usdcAmount > 0n) solToSend -= rentExempt;
console.log(solToSend);
