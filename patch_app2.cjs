const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /const extractUpiId = \(item: any\): string => \{[\s\S]*?return parseUpiValue\(item\.upiId\).*?;[\s\S]*?\};/;
const replacement = `const extractUpiId = (item: any, user?: AppUser | null): string => {
      if (!item) return '';

      const checkList = [
        item.upiId, item.upi_id, item.upi, item.vpa,
        item.userUpi, item.user_upi, item.userUpiId, item.user_upi_id,
        item.senderUpi, item.sender_upi, item.payeeUpi,
        item.paymentDetails, item.payment_details,
        item.payoutUpi, item.payout_upi, item.payoutAddress, item.payout_address,
        item.upiAddress, item.upi_address
      ];

      let result = '';
      for (const val of checkList) {
        const parsed = parseUpiValue(val);
        if (parsed) {
            if (/^\\d{11,}$/.test(parsed)) continue;
            result = parsed;
            break;
        }
      }

      if (!result) {
        const candidates = [item.referenceId, item.reference_id, item.notes, item.remarks, item.description, item.adminNotes];
        for (const cand of candidates) {
          if (typeof cand === 'string' && cand.includes('@') && !cand.includes(' ')) {
            result = cand.trim();
            break;
          }
        }
      }

      if (!result && user) {
        const u = user as any;
        const userCheckList = [
            u.upiId, u.upi_id, u.upi, u.vpa, u.upiAddress, u.paytmNumber, u.paytm, u.phone
        ];
        for (const val of userCheckList) {
            const parsed = parseUpiValue(val);
            if (parsed) {
                if (/^\\d{11,}$/.test(parsed)) continue;
                result = parsed;
                break;
            }
        }
      }

      return result;
    };`;

code = code.replace(regex, replacement);

const regex2 = /const upiId = extractUpiId\(item\);/g;
const replacement2 = `const upiId = extractUpiId(item, matchingUser);`;
code = code.replace(regex2, replacement2);

fs.writeFileSync('src/App.tsx', code);
