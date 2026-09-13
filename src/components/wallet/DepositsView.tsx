import React, { useState } from 'react';
import { WalletTransaction, AppUser } from '../../types';
import { resolveUserDisplayName } from '../../services/supabaseService';
import { ArrowDownRight, CheckCircle2, XCircle, Eye, Search, AlertCircle, FileText, Trash2, RefreshCw } from 'lucide-react';

interface DepositsViewProps {
  transactions: WalletTransaction[];
  users?: AppUser[];
  onApprove: (tx: WalletTransaction, notes?: string) => void;
  onReject: (txId: string, notes?: string) => void;
  onDelete?: (txOrId: WalletTransaction | string) => void;
  onClearAllPendingDeposits?: () => void;
  onRefresh?: () => void;
}

export const DepositsView: React.FC<DepositsViewProps> = ({
  transactions,
  users = [],
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
    const resolved = resolveUserDisplayName(tx, users);
    const matchesSearch =
      (resolved.username || '').toLowerCase().includes(q) ||
      (resolved.inGameName || '').toLowerCase().includes(q) ||
      (resolved.email || '').toLowerCase().includes(q) ||
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-purple-900/80 via-indigo-950/80 to-purple-950 border border-[#29252A] shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-[#C9A34E] text-black rounded-md">
              Finance Desk
            </span>
            <span className="text-xs text-[#B0ACB0] font-semibold">Deposit Approvals</span>
          </div>
          <h2 className="text-lg font-black text-white mt-1 flex items-center gap-2">
            <ArrowDownRight className="w-5 h-5 text-[#C9A34E]" /> Player Wallet Deposits
          </h2>
          <p className="text-xs text-[#B0ACB0]/80">
            Review payment screenshots, Sender UPIs, and instantly credit player wallets
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {pendingCount > 0 && (
            <div className="px-3.5 py-2 rounded-xl bg-[#C9A34E]/20 border border-[#C9A34E]/30 text-[#C9A34E] text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-[#C9A34E]" />
              <span>{pendingCount} Pending Deposit{pendingCount > 1 ? 's' : ''}</span>
            </div>
          )}

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-3 py-2 rounded-xl bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white border border-[#29252A] text-xs font-bold flex items-center gap-1.5 transition active:scale-95 shadow-md"
              title="Refresh deposit transactions from database"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#B0ACB0]" />
              <span>Refresh</span>
            </button>
          )}

          {pendingCount > 0 && onClearAllPendingDeposits && (
            <button
              onClick={onClearAllPendingDeposits}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white border border-rose-500 text-xs font-black flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-rose-950/50"
              title="Clear all pending deposit requests that might be stuck or invalid"
            >
              <Trash2 className="w-3.5 h-3.5 text-white" />
              <span>Purge All Pending</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Status Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex p-1 bg-[#0D0B0D] rounded-xl border border-[#29252A] w-full sm:w-auto">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition capitalize ${
                filter === s
                  ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md'
                  : 'text-[#B0ACB0]/80 hover:text-white'
              }`}
            >
              {s} {s === 'pending' && pendingCount > 0 ? `(${pendingCount})` : ''}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#777278]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Username, UPI ID, or User ID..."
            className="w-full pl-9 pr-4 py-2 bg-[#0D0B0D] text-white text-xs rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none transition"
          />
        </div>
      </div>

      {/* Deposits List Cards */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#0D0B0D] border border-[#29252A] text-center text-[#B0ACB0] text-xs">
            <CheckCircle2 className="w-8 h-8 text-[#777278] mx-auto mb-2 opacity-60" />
            No {filter !== 'all' ? filter : ''} deposit transactions found.
          </div>
        ) : (
          filtered.map((tx) => {
            const userDisplay = resolveUserDisplayName(tx, users);
            return (
            <div
              key={tx.id}
              className="p-4 rounded-2xl bg-[#0D0B0D] border border-[#29252A] hover:border-[#29252A] transition flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              {/* User & Tx Info */}
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-3 rounded-2xl bg-[#350A12] text-[#C9A34E] border border-[#29252A] flex-shrink-0">
                  <ArrowDownRight className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-extrabold text-sm text-white">
                      {userDisplay.username}
                      {userDisplay.inGameName && userDisplay.inGameName !== 'N/A' && userDisplay.inGameName !== userDisplay.username ? (
                        <span className="text-xs text-[#B0ACB0] font-normal ml-1">({userDisplay.inGameName})</span>
                      ) : null}
                    </h3>
                    <span className="text-[10px] text-[#777278] font-mono">User ID: {userDisplay.userId !== 'N/A' ? userDisplay.userId : tx.userId}</span>
                    <span
                      className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border ${
                        tx.status === 'pending'
                          ? 'bg-[#C9A34E]/20 text-[#C9A34E] border-[#C9A34E]/30 animate-pulse'
                          : tx.status === 'approved'
                          ? 'bg-[#350A12] text-[#C9A34E] border-[#29252A]'
                          : 'bg-rose-950 text-rose-400 border-rose-800'
                      }`}
                    >
                      {tx.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs mt-1 text-[#B0ACB0]/90 flex-wrap">
                    <span className="font-extrabold text-[#C9A34E] text-base">₹{tx.amount}</span>
                    <span className="text-[#777278]">•</span>
                    <span>Method: <strong className="text-white">{tx.paymentMethod}</strong></span>
                    
                    {(tx.utr || tx.referenceId) && (
                      <>
                        <span className="text-[#777278]">•</span>
                        <span>UTR / Ref: <code className="text-[#C9A34E] font-mono font-bold bg-[#0D0B0D] px-1.5 py-0.5 rounded">{tx.utr || tx.referenceId}</code></span>
                      </>
                    )}

                    {tx.upiId && (
                      <>
                        <span className="text-[#777278]">•</span>
                        <span>Sender UPI: <code className="text-[#C9A34E] font-mono font-bold bg-[#0D0B0D] px-1.5 py-0.5 rounded">{tx.upiId}</code></span>
                      </>
                    )}
                  </div>

                  {tx.description && (
                    <div className="text-[11px] text-[#B0ACB0]/90 mt-1 bg-[#0D0B0D]/40 px-2 py-1 rounded border border-[#29252A]">
                      {tx.description}
                    </div>
                  )}

                  <div className="flex items-center gap-3 text-[10px] mt-1.5 text-[#B0ACB0]/80 flex-wrap">
                    {(userDisplay.email && userDisplay.email !== 'N/A') && (
                      <span>Email: <strong className="text-[#B0ACB0]">{userDisplay.email}</strong></span>
                    )}
                    {(userDisplay.phone && userDisplay.phone !== 'N/A') && (
                      <span>Phone: <strong className="text-[#B0ACB0]">{userDisplay.phone}</strong></span>
                    )}
                  </div>

                  <p className="text-[10px] text-[#777278] mt-1">
                    Requested: {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : 'N/A'}
                    {tx.processedAt && ` • Processed: ${new Date(tx.processedAt).toLocaleString()}`}
                  </p>
                </div>
              </div>

              {/* Actions & Proof Button */}
              <div className="flex items-center gap-2 flex-wrap justify-end border-t md:border-t-0 pt-3 md:pt-0 border-[#29252A]">
                {tx.proofImageUrl && (
                  <button
                    onClick={() => setSelectedProof(tx.proofImageUrl || null)}
                    className="px-3 py-2 rounded-xl bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white text-xs font-bold flex items-center gap-1.5 border border-[#29252A] transition"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#C9A34E]" />
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
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white border border-rose-500 text-xs font-black flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-rose-950/40"
                    >
                      <XCircle className="w-4 h-4 text-white" />
                      <span>Reject</span>
                    </button>
                  </>
                )}

                {onDelete && (
                  <button
                    onClick={() => onDelete(tx)}
                    className="p-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-bold flex items-center justify-center transition active:scale-95"
                    title="Permanently remove / delete this deposit request"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
          })
        )}
      </div>

      {/* Proof Image Modal */}
      {selectedProof && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#0D0B0D] p-4 rounded-2xl border border-[#29252A] shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#29252A]">
              <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-[#C9A34E]" /> Payment Proof Screenshot
              </h3>
              <button
                onClick={() => setSelectedProof(null)}
                className="text-[#777278] hover:text-white text-xs font-bold p-1"
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
              className="w-full py-2 bg-[#141215] hover:bg-[#FF3048] text-white text-xs font-bold rounded-xl transition"
            >
              Close Preview
            </button>
          </div>
        </div>
      )}

      {/* Admin Notes Confirmation Modal */}
      {notesModalTx && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-[#0D0B0D] p-5 rounded-2xl border border-[#29252A] shadow-2xl space-y-4">
            <h3 className="font-extrabold text-base text-white flex items-center gap-2">
              {notesModalTx.action === 'approve' ? (
                <CheckCircle2 className="w-5 h-5 text-[#C9A34E]" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-400" />
              )}
              {notesModalTx.action === 'approve' ? 'Approve Deposit' : 'Reject Deposit'}
            </h3>

            <p className="text-xs text-[#B0ACB0]">
              {notesModalTx.action === 'approve'
                ? `Confirm crediting ₹${notesModalTx.tx.amount} to user ${notesModalTx.tx.username}'s wallet?`
                : `Reject deposit request of ₹${notesModalTx.tx.amount} from ${notesModalTx.tx.username}?`}
            </p>

            <div>
              <label className="block text-[11px] font-bold text-[#B0ACB0] mb-1 uppercase">
                Admin Note / Remarks (Optional)
              </label>
              <input
                type="text"
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                placeholder={notesModalTx.action === 'approve' ? 'e.g. Payment verified' : 'e.g. Payment not received / Invalid proof'}
                className="w-full bg-[#141215] text-white text-xs px-3 py-2 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setNotesModalTx(null)}
                className="flex-1 py-2 bg-[#0D0B0D] hover:bg-[#141215] text-[#B0ACB0] text-xs font-bold rounded-xl transition"
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
