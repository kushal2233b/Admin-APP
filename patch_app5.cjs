const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /^\s*\/\/\s*Check if it's just a bank account number.*?continue;/gm;
code = code.replace(regex, "");

fs.writeFileSync('src/App.tsx', code);
