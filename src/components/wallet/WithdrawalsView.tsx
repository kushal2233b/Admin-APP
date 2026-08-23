import React, { useState } from 'react';
import { WalletTransaction } from '../../types';
import { ArrowUpRight, CheckCircle2, XCircle, Search, AlertCircle, Copy, Check, RotateCcw } from 'lucide-react';

interface WithdrawalsViewProps {
  transactions: WalletTransaction[];
  onApprove: (tx: WalletTransaction, notes?: string) => void;
  onReject: (txId: string, notes?: string) => void;
  onRefund?: (tx: WalletTransaction) => void;
}

export const WithdrawalsView: React.FC<WithdrawalsViewProps> = ({
  transactions,
  onApprove,
  onReject,
  onRefund
}) => {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [notesModalTx, setNotesModalTx] = useState<{ tx: WalletTransaction; action: 'approve' | 'reject' } | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [copiedUpi, setCopiedUpi] = useState<string | null>(null);

  const safeTransactions = transactions || [];
  const withdrawalTransactions = safeTransactions.filter((t) => t && t.type === 'withdrawal');

  const filtered = withdrawalTransactions.filter((tx) => {
    if (!tx) return false;
    const matchesFilter = filter === 'all' ? true : tx.status === filter;
    const q = (search || '').toLowerCase();
    const matchesSearch =
      (tx.username || '').toLowerCase().includes(q) ||
      (tx.upiId ? tx.upiId.toLowerCase().includes(q) : false) ||
      (tx.withdrawalRequestId ? tx.withdrawalRequestId.toLowerCase().includes(q) : false) ||
      (tx.referenceId ? tx.referenceId.toLowerCase().includes(q) : false) ||
      (tx.utr ? tx.utr.toLowerCase().includes(q) : false) ||
      (tx.userId || '').toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const pendingCount = withdrawalTransactions.filter((t) => t && t.status === 'pending').length;

  const handleCopyUpi = (upi: string) => {
    navigator.clipboard.writeText(upi);
    setCopiedUpi(upi);
    setTimeout(() => setCopiedUpi(null), 2000);
  };

  const handleConfirmAction = () => {
    if (!notesModalTx) return;
    if (notesModalTx.action === 'approve') {
      onApprove(notesModalTx.tx, adminNote);
    } else {
      onReject(notesModalTx.tx.id, adminNote);
    }
    setNotesModalTx(null);
    setAdminNote('');
  };

  return (
    <div className="space-y-5 animate-in fade-in pb-16 md:pb-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-purple-900/80 via-indigo-950/80 to-purple-950 border border-purple-800/50 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-400 text-black rounded-md">
              Payout Desk
            </span>
            <span className="text-xs text-purple-300 font-semibold">Withdrawal Approvals</span>
          </div>
          <h2 className="text-lg font-black text-white mt-1 flex items-center gap-2">
            <ArrowUpRight className="w-5 h-5 text-amber-400" /> Player Wallet Withdrawals
          </h2>
          <p className="text-xs text-purple-300/80">
            Process player payout requests via UPI or Bank Transfer cleanly with 1-click copies
          </p>
        </div>

        {pendingCount > 0 && (
          <div className="px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-2 animate-pulse">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span>{pendingCount} Pending Payout{pendingCount > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Search & Status Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex p-1 bg-[#15112E] rounded-xl border border-purple-800/40 w-full sm:w-auto">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition capitalize ${
                filter === s
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                  : 'text-purple-300/80 hover:text-white'
              }`}
            >
              {s} {s === 'pending' && pendingCount > 0 ? `(${pendingCount})` : ''}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-purple-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Username, UPI ID, or User ID..."
            className="w-full pl-9 pr-4 py-2 bg-[#15112E] text-white text-xs rounded-xl border border-purple-800/40 focus:border-amber-400 focus:outline-none transition"
          />
        </div>
      </div>

      {/* Withdrawals List Cards */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#15112E] border border-purple-800/40 text-center text-purple-300 text-xs">
            <CheckCircle2 className="w-8 h-8 text-purple-400 mx-auto mb-2 opacity-60" />
            No {filter !== 'all' ? filter : ''} withdrawal requests found.
          </div>
        ) : (
          filtered.map((tx) => (
            <div
              key={tx.id}
              className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40 hover:border-purple-600 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              {/* User & Withdrawal Details */}
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-3 rounded-2xl bg-indigo-950/60 text-amber-400 border border-indigo-800/40 flex-shrink-0">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-sm text-white">{tx.username}</h3>
                    <span className="text-[10px] text-purple-400 font-mono">UID: {tx.userId}</span>
                    <span
                      className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border ${
                        tx.status === 'pending'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse'
                          : tx.status === 'approved'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : tx.isRefunded
                          ? 'bg-emerald-950/90 text-emerald-300 border-emerald-700/80'
                          : 'bg-rose-950 text-rose-400 border-rose-800'
                      }`}
                    >
                      {tx.status === 'rejected' && tx.isRefunded ? 'REJECTED (REFUNDED)' : tx.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs mt-1 text-purple-200/90 flex-wrap">
                    <span className="font-extrabold text-white text-base">₹{tx.amount}</span>
                    <span className="text-purple-400">•</span>
                    <span>Payout Method: <strong className="text-white">{tx.paymentMethod}</strong></span>
                    <span className="text-purple-400">•</span>
                    <span>Req ID: <strong className="text-amber-300 font-mono">{tx.withdrawalRequestId || tx.referenceId || tx.id}</strong></span>
                  </div>

                  {/* UPI ID Box with 1-Click Copy */}
                  {(() => {
                    const displayUpi = tx.upiId || tx.userPhone || (tx.referenceId && tx.referenceId !== tx.id ? tx.referenceId : '') || 'Not Provided';
                    return (
                      <div className="mt-2 flex items-center gap-3 flex-wrap">
                        <div className="inline-flex items-center gap-2 bg-[#1A1538] border border-purple-800/50 px-3 py-1.5 rounded-xl">
                          <span className="text-[11px] text-purple-300 font-bold">UPI / Pay Details:</span>
                          <code className={displayUpi !== 'Not Provided' ? "text-amber-300 text-xs font-mono font-extrabold" : "text-purple-400 text-xs italic"}>
                            {displayUpi}
                          </code>
                          {displayUpi !== 'Not Provided' && (
                            <button
                              onClick={() => handleCopyUpi(displayUpi)}
                              className="p-1 hover:bg-purple-800/60 rounded text-purple-300 hover:text-amber-300 transition"
                              title="Copy Payout Details"
                            >
                              {copiedUpi === displayUpi ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>

                        <div className="inline-flex items-center gap-2 bg-[#1A1538] border border-purple-800/50 px-3 py-1.5 rounded-xl text-xs">
                          <span className="text-[11px] text-purple-300 font-bold">Payout UTR:</span>
                          <span className={tx.status === 'approved' ? "text-emerald-400 font-mono font-bold" : "text-purple-400"}>
                            {tx.status === 'approved' ? (tx.utr || tx.adminNotes || 'N/A') : tx.status === 'pending' ? 'Not generated yet' : 'N/A (Rejected)'}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  <p className="text-[10px] text-purple-400 mt-1.5">
                    Requested: {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : 'N/A'}
                    {tx.processedAt && ` • Processed: ${new Date(tx.processedAt).toLocaleString()}`}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap justify-end border-t md:border-t-0 pt-3 md:pt-0 border-purple-800/40">
                {tx.status === 'pending' && (
                  <>
                    <button
                      onClick={() => setNotesModalTx({ tx, action: 'approve' })}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-extrabold shadow-lg shadow-emerald-900/40 flex items-center gap-1.5 transition active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve & Payout</span>
                    </button>

                    <button
                      onClick={() => setNotesModalTx({ tx, action: 'reject' })}
                      className="px-3.5 py-2 rounded-xl bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-bold flex items-center gap-1.5 transition active:scale-95"
                    >
                      <XCircle className="w-4 h-4 text-rose-400" />
                      <span>Reject</span>
                    </button>
                  </>
                )}

                {tx.status === 'rejected' && (
                  <>
                    {tx.isRefunded ? (
                      <span className="px-3.5 py-2 rounded-xl bg-emerald-950/90 border border-emerald-600/80 text-emerald-300 font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-950/50">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Refund Completed</span>
                      </span>
                    ) : (
                      onRefund && (
                        <button
                          onClick={() => onRefund(tx)}
                          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-amber-500/20"
                          title="Credit exact withdrawal amount back to player wallet"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Refund Manually</span>
                        </button>
                      )
                    )}
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Admin Notes Confirmation Modal */}
      {notesModalTx && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-[#15112E] p-5 rounded-2xl border border-purple-800/60 shadow-2xl space-y-4">
            <h3 className="font-extrabold text-base text-white flex items-center gap-2">
              {notesModalTx.action === 'approve' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-400" />
              )}
              {notesModalTx.action === 'approve' ? 'Approve Withdrawal' : 'Reject Withdrawal'}
            </h3>

            <p className="text-xs text-purple-200">
              {notesModalTx.action === 'approve'
                ? `Confirm paying out ₹${notesModalTx.tx.amount} to user ${notesModalTx.tx.username} (${notesModalTx.tx.upiId || 'UPI'})?`
                : `Reject withdrawal request of ₹${notesModalTx.tx.amount} for ${notesModalTx.tx.username}?`}
            </p>

            {notesModalTx.action === 'reject' && (
              <div className="bg-[#1A1538] p-3 rounded-xl border border-purple-800/50 space-y-1">
                <p className="text-xs text-purple-200 font-semibold">
                  Note: Rejecting this request keeps the withdrawal amount deducted. You can click <strong className="text-amber-300">"Refund Manually"</strong> at any time to credit the amount back to the player's wallet.
                </p>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-purple-300 mb-1 uppercase">
                Bank UTR / Reference ID / Admin Remarks
              </label>
              <input
                type="text"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder={notesModalTx.action === 'approve' ? 'Enter Bank UTR (e.g. UTR-98410294)' : 'e.g. Invalid UPI ID / Name mismatch'}
                className="w-full bg-[#1A1538] text-white text-xs px-3 py-2 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setNotesModalTx(null)}
                className="flex-1 py-2 bg-purple-950 hover:bg-purple-900 text-purple-300 text-xs font-bold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAction}
                className={`flex-1 py-2 text-xs font-extrabold rounded-xl transition ${
                  notesModalTx.action === 'approve'
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 text-white hover:from-emerald-500'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                Confirm {notesModalTx.action === 'approve' ? 'Payout' : 'Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
