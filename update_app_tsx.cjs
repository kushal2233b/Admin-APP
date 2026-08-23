const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

code = code.replace(
  "const unsubCategories = subscribeCollection<MatchCategory>('categories', (items) => {",
  "const unsubCategories = subscribeCollection<MatchCategory>('match_categories', (items) => {"
);

fs.writeFileSync('src/App.tsx', code);
