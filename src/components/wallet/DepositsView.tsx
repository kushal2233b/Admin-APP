import React, { useState } from 'react';
import { WalletTransaction } from '../../types';
import { ArrowDownRight, CheckCircle2, XCircle, Eye, Search, AlertCircle, FileText, Trash2, RefreshCw } from 'lucide-react';

interface DepositsViewProps {
  transactions: WalletTransaction[];
  onApprove: (tx: WalletTransaction, notes?: string) => void;
  onReject: (txId: string, notes?: string) => void;
  onDelete?: (txOrId: WalletTransaction | string) => void;
  onClearAllPendingDeposits?: () => void;
  onRefresh?: () => void;
}

export const DepositsView: React.FC<DepositsViewProps> = ({
  transactions,
  onApprove,
  onReject,
  onDelete,
  onClearAllPendingDeposits,
  onRefresh
}) => {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [selectedProof, setSelectedProof] = useState<string | null>(null);
  const [notesModalTx, setNotesModalTx] = useState<{ tx: WalletTransaction; action: 'approve' | 'reject' } | null>(null);
  const [adminNote, setAdminNote] = useState('');

  const safeTransactions = transactions || [];
  const depositTransactions = safeTransactions.filter((t) => t && t.type === 'deposit');

  const filtered = depositTransactions.filter((tx) => {
    if (!tx) return false;
    const matchesFilter = filter === 'all' ? true : tx.status === filter;
    const q = (search || '').toLowerCase();
    const matchesSearch =
      (tx.username || '').toLowerCase().includes(q) ||
      (tx.referenceId || '').toLowerCase().includes(q) ||
      (tx.utr || '').toLowerCase().includes(q) ||
      (tx.upiId || '').toLowerCase().includes(q) ||
      (tx.description || '').toLowerCase().includes(q) ||
      (tx.userId || '').toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const pendingCount = depositTransactions.filter((t) => t && t.status === 'pending').length;

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
            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-emerald-500 text-black rounded-md">
              Finance Desk
            </span>
            <span className="text-xs text-purple-300 font-semibold">Deposit Approvals</span>
          </div>
          <h2 className="text-lg font-black text-white mt-1 flex items-center gap-2">
            <ArrowDownRight className="w-5 h-5 text-emerald-400" /> Player Wallet Deposits
          </h2>
          <p className="text-xs text-purple-300/80">
            Review payment screenshots, Sender UPIs, and instantly credit player wallets
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {pendingCount > 0 && (
            <div className="px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400" />
              <span>{pendingCount} Pending Deposit{pendingCount > 1 ? 's' : ''}</span>
            </div>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-3 py-2 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700/50 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-md"
              title="Refresh deposit transactions from database"
            >
              <RefreshCw className="w-3.5 h-3.5 text-purple-300" />
              <span>Refresh</span>
            </button>
          )}

          {pendingCount > 0 && onClearAllPendingDeposits && (
            <button
              onClick={onClearAllPendingDeposits}
              className="px-3 py-2 rounded-xl bg-rose-950/90 hover:bg-rose-900 text-rose-300 border border-rose-800 text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-md"
              title="Clear all pending deposit requests that might be stuck or invalid"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Purge All Pending</span>
            </button>
          )}
        </div>
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
            placeholder="Search by Username, UPI ID, or User ID..."
            className="w-full pl-9 pr-4 py-2 bg-[#15112E] text-white text-xs rounded-xl border border-purple-800/40 focus:border-amber-400 focus:outline-none transition"
          />
        </div>
      </div>

      {/* Deposits List Cards */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#15112E] border border-purple-800/40 text-center text-purple-300 text-xs">
            <CheckCircle2 className="w-8 h-8 text-purple-400 mx-auto mb-2 opacity-60" />
            No {filter !== 'all' ? filter : ''} deposit transactions found.
          </div>
        ) : (
          filtered.map((tx) => (
            <div
              key={tx.id}
              className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40 hover:border-purple-600 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              {/* User & Tx Info */}
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-3 rounded-2xl bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 flex-shrink-0">
                  <ArrowDownRight className="w-5 h-5" />
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
                          : 'bg-rose-950 text-rose-400 border-rose-800'
                      }`}
                    >
                      {tx.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs mt-1 text-purple-200/90 flex-wrap">
                    <span className="font-extrabold text-amber-300 text-base">₹{tx.amount}</span>
                    <span className="text-purple-400">•</span>
                    <span>Method: <strong className="text-white">{tx.paymentMethod}</strong></span>
                    
                    {(tx.utr || tx.referenceId) && (
                      <>
                        <span className="text-purple-400">•</span>
                        <span>UTR / Ref: <code className="text-emerald-300 font-mono font-bold bg-purple-950 px-1.5 py-0.5 rounded">{tx.utr || tx.referenceId}</code></span>
                      </>
                    )}

                    {tx.upiId && (
                      <>
                        <span className="text-purple-400">•</span>
                        <span>Sender UPI: <code className="text-amber-300 font-mono font-bold bg-purple-950 px-1.5 py-0.5 rounded">{tx.upiId}</code></span>
                      </>
                    )}
                  </div>

                  {tx.description && (
                    <div className="text-[11px] text-purple-300/90 mt-1 bg-purple-950/40 px-2 py-1 rounded border border-purple-800/30">
                      {tx.description}
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-[10px] mt-1.5 text-purple-300/80 flex-wrap">
                    {(tx.fullName || tx.senderName) && (
                      <span>Name: <strong className="text-purple-200">{tx.fullName || tx.senderName}</strong></span>
                    )}
                    {tx.userPhone && (
                      <span>Phone: <strong className="text-purple-200">{tx.userPhone}</strong></span>
                    )}
                    {tx.userEmail && (
                      <span>Email: <strong className="text-purple-200">{tx.userEmail}</strong></span>
                    )}
                  </div>

                  <p className="text-[10px] text-purple-400 mt-1">
                    Requested: {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : 'N/A'}
                    {tx.processedAt && ` • Processed: ${new Date(tx.processedAt).toLocaleString()}`}
                  </p>
                </div>
              </div>

              {/* Actions & Proof Button */}
              <div className="flex items-center gap-2 flex-wrap justify-end border-t md:border-t-0 pt-3 md:pt-0 border-purple-800/40">
                {tx.proofImageUrl && (
                  <button
                    onClick={() => setSelectedProof(tx.proofImageUrl || null)}
                    className="px-3 py-2 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-purple-200 text-xs font-bold flex items-center gap-1.5 border border-purple-700/50 transition"
                  >
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                    <span>View Screenshot</span>
                  </button>
                )}

                {tx.status === 'pending' && (
                  <>
                    <button
                      onClick={() => setNotesModalTx({ tx, action: 'approve' })}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white text-xs font-extrabold shadow-lg shadow-emerald-900/40 flex items-center gap-1.5 transition active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approve</span>
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

                {onDelete && (
                  <button
                    onClick={() => onDelete(tx)}
                    className="p-2 rounded-xl bg-red-950/40 hover:bg-red-900/80 text-red-400 hover:text-red-200 border border-red-900/50 text-xs font-bold flex items-center justify-center transition active:scale-95"
                    title="Permanently remove / delete this deposit request"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Proof Image Modal */}
      {selectedProof && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#15112E] p-4 rounded-2xl border border-purple-800/60 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-purple-800/40">
              <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-400" /> Payment Proof Screenshot
              </h3>
              <button
                onClick={() => setSelectedProof(null)}
                className="text-purple-400 hover:text-white text-xs font-bold p-1"
              >
                ✕ Close
              </button>
            </div>

            <div className="rounded-xl overflow-hidden bg-black flex items-center justify-center max-h-96 min-h-[200px]">
              <img
                src={selectedProof}
                alt="Payment Screenshot"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x300/130F29/A78BFA?text=Image+Not+Found';
                }}
                className="max-h-96 w-auto object-contain rounded-lg"
              />
            </div>

            <button
              onClick={() => setSelectedProof(null)}
              className="w-full py-2 bg-purple-900 hover:bg-purple-800 text-white text-xs font-bold rounded-xl transition"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}

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
              {notesModalTx.action === 'approve' ? 'Approve Deposit' : 'Reject Deposit'}
            </h3>

            <p className="text-xs text-purple-200">
              {notesModalTx.action === 'approve'
                ? `Confirm crediting ₹${notesModalTx.tx.amount} to user ${notesModalTx.tx.username}'s wallet?`
                : `Reject deposit request of ₹${notesModalTx.tx.amount} from ${notesModalTx.tx.username}?`}
            </p>

            <div>
              <label className="block text-[11px] font-bold text-purple-300 mb-1 uppercase">
                Admin Note / Remarks (Optional)
              </label>
              <input
                type="text"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder={notesModalTx.action === 'approve' ? 'e.g. Payment verified' : 'e.g. Payment not received / Invalid proof'}
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
                Confirm {notesModalTx.action === 'approve' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
