import React, { useState } from 'react';
import { WalletTransaction, TransactionType, TransactionStatus, AppUser } from '../../types';
import { resolveUserDisplayName } from '../../services/supabaseService';
import {
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Eye,
  PlusCircle,
  MinusCircle,
  Clock,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  X,
  Trash2,
  RotateCcw
} from 'lucide-react';

interface WalletManagementProps {
  transactions: WalletTransaction[];
  users?: AppUser[];
  onApproveTransaction: (txId: string) => void;
  onRejectTransaction: (txId: string, reason: string) => void;
  onRefundTransaction?: (tx: WalletTransaction) => void;
  onDeleteTransaction?: (txOrId: WalletTransaction | string) => void;
  onManualWalletAdjustment: (usernameOrId: string, amount: number, isAddition: boolean, note: string, walletType: 'main' | 'winning') => Promise<void>;
}

export const WalletManagement: React.FC<WalletManagementProps> = ({
  transactions,
  users = [],
  onApproveTransaction,
  onRejectTransaction,
  onRefundTransaction,
  onDeleteTransaction,
  onManualWalletAdjustment
}) => {
  const [activeTab, setActiveTab] = useState<'deposits' | 'withdrawals' | 'history' | 'manual'>('deposits');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  // Preview Proof Modal
  const [previewTransaction, setPreviewTransaction] = useState<WalletTransaction | null>(null);

  // Reject Modal
  const [rejectingTx, setRejectingTx] = useState<WalletTransaction | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Manual Adjust Form
  const [manualUser, setManualUser] = useState('');
  const [manualAmount, setManualAmount] = useState<number>(200);
  const [manualIsAdd, setManualIsAdd] = useState<boolean>(true);
  const [manualNote, setManualNote] = useState('');
  const [manualWalletType, setManualWalletType] = useState<'main' | 'winning'>('main');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const safeTransactions = transactions || [];

  const pendingDeposits = safeTransactions.filter((t) => t && t.type === 'deposit' && t.status === 'pending');
  const pendingWithdrawals = safeTransactions.filter((t) => t && t.type === 'withdrawal' && t.status === 'pending');

  // Filtered List
  const filteredList = safeTransactions.filter((t) => {
    if (!t) return false;
    const q = (searchQuery || '').toLowerCase();
    const resolved = resolveUserDisplayName(t, users);
    const matchesSearch =
      (resolved.username || '').toLowerCase().includes(q) ||
      (resolved.inGameName || '').toLowerCase().includes(q) ||
      (resolved.email || '').toLowerCase().includes(q) ||
      (t.username || '').toLowerCase().includes(q) ||
      (t.referenceId || '').toLowerCase().includes(q) ||
      (t.upiId ? t.upiId.toLowerCase().includes(q) : false);

    let matchesTab = true;
    if (activeTab === 'deposits') matchesTab = t.type === 'deposit';
    else if (activeTab === 'withdrawals') matchesTab = t.type === 'withdrawal';

    let matchesStatus = true;
    if (activeTab === 'deposits' || activeTab === 'withdrawals') {
      matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    }

    return matchesSearch && matchesTab && matchesStatus;
  });

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (manualUser && manualAmount > 0) {
      setIsSubmitting(true);
      try {
        await onManualWalletAdjustment(manualUser, manualAmount, manualIsAdd, manualNote, manualWalletType);
        setManualUser('');
        setManualAmount(200);
        setManualNote('');
        setManualWalletType('main');
      } catch (err: any) {
        alert(err?.message || 'Failed to adjust wallet balance. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleConfirmReject = () => {
    if (rejectingTx) {
      onRejectTransaction(rejectingTx.id, rejectionReason || 'Payment verification failed');
      setRejectingTx(null);
      setRejectionReason('');
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in pb-16 md:pb-6">
      
      {/* Title & Stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#15112E] border border-purple-800/40">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-amber-400" /> Wallet & Payout Desk
          </h2>
          <p className="text-xs text-purple-300/80">
            Review player deposit screenshots, approve withdrawal requests, and audit logs
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 animate-spin" />
            {pendingDeposits.length} Deposits • {pendingWithdrawals.length} Withdrawals
          </span>
        </div>
      </div>

      {/* Main Sub Tabs */}
      <div className="flex items-center gap-1 bg-[#15112E] p-1.5 rounded-2xl border border-purple-800/40 overflow-x-auto">
        <button
          onClick={() => {
            setActiveTab('deposits');
            setStatusFilter('pending');
          }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
            activeTab === 'deposits'
              ? 'bg-amber-400 text-black shadow-lg'
              : 'text-purple-300 hover:text-white bg-purple-950/40'
          }`}
        >
          <ArrowDownRight className="w-4 h-4" />
          <span>Deposit Requests</span>
          {pendingDeposits.length > 0 && (
            <span className="px-1.5 py-0.2 bg-black text-amber-300 text-[10px] rounded-full font-black">
              {pendingDeposits.length}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('withdrawals');
            setStatusFilter('pending');
          }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
            activeTab === 'withdrawals'
              ? 'bg-amber-400 text-black shadow-lg'
              : 'text-purple-300 hover:text-white bg-purple-950/40'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>Withdrawal Requests</span>
          {pendingWithdrawals.length > 0 && (
            <span className="px-1.5 py-0.2 bg-black text-amber-300 text-[10px] rounded-full font-black">
              {pendingWithdrawals.length}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('history');
            setStatusFilter('all');
          }}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
            activeTab === 'history'
              ? 'bg-amber-400 text-black shadow-lg'
              : 'text-purple-300 hover:text-white bg-purple-950/40'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Full History</span>
        </button>

        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition whitespace-nowrap ${
            activeTab === 'manual'
              ? 'bg-amber-400 text-black shadow-lg'
              : 'text-purple-300 hover:text-white bg-purple-950/40'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span>Manual Adjust</span>
        </button>
      </div>

      {/* Filter / Search Bar (For Deposits, Withdrawals & History) */}
      {activeTab !== 'manual' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 relative">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-purple-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Username, UPI ID..."
              className="w-full bg-[#1A1538] text-white text-xs pl-10 pr-4 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
            />
          </div>

          {(activeTab === 'deposits' || activeTab === 'withdrawals') && (
            <div className="flex items-center gap-1 bg-[#1A1538] p-1 rounded-xl border border-purple-800/50">
              {(['pending', 'approved', 'rejected', 'all'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`flex-1 py-1 text-[10px] font-bold uppercase rounded-lg transition ${
                    statusFilter === st
                      ? 'bg-purple-800 text-amber-300'
                      : 'text-purple-400 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main List Section */}
      {activeTab !== 'manual' ? (
        <div className="space-y-3">
          {filteredList.length === 0 ? (
            <div className="p-8 text-center bg-[#15112E] rounded-2xl border border-purple-800/30 text-purple-400 text-xs">
              No transactions match your search and filter criteria.
            </div>
          ) : (
            filteredList.map((tx) => {
              const userDisplay = resolveUserDisplayName(tx, users);
              return (
              <div
                key={tx.id}
                className="p-3.5 sm:p-4 rounded-2xl bg-[#15112E] border border-purple-800/40 hover:border-purple-600 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg"
              >
                {/* Transaction User Info */}
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0 font-bold ${
                      tx.type === 'deposit'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}
                  >
                    {tx.type === 'deposit' ? (
                      <ArrowDownRight className="w-5 h-5" />
                    ) : (
                      <ArrowUpRight className="w-5 h-5" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-sm text-white">
                        {userDisplay.username}
                        {userDisplay.inGameName && userDisplay.inGameName !== 'N/A' && userDisplay.inGameName !== userDisplay.username ? (
                          <span className="text-xs text-purple-300 font-normal ml-1">({userDisplay.inGameName})</span>
                        ) : null}
                      </h3>
                      <span
                        className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md border ${
                          tx.status === 'pending'
                            ? 'bg-amber-950 text-amber-300 border-amber-800 animate-pulse'
                            : tx.status === 'approved'
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border-rose-800'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </div>

                    {tx.type === 'withdrawal' ? (
                      <>
                        <p className="text-[11px] text-purple-300/80 font-mono mt-0.5">
                          Req ID: <span className="text-amber-300 font-semibold">{tx.withdrawalRequestId || tx.referenceId || tx.id}</span> • {tx.paymentMethod}
                        </p>
                        <p className="text-[10px] text-purple-300">
                          UPI ID: <span className={(tx.upiId || tx.userPhone) ? "text-amber-200 font-bold" : "text-purple-400 italic"}>{tx.upiId || 'Not Provided'}</span>
                        </p>
                        <p className="text-[10px] text-purple-300">
                          Payout UTR: <span className={tx.status === 'approved' ? "text-emerald-400 font-mono font-bold" : "text-purple-400"}>
                            {tx.status === 'approved' ? (tx.utr || tx.adminNotes || 'N/A') : tx.status === 'pending' ? 'Not generated yet' : 'N/A (Rejected)'}
                          </span>
                        </p>
                      </>
                    ) : (
                      <>
                        {tx.upiId ? (
                          <p className="text-[11px] text-purple-300/80 font-mono mt-0.5">
                            Sender UPI: <span className="text-amber-300 font-semibold">{tx.upiId}</span> • {tx.paymentMethod}
                          </p>
                        ) : (
                          <p className="text-[11px] text-purple-300/80 font-mono mt-0.5">
                            Deposit Ref: <span className="text-amber-300 font-semibold">{tx.referenceId}</span> • {tx.paymentMethod}
                          </p>
                        )}
                      </>
                    )}
                    <p className="text-[10px] text-purple-400/80">
                      Submitted: {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Amount & Action Buttons */}
                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-purple-800/30">
                  <div className="text-left sm:text-right">
                    <p
                      className={`text-base font-black ${
                        tx.type === 'deposit' ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {tx.type === 'deposit' ? '+' : '-'}₹{(tx.amount ?? 0).toLocaleString('en-IN')}
                    </p>
                    {tx.proofImageUrl && (
                      <button
                        onClick={() => setPreviewTransaction(tx)}
                        className="text-[10px] text-purple-300 hover:text-amber-300 underline font-semibold flex items-center gap-1 mt-0.5"
                      >
                        <Eye className="w-3 h-3 text-amber-400" /> View Payment Screenshot
                      </button>
                    )}
                  </div>

                  {tx.status === 'pending' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onApproveTransaction(tx.id)}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 text-black font-extrabold text-xs transition active:scale-95 shadow-md"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setRejectingTx(tx)}
                        className="px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/60 font-bold text-xs transition active:scale-95"
                      >
                        Reject
                      </button>
                      {onDeleteTransaction && (
                        <button
                          onClick={() => onDeleteTransaction(tx)}
                          className="p-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/80 text-red-400 hover:text-red-200 border border-red-900/50 text-xs font-bold transition active:scale-95"
                          title="Delete deposit request"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}

                  {tx.type === 'withdrawal' && tx.status === 'rejected' && (
                    <div className="flex items-center gap-1.5">
                      {tx.isRefunded ? (
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-950/90 border border-emerald-600/80 text-emerald-300 font-extrabold text-xs flex items-center gap-1.5 shadow-sm">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Refund Completed</span>
                        </span>
                      ) : (
                        onRefundTransaction && (
                          <button
                            onClick={() => onRefundTransaction(tx)}
                            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs flex items-center gap-1 transition active:scale-95 shadow-md"
                            title="Credit exact withdrawal amount back to player wallet"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Refund Manually</span>
                          </button>
                        )
                      )}
                    </div>
                  )}

                  {tx.status !== 'pending' && onDeleteTransaction && (
                    <button
                      onClick={() => onDeleteTransaction(tx)}
                      className="p-1.5 rounded-xl bg-red-950/40 hover:bg-red-900/80 text-red-400 hover:text-red-200 border border-red-900/50 text-xs font-bold transition active:scale-95"
                      title="Delete deposit request"
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
      ) : (
        /* Manual Wallet Adjustment Desk */
        <div className="p-5 rounded-2xl bg-[#15112E] border border-purple-800/40 max-w-xl mx-auto space-y-4">
          <div>
            <h3 className="text-base font-black text-amber-300 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-amber-400" /> Manual Wallet Credit / Debit Desk
            </h3>
            <p className="text-xs text-purple-300/80 mt-1">
              Directly adjust any player's wallet balance for rewards, refunds, or corrections.
            </p>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                Player Username or UID
              </label>
              <input
                type="text"
                required
                value={manualUser}
                onChange={(e) => setManualUser(e.target.value)}
                placeholder="Enter player Username or User ID"
                className="w-full bg-[#1A1538] text-white text-xs p-3 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                Target Wallet
              </label>
              <div className="flex items-center gap-1 bg-[#1A1538] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setManualWalletType('main')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                    manualWalletType === 'main' ? 'bg-purple-600 text-white' : 'text-purple-300'
                  }`}
                >
                  Main Wallet
                </button>
                <button
                  type="button"
                  onClick={() => setManualWalletType('winning')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                    manualWalletType === 'winning' ? 'bg-amber-500 text-black' : 'text-purple-300'
                  }`}
                >
                  Winning Balance
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                  Adjustment Type
                </label>
                <div className="flex items-center gap-1 bg-[#1A1538] p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setManualIsAdd(true)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${
                      manualIsAdd ? 'bg-emerald-500 text-black' : 'text-purple-300'
                    }`}
                  >
                    + Credit
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualIsAdd(false)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg ${
                      !manualIsAdd ? 'bg-rose-500 text-white' : 'text-purple-300'
                    }`}
                  >
                    - Debit
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                  Amount (INR)
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={isNaN(manualAmount) ? 0 : manualAmount}
                  onChange={(e) => setManualAmount(isNaN(Number(e.target.value)) ? 0 : Number(e.target.value))}
                  className="w-full bg-[#1A1538] text-white text-xs p-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                Audit Note / Reason
              </label>
              <input
                type="text"
                required
                value={manualNote}
                onChange={(e) => setManualNote(e.target.value)}
                placeholder="Tournament kill reward correction"
                className="w-full bg-[#1A1538] text-white text-xs p-3 rounded-xl border border-purple-800/50 focus:outline-none"
              />
            </div>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleManualSubmit}
              className={`w-full py-3 rounded-xl font-extrabold text-xs transition active:scale-95 shadow-lg ${
                isSubmitting 
                  ? 'bg-purple-900/40 text-purple-400 cursor-not-allowed border border-purple-800/30' 
                  : 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 text-black shadow-amber-500/20'
              }`}
            >
              {isSubmitting ? 'Adjusting Wallet Balance...' : 'Apply Wallet Adjustment'}
            </button>
          </div>
        </div>
      )}

      {/* Payment Screenshot Proof Modal */}
      {previewTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#130F29] border border-purple-800/80 rounded-3xl p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-purple-800/50">
              <h3 className="text-sm font-black text-amber-300 flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-400" /> Payment Screenshot Proof
              </h3>
              <button
                onClick={() => setPreviewTransaction(null)}
                className="p-1 rounded-xl bg-purple-900/40 text-purple-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-white font-bold">
                User: <span className="text-amber-300">{previewTransaction.username}</span> • Amount: ₹{previewTransaction.amount}
              </p>
              <p className="text-purple-300 font-mono">
                {previewTransaction.type === 'withdrawal'
                  ? `Request ID: ${previewTransaction.withdrawalRequestId || previewTransaction.referenceId || previewTransaction.id} | UPI: ${previewTransaction.upiId || 'Not Provided'}`
                  : `Deposit Ref: ${previewTransaction.referenceId}`}
              </p>
            </div>

            <div className="rounded-2xl overflow-hidden border border-purple-700/50 max-h-72 min-h-[150px] bg-black flex items-center justify-center">
              <img
                src={previewTransaction.proofImageUrl}
                alt="Payment Proof"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x300/130F29/A78BFA?text=Image+Not+Found';
                }}
                className="max-h-72 object-contain"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-purple-800/50">
              {previewTransaction.status === 'pending' && (
                <>
                  <button
                    onClick={() => {
                      onApproveTransaction(previewTransaction.id);
                      setPreviewTransaction(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-500 text-black font-extrabold text-xs"
                  >
                    Approve Payment
                  </button>
                  <button
                    onClick={() => {
                      setRejectingTx(previewTransaction);
                      setPreviewTransaction(null);
                    }}
                    className="px-3 py-2 rounded-xl bg-rose-950 text-rose-300 font-bold text-xs"
                  >
                    Reject
                  </button>
                </>
              )}
              <button
                onClick={() => setPreviewTransaction(null)}
                className="px-3 py-2 rounded-xl bg-purple-950 text-purple-300 text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Request Reason Modal */}
      {rejectingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#130F29] border border-rose-800/80 rounded-3xl p-5 space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-rose-400 flex items-center gap-2">
              <XCircle className="w-5 h-5" /> Reject {rejectingTx.type} Request
            </h3>
            <p className="text-xs text-purple-200">
              Rejecting request for <span className="font-bold text-white">{rejectingTx.username}</span> (Amount: ₹{rejectingTx.amount}).
            </p>

            {rejectingTx.type === 'withdrawal' && (
              <div className="bg-[#1A1538] p-3 rounded-xl border border-rose-800/40 space-y-1">
                <p className="text-xs text-purple-200 font-semibold">
                  Note: The withdrawal amount (₹{rejectingTx.amount}) will remain deducted. You can click <strong className="text-amber-300">"Refund Manually"</strong> at any time after rejection to credit the funds back.
                </p>
              </div>
            )}

            <div>
              <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                Rejection Reason for Player App
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Payment not received / Invalid proof..."
                className="w-full bg-[#1A1538] text-white text-xs p-3 rounded-xl border border-rose-800/50 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRejectingTx(null)}
                className="px-3 py-2 rounded-xl bg-purple-950 text-purple-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
