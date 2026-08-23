const fs = require('fs');
let code = fs.readFileSync('src/components/wallet/DepositsView.tsx', 'utf8');

code = code.replace(/placeholder="Search by Username, UTR, or User ID..."/g, 'placeholder="Search by Username, UPI ID, or User ID..."');

code = code.replace(/<span className="text-purple-400">•<\/span>\s*<span>UTR: <code className="text-amber-300 font-mono font-bold bg-purple-950 px-1\.5 py-0\.5 rounded">\{tx\.referenceId\}<\/code><\/span>/g, '');

code = code.replace(/<span>UPI: <strong className="text-white">\{tx\.upiId\}<\/strong><\/span>/g, '<span>Sender UPI: <code className="text-amber-300 font-mono font-bold bg-purple-950 px-1.5 py-0.5 rounded">{tx.upiId}</code></span>');

code = code.replace(/placeholder=\{notesModalTx\.action === 'approve' \? 'e\.g\. UTR verified on bank statement' : 'e\.g\. Invalid UTR \/ Payment not received'\}/g, "placeholder={notesModalTx.action === 'approve' ? 'e.g. Payment verified' : 'e.g. Payment not received / Invalid proof'}");

fs.writeFileSync('src/components/wallet/DepositsView.tsx', code);
