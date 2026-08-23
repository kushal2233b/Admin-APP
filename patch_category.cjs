const fs = require('fs');
let code = fs.readFileSync('src/services/firestoreService.ts', 'utf8');

code = code.replace(/game_category: catName,\s*category: catName,/g, "game_category: catName,\n    category: t.category || catName,");
code = code.replace(/gameCategory: catName,\s*category: catName,/g, "gameCategory: catName,\n      category: data.category || catName,");

fs.writeFileSync('src/services/firestoreService.ts', code);
