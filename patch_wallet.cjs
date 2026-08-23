const fs = require('fs');
let code = fs.readFileSync('src/components/wallet/WalletManagement.tsx', 'utf8');

code = code.replace(/placeholder="Search Username, UTR \/ Reference ID, UPI ID..."/g, 'placeholder="Search Username, UPI ID..."');

code = code.replace(/Deposit Ref\/UTR/g, 'Deposit Ref');

code = code.replace(/<p className="text-\[11px\] text-purple-300\/80 font-mono mt-0\.5">\s*Deposit Ref: <span className="text-amber-300 font-semibold">\{tx\.referenceId\}<\/span> • \{tx\.paymentMethod\}\s*<\/p>\s*\{tx\.upiId && \(\s*<p className="text-\[10px\] text-purple-400">Sender UPI: \{tx\.upiId\}<\/p>\s*\)\}/g, `{tx.upiId ? (
                          <p className="text-[11px] text-purple-300/80 font-mono mt-0.5">
                            Sender UPI: <span className="text-amber-300 font-semibold">{tx.upiId}</span> • {tx.paymentMethod}
                          </p>
                        ) : (
                          <p className="text-[11px] text-purple-300/80 font-mono mt-0.5">
                            Deposit Ref: <span className="text-amber-300 font-semibold">{tx.referenceId}</span> • {tx.paymentMethod}
                          </p>
                        )}`);

code = code.replace(/Deposit Ref: \$\{previewTransaction\.referenceId\}/g, "Deposit UPI: ${previewTransaction.upiId || previewTransaction.referenceId}");

code = code.replace(/placeholder="Invalid Bank Account \/ UTR not found on statement..."/g, 'placeholder="Payment not received / Invalid proof..."');

fs.writeFileSync('src/components/wallet/WalletManagement.tsx', code);
