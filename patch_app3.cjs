const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /const checkList = \[[\s\S]*?item\.upiAddress, item\.upi_address\n      \];/;
const replacement = `const checkList = [
        item.upiId, item.upi_id, item.upi, item.vpa,
        item.userUpi, item.user_upi, item.userUpiId, item.user_upi_id,
        item.senderUpi, item.sender_upi, item.payeeUpi,
        item.paymentDetails, item.payment_details,
        item.payoutUpi, item.payout_upi, item.payoutAddress, item.payout_address,
        item.upiAddress, item.upi_address,
        item.details, item.bankDetails, item.bank_details,
        item.paytmNumber, item.paytm_number, item.paytm,
        item.phonepe, item.gpay,
        item.paymentAddress, item.payment_address
      ];`;

code = code.replace(regex, replacement);
fs.writeFileSync('src/App.tsx', code);
