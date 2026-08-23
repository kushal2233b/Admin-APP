const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /const extractUpiId = \(item: any, user\?: AppUser \| null\): string => \{[\s\S]*?return result;\n    \};/;
const replacement = `const extractUpiId = (item: any): string => {
      if (!item) return '';
      return parseUpiValue(item.upiId) || parseUpiValue(item.upi_id) || parseUpiValue(item.upi) || '';
    };`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/App.tsx', code);
