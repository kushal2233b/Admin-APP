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
      <div className="relative overflow-hidden rounded-2xl bg-[#141215] p-4 sm:p-6 border border-[#29252A] shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-[#1B181C] border border-[#C9A34E]/30 text-[#C9A34E]">
                <Trophy className="w-5 h-5" />
              </span>
              <h2 className="text-lg sm:text-xl font-black tracking-tight text-[#F5F5F5] flex items-center gap-2">
                RESULT REQUESTS
                {pendingCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-md shadow-amber-950 animate-pulse">
                    {pendingCount} PENDING
                  </span>
                )}
              </h2>
            </div>
            <p className="text-xs text-[#B0ACB0] max-w-2xl">
              Review match results submitted by Staff members before official publication. Verifying results automatically calculates rankings, credits prize winnings to players' wallets, and broadcasts live updates.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {onRefresh && (
              <button
                type="button"
                onClick={() => onRefresh()}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[#1B181C] hover:bg-[#FF3048] text-[#B0ACB0] hover:text-white border border-[#29252A] transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-[#C9A34E] ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh List'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Global Action Notifications */}
      {actionError && (
        <div className="p-3.5 rounded-xl bg-[#350A12] border border-[#E21B36]/50 text-[#FF3048] text-xs flex items-center justify-between gap-2 shadow-lg animate-in fade-in-50">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#FF3048] flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-[#FF3048] hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-[#350A12]/80 border border-[#C9A34E]/50 text-[#C9A34E] text-xs flex items-center justify-between gap-2 shadow-lg animate-in fade-in-50">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#C9A34E] flex-shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-[#C9A34E] hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Tabs & Search Bar Header */}
      <div className="bg-[#141215] p-3 rounded-2xl border border-[#29252A] space-y-3">
        {/* Top Tab Controls */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3.5 py-2 rounded-xl font-extrabold text-xs transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'pending'
                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black shadow-lg shadow-amber-950/50'
                : 'bg-[#1B181C] text-[#B0ACB0] hover:bg-[#29252A] hover:text-white border border-[#29252A]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Verification</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'pending' ? 'bg-black/30 text-black' : 'bg-[#141215] text-[#C9A34E]'
            }`}>
              {pendingCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('approved')}
            className={`px-3.5 py-2 rounded-xl font-extrabold text-xs transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'approved'
                ? 'bg-gradient-to-r from-[#C9A34E] via-amber-400 to-[#C9A34E] text-black shadow-lg shadow-amber-950/50'
                : 'bg-[#1B181C] text-[#B0ACB0] hover:bg-[#29252A] hover:text-white border border-[#29252A]'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Approved & Published</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'approved' ? 'bg-black/30 text-black' : 'bg-[#141215] text-[#C9A34E]'
            }`}>
              {approvedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rejected')}
            className={`px-3.5 py-2 rounded-xl font-extrabold text-xs transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'rejected'
                ? 'bg-[#E21B36] text-white shadow-lg shadow-rose-950/50'
                : 'bg-[#1B181C] text-[#B0ACB0] hover:bg-[#29252A] hover:text-white border border-[#29252A]'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Rejected</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'rejected' ? 'bg-black/40 text-white' : 'bg-rose-950/80 text-rose-300'
            }`}>
              {rejectedCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-2 rounded-xl font-extrabold text-xs transition flex items-center gap-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'all'
                ? 'bg-rose-950/80 text-white border border-rose-500/50 shadow-lg'
                : 'bg-[#1B181C] text-[#B0ACB0] hover:bg-[#29252A] hover:text-white border border-[#29252A]'
            }`}
          >
            <span>All Requests</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#141215] text-[#B0ACB0]">
              {requests.length}
            </span>
          </button>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1 border-t border-[#29252A]">
          <div className="sm:col-span-8 relative">
            <Search className="w-4 h-4 text-[#777278] absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Match Title, ID, Staff Name, Category..."
              className="w-full bg-[#171418] text-[#F5F5F5] text-xs pl-9 pr-3 py-2 rounded-xl border border-[#29252A] placeholder-[#777278] focus:border-[#C9A34E] focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-[#777278] hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="sm:col-span-4">
            <select
              value={selectedStaffFilter}
              onChange={(e) => setSelectedStaffFilter(e.target.value)}
              className="w-full bg-[#171418] text-[#B0ACB0] text-xs px-3 py-2 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none"
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
        <div className="p-8 sm:p-12 text-center rounded-2xl bg-[#141215] border border-[#29252A] space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#1B181C] border border-[#29252A] flex items-center justify-center mx-auto text-[#777278]">
            <Trophy className="w-6 h-6 text-[#777278]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#F5F5F5]">No Result Requests Found</h3>
            <p className="text-xs text-[#777278] max-w-md mx-auto">
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
                className={`p-4 rounded-2xl bg-[#141215] border transition-all duration-200 space-y-3.5 ${
                  isPending
                    ? 'border-[#C9A34E]/40 hover:border-[#C9A34E] shadow-lg shadow-amber-950/10'
                    : isApproved
                    ? 'border-[#29252A] hover:border-[#C9A34E]/40'
                    : 'border-[#350A12] hover:border-[#E21B36]/60'
                }`}
              >
                {/* Card Top Header Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#29252A] pb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-[#1B181C] border border-[#29252A] text-[#C9A34E]">
                      <Gamepad2 className="w-4 h-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-extrabold text-[#F5F5F5] flex items-center gap-2">
                        {req.matchTitle}
                        <span className="text-[10px] font-mono text-[#777278] font-normal">
                          (ID: {req.matchId})
                        </span>
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#B0ACB0] mt-0.5">
                        {req.matchCategory && (
                          <span className="px-1.5 py-0.5 rounded bg-[#1B181C] text-[#C9A34E] font-medium border border-[#29252A]">
                            {req.matchCategory}
                          </span>
                        )}
                        {req.matchType && (
                          <span className="px-1.5 py-0.5 rounded bg-[#1B181C] text-[#B0ACB0] font-medium border border-[#29252A]">
                            {req.matchType}
                          </span>
                        )}
                        {req.map && (
                          <span className="px-1.5 py-0.5 rounded bg-[#1B181C] text-[#B0ACB0] font-medium border border-[#29252A]">
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
                      <span className="px-3 py-1 rounded-full text-[11px] font-black bg-[#C9A34E] text-black flex items-center gap-1.5 shadow-md">
                        <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                        <span>APPROVED / PUBLISHED</span>
                      </span>
                    )}
                    {isRejected && (
                      <span className="px-3 py-1 rounded-full text-[11px] font-black bg-[#350A12] text-[#FF3048] border border-[#E21B36]/50 flex items-center gap-1.5 shadow-md">
                        <XCircle className="w-3.5 h-3.5 text-[#FF3048]" />
                        <span>REJECTED</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Main Info Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Submitted By Staff Info */}
                  <div className="p-2.5 rounded-xl bg-[#171418] border border-[#29252A] text-xs space-y-1">
                    <span className="text-[10px] uppercase font-bold text-[#777278] flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-[#C9A34E]" /> Submitted By Staff
                    </span>
                    <p className="font-bold text-[#F5F5F5] truncate">{req.submittedByStaffName}</p>
                    <p className="text-[10px] text-[#777278] truncate">
                      Submitted: {formatDateTime(req.submittedAt)}
                    </p>
                  </div>

                  {/* Results Summary */}
                  <div className="p-2.5 rounded-xl bg-[#171418] border border-[#29252A] text-xs space-y-1">
                    <span className="text-[10px] uppercase font-bold text-[#777278] flex items-center gap-1">
                      <Award className="w-3 h-3 text-[#C9A34E]" /> Result Summary
                    </span>
                    <p className="font-bold text-[#C9A34E] truncate">
                      🥇 #1 Winner: {winnerName}
                    </p>
                    <p className="text-[10px] text-[#B0ACB0]">
                      Players: <span className="text-[#F5F5F5] font-bold">{req.participantCount}</span> • Kills: <span className="text-[#F5F5F5] font-bold">{totalKills}</span>
                    </p>
                  </div>

                  {/* Financial & Prize Pool Summary */}
                  <div className="p-2.5 rounded-xl bg-[#171418] border border-[#29252A] text-xs space-y-1">
                    <span className="text-[10px] uppercase font-bold text-[#777278] flex items-center gap-1">
                      <DollarSign className="w-3 h-3 text-[#C9A34E]" /> Total Prize Distributed
                    </span>
                    <p className="font-extrabold text-[#C9A34E] text-sm">
                      ₹{totalPrize.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-[#777278]">
                      Entry Fee: ₹{req.entryFee || 0} • Prize Pool: ₹{req.prizePool || 0}
                    </p>
                  </div>
                </div>

                {/* Evidence / Proof Preview (if provided) */}
                {req.evidenceUrls && req.evidenceUrls.length > 0 && (
                  <div className="p-2.5 rounded-xl bg-[#171418] border border-[#29252A] flex items-center gap-2 overflow-x-auto">
                    <span className="text-[10px] uppercase font-bold text-[#777278] flex items-center gap-1 flex-shrink-0 mr-1">
                      <ImageIcon className="w-3.5 h-3.5 text-[#C9A34E]" /> Proof Screenshots ({req.evidenceUrls.length}):
                    </span>
                    <div className="flex items-center gap-2">
                      {req.evidenceUrls.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt={`Proof ${idx + 1}`}
                          onClick={() => setPreviewImageUrl(url)}
                          className="w-10 h-10 rounded-lg object-cover border border-[#29252A] hover:border-[#C9A34E] cursor-pointer transition active:scale-95 flex-shrink-0"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Rejection Reason display if rejected */}
                {isRejected && req.rejectionReason && (
                  <div className="p-3 rounded-xl bg-[#350A12]/40 border border-[#E21B36]/40 text-xs space-y-1 text-[#FF3048]">
                    <span className="font-bold text-[#FF3048] flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Rejection Reason:
                    </span>
                    <p className="italic text-[#B0ACB0] pl-4">"{req.rejectionReason}"</p>
                    {req.rejectedBy && (
                      <p className="text-[10px] text-[#777278] pl-4">
                        Rejected by {req.rejectedBy} on {formatDateTime(req.rejectedAt)}
                      </p>
                    )}
                  </div>
                )}

                {/* Card Action Buttons */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#29252A]">
                  <button
                    type="button"
                    onClick={() => setViewingRequest(req)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-[#1B181C] text-[#B0ACB0] hover:text-white hover:bg-[#29252A] border border-[#29252A] transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#C9A34E]" />
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
                        className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white border border-rose-500/80 transition active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-md shadow-rose-950/40"
                      >
                        <X className="w-3.5 h-3.5 text-white" />
                        <span>REJECT</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmApproveRequest(req)}
                        className="px-4 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:from-amber-400 hover:to-amber-500 transition active:scale-95 shadow-md shadow-amber-950 flex items-center gap-1.5 cursor-pointer"
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
          <div className="bg-[#141215] border border-[#29252A] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#29252A] flex items-center justify-between bg-[#1B181C]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#141215] border border-[#C9A34E]/30 flex items-center justify-center text-[#C9A34E]">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#F5F5F5] flex items-center gap-2">
                    {viewingRequest.matchTitle}
                  </h3>
                  <p className="text-[11px] text-[#B0ACB0]">
                    Match ID: <span className="font-mono text-[#C9A34E] font-bold">{viewingRequest.matchId}</span> • Submitted by {viewingRequest.submittedByStaffName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingRequest(null)}
                className="p-1.5 rounded-lg text-[#777278] hover:text-white bg-[#141215] border border-[#29252A] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content Scrollable Area */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 custom-scrollbar flex-1">
              {/* Submission Metadata Overview Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#171418] p-3 rounded-xl border border-[#29252A] text-xs">
                <div>
                  <span className="text-[10px] text-[#777278] uppercase font-bold block">Status</span>
                  <span className="font-bold text-[#C9A34E]">{viewingRequest.status}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#777278] uppercase font-bold block">Submitted At</span>
                  <span className="font-semibold text-[#F5F5F5]">{formatDateTime(viewingRequest.submittedAt)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#777278] uppercase font-bold block">Entry / Prize</span>
                  <span className="font-semibold text-[#C9A34E]">₹{viewingRequest.entryFee || 0} / ₹{viewingRequest.prizePool || 0}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#777278] uppercase font-bold block">Total Players</span>
                  <span className="font-bold text-[#F5F5F5]">{viewingRequest.participantCount}</span>
                </div>
              </div>

              {/* Proof Notes / Evidence screenshots if present */}
              {viewingRequest.proofNotes && (
                <div className="p-3 rounded-xl bg-[#171418] border border-[#29252A] text-xs space-y-1">
                  <span className="font-bold text-[#C9A34E] uppercase text-[10px] flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" /> Staff Notes:
                  </span>
                  <p className="text-[#B0ACB0]">{viewingRequest.proofNotes}</p>
                </div>
              )}

              {viewingRequest.evidenceUrls && viewingRequest.evidenceUrls.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-[#B0ACB0] uppercase tracking-wider flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-[#C9A34E]" /> Screenshot Proof & Evidence ({viewingRequest.evidenceUrls.length})
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {viewingRequest.evidenceUrls.map((url, idx) => (
                      <div
                        key={idx}
                        onClick={() => setPreviewImageUrl(url)}
                        className="group relative rounded-xl overflow-hidden border border-[#29252A] hover:border-[#C9A34E] cursor-pointer transition active:scale-95 bg-black h-28"
                      >
                        <img src={url} alt={`Evidence ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-[#C9A34E] font-bold text-xs">
                          <Eye className="w-4 h-4 mr-1" /> Enlarge
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Player Rankings Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[#C9A34E] uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[#C9A34E]" /> Submitted Player Rankings & Kills ({viewingRequest.participantResults.length})
                </h4>

                <div className="rounded-xl border border-[#29252A] overflow-x-auto bg-[#171418]">
                  <table className="w-full text-left text-xs text-[#B0ACB0]">
                    <thead className="bg-[#1B181C] text-[#B0ACB0] font-bold text-[10px] uppercase border-b border-[#29252A]">
                      <tr>
                        <th className="p-2.5">Rank</th>
                        <th className="p-2.5">Player / Username</th>
                        <th className="p-2.5">In-game IGN</th>
                        <th className="p-2.5 text-center">Kills</th>
                        <th className="p-2.5 text-right">Prize Won (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#29252A]">
                      {viewingRequest.participantResults.map((p, idx) => {
                        const isFirst = (p.rank || idx + 1) === 1;
                        const isSecond = (p.rank || idx + 1) === 2;
                        const isThird = (p.rank || idx + 1) === 3;

                        return (
                          <tr
                            key={idx}
                            className={`hover:bg-[#1B181C] transition ${
                              isFirst ? 'bg-[#C9A34E]/10 font-bold' : ''
                            }`}
                          >
                            <td className="p-2.5 font-extrabold">
                              {isFirst ? (
                                <span className="text-[#C9A34E] flex items-center gap-1">🥇 1st</span>
                              ) : isSecond ? (
                                <span className="text-[#B0ACB0] flex items-center gap-1">🥈 2nd</span>
                              ) : isThird ? (
                                <span className="text-amber-600 flex items-center gap-1">🥉 3rd</span>
                              ) : (
                                `#${p.rank || idx + 1}`
                              )}
                            </td>
                            <td className="p-2.5 font-semibold text-[#F5F5F5]">
                              {p.username || p.displayName || 'Player'}
                            </td>
                            <td className="p-2.5 font-extrabold text-[#C9A34E]">
                              {p.inGameName || p.gameIgn || 'N/A'}
                            </td>
                            <td className="p-2.5 text-center font-bold text-[#F5F5F5]">
                              {p.kills || 0}
                            </td>
                            <td className="p-2.5 text-right font-extrabold text-[#C9A34E]">
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
            <div className="p-4 border-t border-[#29252A] flex flex-wrap items-center justify-between gap-2 bg-[#1B181C]">
              <button
                type="button"
                onClick={() => setViewingRequest(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#B0ACB0] hover:text-white bg-[#141215] border border-[#29252A] cursor-pointer"
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
                    className="px-4 py-2 rounded-xl text-xs font-black bg-rose-600 hover:bg-rose-500 text-white border border-rose-500 transition active:scale-95 cursor-pointer shadow-md shadow-rose-950/40"
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
                    className="px-5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:from-amber-400 hover:to-amber-500 shadow-lg shadow-amber-950 transition active:scale-95 cursor-pointer"
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
          <div className="bg-[#141215] border border-[#C9A34E]/50 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1B181C] border border-[#C9A34E]/50 flex items-center justify-center text-[#C9A34E] flex-shrink-0">
                <CheckCircle2 className="w-6 h-6 text-[#C9A34E]" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#F5F5F5]">Publish this result?</h3>
                <p className="text-xs text-[#B0ACB0]">
                  This will make the submitted result official and visible to users.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#171418] border border-[#29252A] text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#777278]">Match:</span>
                <span className="font-bold text-[#F5F5F5]">{confirmApproveRequest.matchTitle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#777278]">Total Players:</span>
                <span className="font-bold text-[#C9A34E]">{confirmApproveRequest.participantCount}</span>
              </div>
              <div className="flex justify-between border-t border-[#29252A] pt-1.5">
                <span className="text-[#777278]">Total Winnings to Credit:</span>
                <span className="font-extrabold text-[#C9A34E]">
                  ₹{confirmApproveRequest.participantResults.reduce((s, p) => s + (p.prizeWon || 0), 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setConfirmApproveRequest(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#B0ACB0] hover:text-white bg-[#1B181C] border border-[#29252A] disabled:opacity-50 cursor-pointer"
              >
                CANCEL
              </button>

              <button
                type="button"
                disabled={isProcessing}
                onClick={handleConfirmApprove}
                className="px-5 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:from-amber-400 hover:to-amber-500 shadow-lg shadow-amber-950/60 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
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
          <div className="bg-[#141215] border border-[#E21B36]/50 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#350A12] border border-[#E21B36]/60 flex items-center justify-center text-[#FF3048]">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-[#F5F5F5]">Reject Result Request</h3>
                  <p className="text-xs text-[#B0ACB0]">{rejectingRequest.matchTitle}</p>
                </div>
              </div>
              <button
                onClick={() => setRejectingRequest(null)}
                className="text-[#777278] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#B0ACB0]">
                Rejection Reason <span className="text-[#FF3048]">*</span>
              </label>
              <textarea
                rows={3}
                value={rejectionReasonInput}
                onChange={(e) => setRejectionReasonInput(e.target.value)}
                placeholder="e.g. Result contains incorrect placement information or missing kill screenshot proof."
                className="w-full bg-[#171418] text-[#F5F5F5] text-xs p-3 rounded-xl border border-[#29252A] focus:border-[#FF3048] focus:outline-none placeholder-[#777278]"
              />
              <p className="text-[10px] text-[#777278]">
                Staff member <span className="text-[#F5F5F5] font-bold">{rejectingRequest.submittedByStaffName}</span> will be able to review this reason, correct the results, and resubmit for verification.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setRejectingRequest(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-[#B0ACB0] hover:text-white bg-[#1B181C] border border-[#29252A] disabled:opacity-50 cursor-pointer"
              >
                CANCEL
              </button>

              <button
                type="button"
                disabled={isProcessing || !rejectionReasonInput.trim()}
                onClick={handleConfirmReject}
                className="px-5 py-2 rounded-xl text-xs font-black bg-[#E21B36] hover:bg-[#FF3048] text-white shadow-lg shadow-rose-950 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
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
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-[#29252A]">
            <button
              onClick={() => setPreviewImageUrl(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/70 text-white hover:bg-black cursor-pointer"
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
