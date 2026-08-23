const fs = require('fs');

let code = fs.readFileSync('src/services/firestoreService.ts', 'utf8');

const approveRegex = /export async function approveTransactionInFirestore[\s\S]*?\n\s*\}\n\s*\n/m;
// Let's replace the whole block manually by matching start and end

const startIndex = code.indexOf('export async function approveTransactionInFirestore');
const endIndex = code.indexOf('export async function createTransactionInFirestore');
if(startIndex === -1 || endIndex === -1) throw new Error("Could not find boundaries");

let replacement = `export async function approveTransactionInFirestore(tx: WalletTransaction, adminNotes?: string): Promise<void> {
  if (!db) return;
  await executeAuditedFirestoreWrite({
    collectionName: 'transactions',
    docId: tx.id,
    operationType: OperationType.UPDATE,
    action: async () => {
      await runTransaction(db, async (transaction) => {
        const txRef = doc(db!, 'transactions', tx.id);
        const withdrawalsRef = doc(db!, 'withdrawals', tx.id);
        const userWithdrawalsRef = doc(db!, 'user_withdrawals', tx.id);
        const userRef = doc(db!, 'users', tx.userId);
        const walletRef = doc(db!, 'wallets', tx.userId);
        const depositsRef = doc(db!, 'deposits', tx.id);
        const depRequestsRef = doc(db!, 'deposit_requests', tx.id);
        const depRequestsCamelRef = doc(db!, 'depositRequests', tx.id);
        const userDepositsRef = doc(db!, 'user_deposits', tx.id);
        const walletTxRef = doc(db!, 'wallet_transactions', tx.id);
        const paymentReqRef = doc(db!, 'payment_requests', tx.id);
        const rechargesRef = doc(db!, 'recharges', tx.id);
        const withdrawRequestsRef = doc(db!, 'withdraw_requests', tx.id);
        const withdrawRequestsCamelRef = doc(db!, 'withdrawRequests', tx.id);

        const refKey = String(
          tx.type === 'deposit'
            ? (tx.referenceId || tx.id)
            : (tx.withdrawalRequestId || tx.referenceId || tx.id)
        ).trim();

        const ledgerRef = doc(db!, 'wallet_ledger', refKey);

        // --- ALL READS FIRST ---
        const userDoc = await transaction.get(userRef);
        const txDoc = await transaction.get(txRef);
        const withdrawalDoc = await transaction.get(withdrawalsRef);
        const ledgerDoc = await transaction.get(ledgerRef);

        let userWithdrawalDoc, depositsDoc, depRequestsDoc, depRequestsCamelDoc, userDepositsDoc, walletTxDoc, paymentReqDoc, rechargesDoc, withdrawRequestsDoc, withdrawRequestsCamelDoc;
        try { userWithdrawalDoc = await transaction.get(userWithdrawalsRef); } catch (e) {}
        try { depositsDoc = await transaction.get(depositsRef); } catch (e) {}
        try { depRequestsDoc = await transaction.get(depRequestsRef); } catch (e) {}
        try { depRequestsCamelDoc = await transaction.get(depRequestsCamelRef); } catch (e) {}
        try { userDepositsDoc = await transaction.get(userDepositsRef); } catch (e) {}
        try { walletTxDoc = await transaction.get(walletTxRef); } catch (e) {}
        try { paymentReqDoc = await transaction.get(paymentReqRef); } catch (e) {}
        try { rechargesDoc = await transaction.get(rechargesRef); } catch (e) {}
        try { withdrawRequestsDoc = await transaction.get(withdrawRequestsRef); } catch (e) {}
        try { withdrawRequestsCamelDoc = await transaction.get(withdrawRequestsCamelRef); } catch (e) {}

        const existingTxData = txDoc.exists() ? txDoc.data() : (withdrawalDoc.exists() ? withdrawalDoc.data() : null);
        const bankUtr = (adminNotes && adminNotes.trim() !== 'Approved by WinX7 Admin' && adminNotes.trim() !== 'Approved by Admin')
          ? adminNotes.trim()
          : (tx.utr || '');

        const now = new Date().toISOString();
        const extraUpdate = cleanUndefined({
          status: 'approved',
          utr: bankUtr || undefined,
          payoutReference: bankUtr || undefined,
          adminNotes: adminNotes || 'Approved by Admin',
          processedAt: now,
          approvedAt: now,
          isCredited: true
        });

        // --- IDEMPOTENCY & DUPLICATE CREDIT GUARD ---
        const isLedgerApproved = ledgerDoc.exists() && (
          ledgerDoc.data().status === 'approved' ||
          ledgerDoc.data().status === 'processed' ||
          ledgerDoc.data().isCredited === true
        );
        const isTxApproved = txDoc.exists() && (
          txDoc.data().status === 'approved' ||
          txDoc.data().status === 'paid' ||
          txDoc.data().isCredited === true
        );
        const isWithdrawalApproved = withdrawalDoc.exists() && withdrawalDoc.data().status === 'approved';
        const isDepositApproved = depositsDoc && depositsDoc.exists() && (
          depositsDoc.data().status === 'approved' || depositsDoc.data().isCredited === true
        );
        const isDepReqApproved = depRequestsDoc && depRequestsDoc.exists() && depRequestsDoc.data().status === 'approved';

        if (isLedgerApproved || isTxApproved || isWithdrawalApproved || isDepositApproved || isDepReqApproved) {
          console.warn(\`[Wallet Ledger Guard] Transaction/Ref '\${refKey}' (id: \${tx.id}) is already approved/credited.\`);
          // Sync statuses
          if (withdrawalDoc && withdrawalDoc.exists()) transaction.update(withdrawalsRef, extraUpdate);
          if (userWithdrawalDoc && userWithdrawalDoc.exists()) transaction.update(userWithdrawalsRef, extraUpdate);
          if (withdrawRequestsDoc && withdrawRequestsDoc.exists()) transaction.update(withdrawRequestsRef, extraUpdate);
          if (withdrawRequestsCamelDoc && withdrawRequestsCamelDoc.exists()) transaction.update(withdrawRequestsCamelRef, extraUpdate);
          if (depositsDoc && depositsDoc.exists()) transaction.update(depositsRef, extraUpdate);
          if (depRequestsDoc && depRequestsDoc.exists()) transaction.update(depRequestsRef, extraUpdate);
          if (depRequestsCamelDoc && depRequestsCamelDoc.exists()) transaction.update(depRequestsCamelRef, extraUpdate);
          if (userDepositsDoc && userDepositsDoc.exists()) transaction.update(userDepositsRef, extraUpdate);
          if (walletTxDoc && walletTxDoc.exists()) transaction.update(walletTxRef, extraUpdate);
          if (paymentReqDoc && paymentReqDoc.exists()) transaction.update(paymentReqRef, extraUpdate);
          if (rechargesDoc && rechargesDoc.exists()) transaction.update(rechargesRef, extraUpdate);
          if (txDoc.exists()) transaction.update(txRef, extraUpdate);
          return;
        }

        const currentBalance = userDoc.exists() ? Number(userDoc.data().walletBalance || userDoc.data().balance || 0) : 0;
        let updatedBalance = currentBalance;

        if (tx.type === 'deposit') {
          updatedBalance = currentBalance + tx.amount;
        } else if (tx.type === 'withdrawal') {
          const wasAlreadyDeducted = existingTxData?.isDeducted !== false;
          if (!wasAlreadyDeducted) {
            updatedBalance = Math.max(0, currentBalance - tx.amount);
          }
        }

        const txPayload = cleanUndefined({
          ...tx,
          status: 'approved',
          utr: bankUtr || undefined,
          payoutReference: bankUtr || undefined,
          adminNotes: adminNotes || 'Approved by Admin',
          userWalletBalanceAfter: updatedBalance,
          processedAt: now,
          approvedAt: now,
          isCredited: true,
          isDeducted: tx.type === 'withdrawal' ? true : undefined
        });

        transaction.set(ledgerRef, cleanUndefined({
          id: refKey,
          transactionId: tx.id,
          referenceId: refKey,
          depositId: tx.type === 'deposit' ? refKey : undefined,
          withdrawalId: tx.type === 'withdrawal' ? refKey : undefined,
          userId: tx.userId,
          username: tx.username || 'Player',
          amount: tx.amount,
          type: tx.type,
          status: 'approved',
          isCredited: tx.type === 'deposit',
          isDeducted: tx.type === 'withdrawal' ? true : undefined,
          processedAt: now,
          createdAt: tx.createdAt || now,
          processedBy: 'Admin',
          adminNotes: adminNotes || 'Approved by Admin'
        }), { merge: true });

        if (txDoc.exists()) {
          transaction.update(txRef, txPayload);
        } else {
          transaction.set(txRef, txPayload);
        }

        if (userDoc.exists() && updatedBalance !== currentBalance) {
          const userUpdates = cleanUndefined({
            walletBalance: updatedBalance,
            wallet_balance: updatedBalance,
            balance: updatedBalance,
            mainBalance: updatedBalance,
            main_balance: updatedBalance,
            updatedAt: now
          });
          transaction.update(userRef, userUpdates);
          if (walletRef) {
            transaction.set(walletRef, {
              id: tx.userId,
              userId: tx.userId,
              balance: updatedBalance,
              walletBalance: updatedBalance,
              updatedAt: now
            }, { merge: true });
          }
        }

        if (withdrawalDoc && withdrawalDoc.exists()) transaction.update(withdrawalsRef, extraUpdate);
        if (userWithdrawalDoc && userWithdrawalDoc.exists()) transaction.update(userWithdrawalsRef, extraUpdate);
        if (withdrawRequestsDoc && withdrawRequestsDoc.exists()) transaction.update(withdrawRequestsRef, extraUpdate);
        if (withdrawRequestsCamelDoc && withdrawRequestsCamelDoc.exists()) transaction.update(withdrawRequestsCamelRef, extraUpdate);
        if (depositsDoc && depositsDoc.exists()) transaction.update(depositsRef, extraUpdate);
        if (depRequestsDoc && depRequestsDoc.exists()) transaction.update(depRequestsRef, extraUpdate);
        if (depRequestsCamelDoc && depRequestsCamelDoc.exists()) transaction.update(depRequestsCamelRef, extraUpdate);
        if (userDepositsDoc && userDepositsDoc.exists()) transaction.update(userDepositsRef, extraUpdate);
        if (walletTxDoc && walletTxDoc.exists()) transaction.update(walletTxRef, extraUpdate);
        if (paymentReqDoc && paymentReqDoc.exists()) transaction.update(paymentReqRef, extraUpdate);
        if (rechargesDoc && rechargesDoc.exists()) transaction.update(rechargesRef, extraUpdate);
      });
    }
  });
}

export async function rejectTransactionInFirestore(txOrId: WalletTransaction | string, adminNotes?: string): Promise<void> {
  if (!db) return;
  const txId = typeof txOrId === 'string' ? txOrId : txOrId.id;

  await executeAuditedFirestoreWrite({
    collectionName: 'transactions',
    docId: txId,
    operationType: OperationType.UPDATE,
    action: async () => {
      await runTransaction(db, async (transaction) => {
        const txRef = doc(db!, 'transactions', txId);
        const withdrawalsRef = doc(db!, 'withdrawals', txId);
        const depositsRef = doc(db!, 'deposits', txId);
        const depRequestsRef = doc(db!, 'deposit_requests', txId);
        const depRequestsCamelRef = doc(db!, 'depositRequests', txId);
        const userDepositsRef = doc(db!, 'user_deposits', txId);
        const walletTxRef = doc(db!, 'wallet_transactions', txId);
        const paymentReqRef = doc(db!, 'payment_requests', txId);
        const rechargesRef = doc(db!, 'recharges', txId);
        const userWithdrawalsRef = doc(db!, 'user_withdrawals', txId);
        const withdrawRequestsRef = doc(db!, 'withdraw_requests', txId);
        const withdrawRequestsCamelRef = doc(db!, 'withdrawRequests', txId);

        const txDoc = await transaction.get(txRef);
        const withdrawalDoc = await transaction.get(withdrawalsRef);
        const txData = txDoc.exists() ? txDoc.data() : (withdrawalDoc.exists() ? withdrawalDoc.data() : null);

        if (!txData && typeof txOrId === 'string') {
          console.warn(\`Transaction doc \${txId} not found in Firestore during rejection.\`);
          return;
        }

        const refKey = String(
          txData?.withdrawalRequestId ||
          txData?.referenceId ||
          (typeof txOrId === 'object' ? (txOrId.withdrawalRequestId || txOrId.referenceId || txOrId.id) : txId)
        ).trim();

        const refundLedgerKey = \`refund_\${refKey}\`;
        const refundLedgerRef = doc(db!, 'wallet_ledger', refundLedgerKey);
        const refundLedgerDoc = await transaction.get(refundLedgerRef);

        const isWithdrawal = (txData?.type === 'withdrawal') || (typeof txOrId === 'object' && txOrId.type === 'withdrawal');
        const userId = txData?.userId || txData?.uid || (typeof txOrId === 'object' ? txOrId.userId : null);
        const amount = Number(txData?.amount || (typeof txOrId === 'object' ? txOrId.amount : 0));

        let userRef = userId ? doc(db!, 'users', userId) : null;
        let walletRef = userId ? doc(db!, 'wallets', userId) : null;
        let userDoc = userRef ? await transaction.get(userRef) : null;

        let depositsDoc, depRequestsDoc, depRequestsCamelDoc, userDepositsDoc, walletTxDoc, paymentReqDoc, rechargesDoc, userWithdrawalsDoc, withdrawRequestsDoc, withdrawRequestsCamelDoc;
        try { depositsDoc = await transaction.get(depositsRef); } catch (e) {}
        try { depRequestsDoc = await transaction.get(depRequestsRef); } catch (e) {}
        try { depRequestsCamelDoc = await transaction.get(depRequestsCamelRef); } catch (e) {}
        try { withdrawRequestsDoc = await transaction.get(withdrawRequestsRef); } catch (e) {}
        try { withdrawRequestsCamelDoc = await transaction.get(withdrawRequestsCamelRef); } catch (e) {}
        try { userDepositsDoc = await transaction.get(userDepositsRef); } catch (e) {}
        try { walletTxDoc = await transaction.get(walletTxRef); } catch (e) {}
        try { paymentReqDoc = await transaction.get(paymentReqRef); } catch (e) {}
        try { rechargesDoc = await transaction.get(rechargesRef); } catch (e) {}
        try { userWithdrawalsDoc = await transaction.get(userWithdrawalsRef); } catch (e) {}

        const now = new Date().toISOString();
        const updateData = cleanUndefined({
          status: 'rejected',
          adminNotes: adminNotes || 'Rejected by Admin',
          rejectionReason: adminNotes || 'Rejected by Admin',
          processedAt: now,
          rejectedAt: now,
          isRefunded: true,
          refundProcessed: true
        });

        // --- IDEMPOTENCY CHECK FOR REJECTION & REFUND ---
        const isRefundAlreadyProcessed = refundLedgerDoc.exists() && (
          refundLedgerDoc.data().status === 'refunded' ||
          refundLedgerDoc.data().isRefunded === true ||
          refundLedgerDoc.data().refundProcessed === true
        );
        const isTxAlreadyRejected = txDoc.exists() && (
          txDoc.data().status === 'rejected' ||
          txDoc.data().isRefunded === true ||
          txDoc.data().refundProcessed === true
        );
        const isWithdrawalAlreadyRejected = withdrawalDoc.exists() && (
          withdrawalDoc.data().status === 'rejected' ||
          withdrawalDoc.data().isRefunded === true ||
          withdrawalDoc.data().refundProcessed === true
        );
        const isWithdrawRequestsRejected = (withdrawRequestsDoc?.exists() && (withdrawRequestsDoc.data().status === 'rejected' || withdrawRequestsDoc.data().refundProcessed === true)) ||
                                           (withdrawRequestsCamelDoc?.exists() && (withdrawRequestsCamelDoc.data().status === 'rejected' || withdrawRequestsCamelDoc.data().refundProcessed === true));

        if (isRefundAlreadyProcessed || isTxAlreadyRejected || isWithdrawalAlreadyRejected || isWithdrawRequestsRejected) {
          console.warn(\`[Refund Ledger Guard] Transaction/Ref '\${refKey}' (id: \${txId}) was already rejected/refunded.\`);
          if (txDoc.exists()) transaction.update(txRef, updateData);
          if (withdrawalDoc.exists()) transaction.update(withdrawalsRef, updateData);
          if (withdrawRequestsDoc && withdrawRequestsDoc.exists()) transaction.update(withdrawRequestsRef, updateData);
          if (withdrawRequestsCamelDoc && withdrawRequestsCamelDoc.exists()) transaction.update(withdrawRequestsCamelRef, updateData);
          if (depositsDoc && depositsDoc.exists()) transaction.update(depositsRef, updateData);
          if (depRequestsDoc && depRequestsDoc.exists()) transaction.update(depRequestsRef, updateData);
          if (depRequestsCamelDoc && depRequestsCamelDoc.exists()) transaction.update(depRequestsCamelRef, updateData);
          if (userDepositsDoc && userDepositsDoc.exists()) transaction.update(userDepositsRef, updateData);
          if (walletTxDoc && walletTxDoc.exists()) transaction.update(walletTxRef, updateData);
          if (paymentReqDoc && paymentReqDoc.exists()) transaction.update(paymentReqRef, updateData);
          if (rechargesDoc && rechargesDoc.exists()) transaction.update(rechargesRef, updateData);
          if (userWithdrawalsDoc && userWithdrawalsDoc.exists()) transaction.update(userWithdrawalsRef, updateData);
          return;
        }

        // --- REFUND WALLET FOR WITHDRAWAL REJECTION ---
        const wasAlreadyDeducted = txData?.isDeducted !== false;
        if (isWithdrawal && wasAlreadyDeducted && userRef && userDoc && userDoc.exists() && amount > 0) {
          const currentBalance = Number(userDoc.data().walletBalance || userDoc.data().balance || 0);
          const refundedBalance = currentBalance + amount;

          const userUpdates = cleanUndefined({
            walletBalance: refundedBalance,
            wallet_balance: refundedBalance,
            balance: refundedBalance,
            mainBalance: refundedBalance,
            main_balance: refundedBalance,
            updatedAt: now
          });
          transaction.update(userRef, userUpdates);

          if (walletRef) {
            transaction.set(walletRef, {
              id: userId,
              userId: userId,
              balance: refundedBalance,
              walletBalance: refundedBalance,
              updatedAt: now
            }, { merge: true });
          }

          transaction.set(refundLedgerRef, cleanUndefined({
            id: refundLedgerKey,
            transactionId: \`refund-\${txId}\`,
            referenceId: refKey,
            withdrawalId: refKey,
            userId: userId,
            amount: amount,
            type: 'refund',
            status: 'refunded',
            isRefunded: true,
            refundProcessed: true,
            processedAt: now,
            createdAt: now,
            processedBy: 'Admin',
            adminNotes: adminNotes || 'Rejected & Refunded by Admin'
          }), { merge: true });
        }

        if (txDoc.exists()) transaction.update(txRef, updateData);
        if (withdrawalDoc.exists()) transaction.update(withdrawalsRef, updateData);
        if (withdrawRequestsDoc && withdrawRequestsDoc.exists()) transaction.update(withdrawRequestsRef, updateData);
        if (withdrawRequestsCamelDoc && withdrawRequestsCamelDoc.exists()) transaction.update(withdrawRequestsCamelRef, updateData);
        if (depositsDoc && depositsDoc.exists()) transaction.update(depositsRef, updateData);
        if (depRequestsDoc && depRequestsDoc.exists()) transaction.update(depRequestsRef, updateData);
        if (depRequestsCamelDoc && depRequestsCamelDoc.exists()) transaction.update(depRequestsCamelRef, updateData);
        if (userDepositsDoc && userDepositsDoc.exists()) transaction.update(userDepositsRef, updateData);
        if (walletTxDoc && walletTxDoc.exists()) transaction.update(walletTxRef, updateData);
        if (paymentReqDoc && paymentReqDoc.exists()) transaction.update(paymentReqRef, updateData);
        if (rechargesDoc && rechargesDoc.exists()) transaction.update(rechargesRef, updateData);
        if (userWithdrawalsDoc && userWithdrawalsDoc.exists()) transaction.update(userWithdrawalsRef, updateData);
      });
    }
  });
}
`;

code = code.substring(0, startIndex) + replacement + code.substring(endIndex);

fs.writeFileSync('src/services/firestoreService.ts', code);
