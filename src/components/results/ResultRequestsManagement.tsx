import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ResultRequest, ResultRequestStatus, Tournament } from '../../types';
import {
  Trophy,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  Eye,
  Check,
  X,
  AlertCircle,
  FileText,
  UserCheck,
  Sparkles,
  Calendar,
  Gamepad2,
  ShieldCheck,
  RefreshCw,
  Image as ImageIcon,
  ChevronRight,
  Award,
  DollarSign
} from 'lucide-react';

interface ResultRequestsManagementProps {
  requests: ResultRequest[];
  tournaments: Tournament[];
  onApproveAndPublish: (requestId: string) => Promise<void>;
  onRejectRequest: (requestId: string, reason: string) => Promise<void>;
  onRefresh?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

export const ResultRequestsManagement: React.FC<ResultRequestsManagementProps> = ({
  requests = [],
  tournaments = [],
  onApproveAndPublish,
  onRejectRequest,
  onRefresh,
  isRefreshing = false
}) => {
  const { currentUser, isSuperAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('all');
  
  // Modals state
  const [viewingRequest, setViewingRequest] = useState<ResultRequest | null>(null);
  const [confirmApproveRequest, setConfirmApproveRequest] = useState<ResultRequest | null>(null);
  const [rejectingRequest, setRejectingRequest] = useState<ResultRequest | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  
  // Image lightbox preview modal
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filtered staff list for dropdown filter
  const uniqueStaffList = useMemo(() => {
    const map = new Map<string, string>();
    requests.forEach(r => {
      if (r.submittedByStaffId && r.submittedByStaffName) {
        map.set(r.submittedByStaffId, r.submittedByStaffName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [requests]);

  // Tab counts
  const pendingCount = useMemo(() => requests.filter(r => r.status === 'PENDING').length, [requests]);
  const approvedCount = useMemo(() => requests.filter(r => r.status === 'APPROVED').length, [requests]);
  const rejectedCount = useMemo(() => requests.filter(r => r.status === 'REJECTED').length, [requests]);

  // Filtered requests list
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      // 1. Status tab filter
      if (activeTab === 'pending' && req.status !== 'PENDING') return false;
      if (activeTab === 'approved' && req.status !== 'APPROVED') return false;
      if (activeTab === 'rejected' && req.status !== 'REJECTED') return false;

      // 2. Staff filter
      if (selectedStaffFilter !== 'all' && req.submittedByStaffId !== selectedStaffFilter) return false;

      // 3. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = (req.matchTitle || '').toLowerCase();
        const matchId = (req.matchId || '').toLowerCase();
        const reqId = (req.id || '').toLowerCase();
        const staffName = (req.submittedByStaffName || '').toLowerCase();
        const staffId = (req.submittedByStaffId || '').toLowerCase();
        const category = (req.matchCategory || '').toLowerCase();

        return (
          matchTitle.includes(q) ||
          matchId.includes(q) ||
          reqId.includes(q) ||
          staffName.includes(q) ||
          staffId.includes(q) ||
          category.includes(q)
        );
      }

      return true;
    });
  }, [requests, activeTab, selectedStaffFilter, searchQuery]);

  // Handle Approve Action
  const handleConfirmApprove = async () => {
    if (!confirmApproveRequest) return;
    setIsProcessing(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await onApproveAndPublish(confirmApproveRequest.id);
      setActionSuccess(`Successfully approved and published result for "${confirmApproveRequest.matchTitle}". Winnings credited to players!`);
      setConfirmApproveRequest(null);
      if (viewingRequest?.id === confirmApproveRequest.id) {
        setViewingRequest(null);
      }
    } catch (err: any) {
      console.error('[ResultRequests] Approve error:', err);
      setActionError(err?.message || 'Failed to approve and publish match result.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle Reject Action
  const handleConfirmReject = async () => {
    if (!rejectingRequest) return;
    if (!rejectionReasonInput.trim()) {
      setActionError('Please enter a rejection reason before proceeding.');
      return;
    }

    setIsProcessing(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      await onRejectRequest(rejectingRequest.id, rejectionReasonInput.trim());
      setActionSuccess(`Result request for "${rejectingRequest.matchTitle}" has been rejected. Staff notified for correction.`);
      setRejectingRequest(null);
      setRejectionReasonInput('');
      if (viewingRequest?.id === rejectingRequest.id) {
        setViewingRequest(null);
      }
    } catch (err: any) {
      console.error('[ResultRequests] Reject error:', err);
      setActionError(err?.message || 'Failed to reject match result request.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-5 max-w-7xl mx-auto pb-20">
      {/* Top Banner Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#171138] via-[#1E174A] to-[#120D2D] p-4 sm:p-6 border border-purple-800/40 shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Trophy className="w-5 h-5" />
              </span>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
                RESULT REQUESTS
                {pendingCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-md shadow-amber-950 animate-pulse">
                    {pendingCount} PENDING
                  </span>
                )}
              </h2>
            </div>
            <p className="text-xs text-purple-300/80 max-w-2xl">
              Review match results submitted by Staff members before official publication. Verifying results automatically calculates rankings, credits prize winnings to players' wallets, and broadcasts live updates.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {onRefresh && (
              <button
                type="button"
                onClick={() => onRefresh()}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#241A52] hover:bg-[#2E2266] text-purple-200 border border-purple-700/40 transition active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh List'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Global Action Notifications */}
      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-500/50 text-rose-200 text-xs flex items-center justify-between gap-2 shadow-lg animate-in fade-in-50">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-rose-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs flex items-center justify-between gap-2 shadow-lg animate-in fade-in-50">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Tabs & Search Bar Header */}
      <div className="bg-[#120F26] p-3 rounded-2xl border border-purple-900/40 space-y-3">
        {/* Top Tab Controls */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3.5 py-2 rounded-xl font-extrabold text-xs transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'pending'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-lg shadow-amber-950/50'
                : 'bg-[#181335] text-purple-300 hover:bg-[#201A47] hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Verification</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'pending' ? 'bg-black/30 text-black' : 'bg-purple-900/60 text-amber-300'
            }`}>
              {pendingCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('approved')}
            className={`px-3.5 py-2 rounded-xl font-extrabold text-xs transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'approved'
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-black shadow-lg shadow-emerald-950/50'
                : 'bg-[#181335] text-purple-300 hover:bg-[#201A47] hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Approved & Published</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'approved' ? 'bg-black/30 text-black' : 'bg-emerald-900/60 text-emerald-300'
            }`}>
              {approvedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rejected')}
            className={`px-3.5 py-2 rounded-xl font-extrabold text-xs transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'rejected'
                ? 'bg-gradient-to-r from-rose-600 to-rose-700 text-white shadow-lg shadow-rose-950/50'
                : 'bg-[#181335] text-purple-300 hover:bg-[#201A47] hover:text-white'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Rejected</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'rejected' ? 'bg-black/30 text-white' : 'bg-rose-950 text-rose-300'
            }`}>
              {rejectedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-2 rounded-xl font-extrabold text-xs transition flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-purple-800 text-white shadow-lg shadow-purple-950'
                : 'bg-[#181335] text-purple-300 hover:bg-[#201A47] hover:text-white'
            }`}
          >
            <span>All Requests</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-900/60 text-purple-200">
              {requests.length}
            </span>
          </button>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1 border-t border-purple-900/30">
          <div className="sm:col-span-8 relative">
            <Search className="w-4 h-4 text-purple-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Match Title, ID, Staff Name, Category..."
              className="w-full bg-[#1A143A] text-white text-xs pl-9 pr-3 py-2 rounded-xl border border-purple-800/40 focus:border-amber-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-purple-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="sm:col-span-4">
            <select
              value={selectedStaffFilter}
              onChange={(e) => setSelectedStaffFilter(e.target.value)}
              className="w-full bg-[#1A143A] text-purple-200 text-xs px-3 py-2 rounded-xl border border-purple-800/40 focus:border-amber-400 focus:outline-none"
            >
              <option value="all">Filter by Staff (All)</option>
              {uniqueStaffList.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Request Cards List */}
      {filteredRequests.length === 0 ? (
        <div className="p-8 sm:p-12 text-center rounded-2xl bg-[#120F26] border border-purple-900/30 space-y-3">
          <div className="w-12 h-12 rounded-full bg-purple-950 border border-purple-800 flex items-center justify-center mx-auto text-purple-400">
            <Trophy className="w-6 h-6 text-purple-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-white">No Result Requests Found</h3>
            <p className="text-xs text-purple-400 max-w-md mx-auto">
              {activeTab === 'pending'
                ? 'There are currently no pending result verification requests from Staff.'
                : 'No match result requests match your current filters.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredRequests.map((req) => {
            const isPending = req.status === 'PENDING';
            const isApproved = req.status === 'APPROVED';
            const isRejected = req.status === 'REJECTED';

            const winnerName = req.resultSummary?.winnerName || (req.participantResults?.[0]?.username || req.participantResults?.[0]?.inGameName || 'N/A');
            const totalKills = req.resultSummary?.totalKills ?? req.participantResults.reduce((sum, p) => sum + (p.kills || 0), 0);
            const totalPrize = req.resultSummary?.totalPrizeDistributed ?? req.participantResults.reduce((sum, p) => sum + (p.prizeWon || 0), 0);

            return (
              <div
                key={req.id}
                className={`p-4 rounded-2xl bg-[#14102D] border transition-all duration-200 space-y-3.5 ${
                  isPending
                    ? 'border-amber-500/40 hover:border-amber-400 shadow-lg shadow-amber-950/10'
                    : isApproved
                    ? 'border-emerald-500/30 hover:border-emerald-400/50'
                    : 'border-rose-900/50 hover:border-rose-700/60'
                }`}
              >
                {/* Card Top Header Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-900/40 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-purple-950 border border-purple-800/60 text-amber-400">
                      <Gamepad2 className="w-4 h-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                        {req.matchTitle}
                        <span className="text-[10px] font-mono text-purple-400 font-normal">
                          (ID: {req.matchId})
                        </span>
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-purple-300/80 mt-0.5">
                        {req.matchCategory && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-900/50 text-amber-300 font-medium">
                            {req.matchCategory}
                          </span>
                        )}
                        {req.matchType && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-200 font-medium">
                            {req.matchType}
                          </span>
                        )}
                        {req.map && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-900/50 text-purple-200 font-medium">
                            Map: {req.map}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    {isPending && (
                      <span className="px-3 py-1 rounded-full text-[11px] font-black bg-gradient-to-r from-amber-500 to-amber-600 text-black flex items-center gap-1.5 shadow-md shadow-amber-950/40 animate-pulse">
                        <Clock className="w-3.5 h-3.5 text-black" />
                        <span>PENDING VERIFICATION</span>
                      </span>
                    )}
                    {isApproved && (
                      <span className="px-3 py-1 rounded-full text-[11px] font-black bg-gradient-to-r from-emerald-500 to-emerald-600 text-black flex items-center gap-1.5 shadow-md shadow-emerald-950/40">
                        <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                        <span>APPROVED / PUBLISHED</span>
                      </span>
                    )}
                    {isRejected && (
                      <span className="px-3 py-1 rounded-full text-[11px] font-black bg-rose-950 text-rose-300 border border-rose-600/50 flex items-center gap-1.5 shadow-md">
                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                        <span>REJECTED</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Main Info Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Submitted By Staff Info */}
                  <div className="p-2.5 rounded-xl bg-[#0E0A21] border border-purple-900/40 text-xs space-y-1">
                    <span className="text-[10px] uppercase font-bold text-purple-400 flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-amber-400" /> Submitted By Staff
                    </span>
                    <p className="font-bold text-white truncate">{req.submittedByStaffName}</p>
                    <p className="text-[10px] text-purple-300/70 truncate">
                      Submitted: {formatDateTime(req.submittedAt)}
                    </p>
                  </div>

                  {/* Results Summary */}
                  <div className="p-2.5 rounded-xl bg-[#0E0A21] border border-purple-900/40 text-xs space-y-1">
                    <span className="text-[10px] uppercase font-bold text-purple-400 flex items-center gap-1">
                      <Award className="w-3 h-3 text-amber-400" /> Result Summary
                    </span>
                    <p className="font-bold text-amber-300 truncate">
                      🥇 #1 Winner: {winnerName}
                    </p>
                    <p className="text-[10px] text-purple-200">
                      Players: <span className="text-white font-bold">{req.participantCount}</span> • Kills: <span className="text-white font-bold">{totalKills}</span>
                    </p>
                  </div>

                  {/* Financial & Prize Pool Summary */}
                  <div className="p-2.5 rounded-xl bg-[#0E0A21] border border-purple-900/40 text-xs space-y-1">
                    <span className="text-[10px] uppercase font-bold text-purple-400 flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-emerald-400" /> Total Prize Distributed
                    </span>
                    <p className="font-extrabold text-emerald-400 text-sm">
                      ₹{totalPrize.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-purple-300/70">
                      Entry Fee: ₹{req.entryFee || 0} • Prize Pool: ₹{req.prizePool || 0}
                    </p>
                  </div>
                </div>

                {/* Evidence / Proof Preview (if provided) */}
                {req.evidenceUrls && req.evidenceUrls.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-[#0B081B] border border-purple-950/60 flex items-center gap-2 overflow-x-auto">
                    <span className="text-[10px] uppercase font-bold text-purple-400 flex items-center gap-1 flex-shrink-0 mr-1">
                      <ImageIcon className="w-3.5 h-3.5 text-amber-400" /> Proof Screenshots ({req.evidenceUrls.length}):
                    </span>
                    <div className="flex items-center gap-2">
                      {req.evidenceUrls.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt={`Proof ${idx + 1}`}
                          onClick={() => setPreviewImageUrl(url)}
                          className="w-10 h-10 rounded-lg object-cover border border-purple-700/50 hover:border-amber-400 cursor-pointer transition active:scale-95 flex-shrink-0"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Rejection Reason display if rejected */}
                {isRejected && req.rejectionReason && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-900/60 text-xs space-y-1 text-rose-200">
                    <span className="font-bold text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Rejection Reason:
                    </span>
                    <p className="italic text-purple-200 pl-4">"{req.rejectionReason}"</p>
                    {req.rejectedBy && (
                      <p className="text-[10px] text-purple-400/80 pl-4">
                        Rejected by {req.rejectedBy} on {formatDateTime(req.rejectedAt)}
                      </p>
                    )}
                  </div>
                )}

                {/* Card Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-purple-900/30">
                  <button
                    type="button"
                    onClick={() => setViewingRequest(req)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-[#1D173F] text-purple-200 hover:text-white hover:bg-[#282054] border border-purple-700/40 transition active:scale-95 flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                    <span>VIEW RESULT</span>
                  </button>

                  {isPending && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingRequest(req);
                          setRejectionReasonInput('');
                        }}
                        className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-rose-950 text-rose-300 hover:bg-rose-900 hover:text-white border border-rose-800/60 transition active:scale-95 flex items-center gap-1.5"
                      >
                        <X className="w-3.5 h-3.5 text-rose-400" />
                        <span>REJECT</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmApproveRequest(req)}
                        className="px-4 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:from-amber-400 hover:to-amber-500 transition active:scale-95 shadow-md shadow-amber-950 flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4 text-black" />
                        <span>APPROVE & PUBLISH</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================================
          MODAL 1: DETAILED VIEW RESULT MODAL
         ========================================================================= */}
      {viewingRequest && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-[#120D29] border border-purple-800/60 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 border-b border-purple-900/50 flex items-center justify-between bg-gradient-to-r from-purple-950/80 to-transparent">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    {viewingRequest.matchTitle}
                  </h3>
                  <p className="text-[11px] text-purple-300/80">
                    Match ID: <span className="font-mono text-amber-300 font-bold">{viewingRequest.matchId}</span> • Submitted by {viewingRequest.submittedByStaffName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingRequest(null)}
                className="p-1.5 rounded-lg text-purple-400 hover:text-white bg-purple-950/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Scrollable Area */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 custom-scrollbar flex-1">
              {/* Submission Metadata Overview Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#0D091F] p-3 rounded-xl border border-purple-950/80 text-xs">
                <div>
                  <span className="text-[10px] text-purple-400 uppercase font-bold block">Status</span>
                  <span className="font-bold text-amber-300">{viewingRequest.status}</span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-400 uppercase font-bold block">Submitted At</span>
                  <span className="font-semibold text-white">{formatDateTime(viewingRequest.submittedAt)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-400 uppercase font-bold block">Entry / Prize</span>
                  <span className="font-semibold text-emerald-400">₹{viewingRequest.entryFee || 0} / ₹{viewingRequest.prizePool || 0}</span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-400 uppercase font-bold block">Total Players</span>
                  <span className="font-bold text-white">{viewingRequest.participantCount}</span>
                </div>
              </div>

              {/* Proof Notes / Evidence screenshots if present */}
              {viewingRequest.proofNotes && (
                <div className="p-3 rounded-xl bg-[#090616] border border-purple-900/40 text-xs space-y-1">
                  <span className="font-bold text-amber-400 uppercase text-[10px] flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> Staff Notes:
                  </span>
                  <p className="text-purple-200">{viewingRequest.proofNotes}</p>
                </div>
              )}

              {viewingRequest.evidenceUrls && viewingRequest.evidenceUrls.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-amber-400" /> Screenshot Proof & Evidence ({viewingRequest.evidenceUrls.length})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {viewingRequest.evidenceUrls.map((url, idx) => (
                      <div
                        key={idx}
                        onClick={() => setPreviewImageUrl(url)}
                        className="group relative rounded-xl overflow-hidden border border-purple-800/50 hover:border-amber-400 cursor-pointer transition active:scale-95 bg-black h-28"
                      >
                        <img src={url} alt={`Evidence ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-amber-300 font-bold text-xs">
                          <Eye className="w-4 h-4 mr-1" /> Enlarge
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Player Rankings Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-amber-400" /> Submitted Player Rankings & Kills ({viewingRequest.participantResults.length})
                </h4>

                <div className="rounded-xl border border-purple-900/50 overflow-x-auto bg-[#0A071B]">
                  <table className="w-full text-left text-xs text-purple-200">
                    <thead className="bg-[#18123A] text-purple-300 font-bold text-[10px] uppercase border-b border-purple-900/40">
                      <tr>
                        <th className="p-2.5">Rank</th>
                        <th className="p-2.5">Player / Username</th>
                        <th className="p-2.5">Game UID</th>
                        <th className="p-2.5">In-game IGN</th>
                        <th className="p-2.5 text-center">Kills</th>
                        <th className="p-2.5 text-right">Prize Won (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-950">
                      {viewingRequest.participantResults.map((p, idx) => {
                        const isFirst = (p.rank || idx + 1) === 1;
                        const isSecond = (p.rank || idx + 1) === 2;
                        const isThird = (p.rank || idx + 1) === 3;

                        return (
                          <tr
                            key={idx}
                            className={`hover:bg-purple-950/40 ${
                              isFirst ? 'bg-amber-500/10 font-bold' : ''
                            }`}
                          >
                            <td className="p-2.5 font-extrabold">
                              {isFirst ? (
                                <span className="text-amber-400 flex items-center gap-1">🥇 1st</span>
                              ) : isSecond ? (
                                <span className="text-slate-300 flex items-center gap-1">🥈 2nd</span>
                              ) : isThird ? (
                                <span className="text-amber-700 flex items-center gap-1">🥉 3rd</span>
                              ) : (
                                `#${p.rank || idx + 1}`
                              )}
                            </td>
                            <td className="p-2.5 font-semibold text-white">
                              {p.username || p.displayName || 'Player'}
                            </td>
                            <td className="p-2.5 font-mono text-purple-300">
                              {p.inGameId || p.gameUid || 'N/A'}
                            </td>
                            <td className="p-2.5 font-extrabold text-amber-200">
                              {p.inGameName || p.gameIgn || 'N/A'}
                            </td>
                            <td className="p-2.5 text-center font-bold text-purple-100">
                              {p.kills || 0}
                            </td>
                            <td className="p-2.5 text-right font-extrabold text-emerald-400">
                              ₹{(p.prizeWon || 0).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Bottom Actions Footer */}
            <div className="p-4 border-t border-purple-900/50 flex flex-wrap items-center justify-between gap-2 bg-[#0E0B21]">
              <button
                type="button"
                onClick={() => setViewingRequest(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-purple-300 hover:text-white bg-purple-950/60 border border-purple-800/40"
              >
                Close
              </button>

              {viewingRequest.status === 'PENDING' && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const req = viewingRequest;
                      setViewingRequest(null);
                      setRejectingRequest(req);
                      setRejectionReasonInput('');
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold bg-rose-950 text-rose-300 hover:bg-rose-900 hover:text-white border border-rose-800/60 transition active:scale-95"
                  >
                    REJECT RESULT
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const req = viewingRequest;
                      setViewingRequest(null);
                      setConfirmApproveRequest(req);
                    }}
                    className="px-5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:from-amber-400 hover:to-amber-500 shadow-lg shadow-amber-950 transition active:scale-95"
                  >
                    APPROVE & PUBLISH RESULT
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: CONFIRM APPROVE & PUBLISH DIALOG
         ========================================================================= */}
      {confirmApproveRequest && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#150F33] border border-amber-500/50 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 flex-shrink-0">
                <CheckCircle2 className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Publish this result?</h3>
                <p className="text-xs text-purple-300/80">
                  This will make the submitted result official and visible to users.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0B081C] border border-purple-900/50 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-purple-400">Match:</span>
                <span className="font-bold text-white">{confirmApproveRequest.matchTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-400">Total Players:</span>
                <span className="font-bold text-amber-300">{confirmApproveRequest.participantCount}</span>
              </div>
              <div className="flex justify-between border-t border-purple-900/40 pt-1.5">
                <span className="text-purple-400">Total Winnings to Credit:</span>
                <span className="font-extrabold text-emerald-400">
                  ₹{confirmApproveRequest.participantResults.reduce((s, p) => s + (p.prizeWon || 0), 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setConfirmApproveRequest(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-purple-300 hover:text-white bg-purple-950 border border-purple-800/40 disabled:opacity-50"
              >
                CANCEL
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmApprove}
                className="px-5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:from-amber-400 hover:to-amber-500 shadow-lg shadow-amber-950/60 disabled:opacity-50 flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                    <span>PUBLISHING...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 text-black" />
                    <span>APPROVE & PUBLISH</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: REJECT RESULT DIALOG (WITH REASON INPUT)
         ========================================================================= */}
      {rejectingRequest && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#160E35] border border-rose-500/50 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-950 border border-rose-700/60 flex items-center justify-center text-rose-400">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Reject Result Request</h3>
                  <p className="text-xs text-purple-300/80">{rejectingRequest.matchTitle}</p>
                </div>
              </div>
              <button
                onClick={() => setRejectingRequest(null)}
                className="text-purple-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-purple-300">
                Rejection Reason <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={3}
                value={rejectionReasonInput}
                onChange={(e) => setRejectionReasonInput(e.target.value)}
                placeholder="e.g. Result contains incorrect placement information or missing kill screenshot proof."
                className="w-full bg-[#0D0824] text-white text-xs p-3 rounded-xl border border-purple-800/60 focus:border-rose-400 focus:outline-none placeholder-purple-400/50"
              />
              <p className="text-[10px] text-purple-400">
                Staff member <span className="text-white font-bold">{rejectingRequest.submittedByStaffName}</span> will be able to review this reason, correct the results, and resubmit for verification.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setRejectingRequest(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-purple-300 hover:text-white bg-purple-950 border border-purple-800/40 disabled:opacity-50"
              >
                CANCEL
              </button>

              <button
                type="button"
                disabled={isProcessing || !rejectionReasonInput.trim()}
                onClick={handleConfirmReject}
                className="px-5 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950 disabled:opacity-50 flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>REJECTING...</span>
                  </>
                ) : (
                  <>
                    <X className="w-4 h-4 text-white" />
                    <span>REJECT RESULT</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: IMAGE LIGHTBOX ENLARGE PREVIEW
         ========================================================================= */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-purple-800/60">
            <button
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/70 text-white hover:bg-black"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={previewImageUrl} alt="Enlarged Proof" className="max-w-full max-h-[85vh] object-contain mx-auto" />
          </div>
        </div>
      )}
    </div>
  );
};
