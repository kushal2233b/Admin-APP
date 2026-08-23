const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /const parseUpiValue = \(val: any\): string => \{[\s\S]*?return '';\n      \}\n\n      if \(typeof val === 'object'\) \{/;
const replacement = `const parseUpiValue = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'string' || typeof val === 'number') {
        const trimmed = String(val).trim();
        if (
          trimmed &&
          trimmed !== '[object Object]' &&
          trimmed.toLowerCase() !== 'undefined' &&
          trimmed.toLowerCase() !== 'null' &&
          trimmed.toLowerCase() !== 'n/a'
        ) {
          if (/^\\d{11,}$/.test(trimmed)) return ''; // Skip large numerics (bank accounts) early
          return trimmed;
        }
        return '';
      }

      if (typeof val === 'object') {`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/App.tsx', code);
