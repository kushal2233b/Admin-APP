import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  UserCheck,
  UserPlus,
  Users,
  Search,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  CheckCircle2,
  X,
  AlertTriangle,
  RefreshCw,
  Eye,
  Lock,
  Ban,
  Gamepad2,
  Mail,
  Phone,
  Calendar,
  Clock,
  ChevronRight,
  Info,
  Check,
  Slash,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AppUser, StaffMember, StaffStatus } from '../../types';
import {
  fetchStaffMembersFromSupabase,
  createStaffMemberInSupabase,
  suspendStaffMemberInSupabase,
  reactivateStaffMemberInSupabase,
  removeStaffMemberInSupabase,
  formatStaffError
} from '../../services/supabaseService';

interface StaffManagementProps {
  users?: AppUser[];
  staffList?: any[];
  onAddStaff?: (staff: any) => Promise<void> | void;
  onUpdateStaffStatus?: (uid: string, status: 'active' | 'inactive') => void;
  onDeleteStaff?: (uid: string) => void;
}

export const StaffManagement: React.FC<StaffManagementProps> = ({
  users = [],
}) => {
  const { currentUser, isSuperAdmin } = useAuth();

  // State
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | StaffStatus>('ALL');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedUserForStaff, setSelectedUserForStaff] = useState<AppUser | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [createResult, setCreateResult] = useState<{ staffId: string; user: AppUser } | null>(null);

  // Details Modal
  const [selectedStaffDetails, setSelectedStaffDetails] = useState<StaffMember | null>(null);

  // Action Modals (Suspend, Reactivate, Remove)
  const [staffToSuspend, setStaffToSuspend] = useState<StaffMember | null>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [isSuspending, setIsSuspending] = useState(false);

  const [staffToReactivate, setStaffToReactivate] = useState<StaffMember | null>(null);
  const [isReactivating, setIsReactivating] = useState(false);

  const [staffToRemove, setStaffToRemove] = useState<StaffMember | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);

  // Load Staff Members via get_staff_members RPC
  const loadStaffMembers = useCallback(async (showRefreshIndicator = false) => {
    if (!isSuperAdmin) {
      setLoading(false);
      return;
    }

    if (showRefreshIndicator) setIsRefreshing(true);
    else setLoading(true);
    setActionError(null);

    try {
      const data = await fetchStaffMembersFromSupabase();
      setStaffMembers(data || []);
    } catch (err: any) {
      console.error('[StaffManagement] Failed to load staff:', err);
      setActionError(formatStaffError(err));
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadStaffMembers();
  }, [loadStaffMembers]);

  // Statistics Summary
  const stats = useMemo(() => {
    const total = staffMembers.length;
    const active = staffMembers.filter((s) => s.status === 'ACTIVE').length;
    const suspended = staffMembers.filter((s) => s.status === 'SUSPENDED').length;
    const removed = staffMembers.filter((s) => s.status === 'REMOVED').length;
    return { total, active, suspended, removed };
  }, [staffMembers]);

  // Filtered Staff List
  const filteredStaff = useMemo(() => {
    return staffMembers.filter((member) => {
      // Status Filter
      if (statusFilter !== 'ALL' && member.status !== statusFilter) {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameMatch = (member.name || '').toLowerCase().includes(query) || (member.displayName || '').toLowerCase().includes(query);
        const staffIdMatch = (member.staffId || member.staff_id || member.id || '').toLowerCase().includes(query);
        const emailMatch = (member.email || '').toLowerCase().includes(query);
        const phoneMatch = (member.phone || '').toLowerCase().includes(query);
        const ffUidMatch = (member.ffUid || member.ff_uid || member.inGameId || '').toLowerCase().includes(query);
        const ffIgnMatch = (member.ffIgn || member.ff_ign || member.inGameName || '').toLowerCase().includes(query);

        return nameMatch || staffIdMatch || emailMatch || phoneMatch || ffUidMatch || ffIgnMatch;
      }

      return true;
    });
  }, [staffMembers, statusFilter, searchQuery]);

  // Eligible Users for "+ Add Staff" Flow
  const eligibleUsers = useMemo(() => {
    if (!userSearchQuery.trim()) {
      return users.slice(0, 15);
    }
    const q = userSearchQuery.toLowerCase().trim();
    return users.filter((u) => {
      const nameMatch = (u.username || '').toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q);
      const emailMatch = (u.email || '').toLowerCase().includes(q);
      const phoneMatch = (u.phone || '').toLowerCase().includes(q);
      const ffUidMatch = (u.inGameId || '').toLowerCase().includes(q);
      const ffIgnMatch = (u.inGameName || '').toLowerCase().includes(q);
      const idMatch = (u.id || '').toLowerCase().includes(q) || (u.uid || '').toLowerCase().includes(q);
      return nameMatch || emailMatch || phoneMatch || ffUidMatch || ffIgnMatch || idMatch;
    }).slice(0, 20);
  }, [users, userSearchQuery]);

  // Helper to check if a user is already a staff member or has an ineligible status
  const getUserStaffStatus = (user: AppUser): { isEligible: boolean; reason?: string } => {
    const userStatus = (user.status || 'active').toLowerCase();
    if (userStatus === 'blocked') {
      return { isEligible: false, reason: 'Account Blocked' };
    }
    if (userStatus === 'banned') {
      return { isEligible: false, reason: 'Account Banned' };
    }
    if (userStatus === 'suspended') {
      return { isEligible: false, reason: 'Account Suspended' };
    }

    const existingStaff = staffMembers.find(
      (s) => s.userId === user.id || s.user_id === user.id || s.userId === user.uid || (s.email && s.email.toLowerCase() === (user.email || '').toLowerCase())
    );

    if (existingStaff) {
      if (existingStaff.status === 'ACTIVE') {
        return { isEligible: false, reason: 'Already Active Staff' };
      }
      if (existingStaff.status === 'SUSPENDED') {
        return { isEligible: false, reason: 'Already Staff (Suspended)' };
      }
    }

    return { isEligible: true };
  };

  // Handler: Confirm Creation of Staff Member
  const handleCreateStaff = async () => {
    if (!selectedUserForStaff) return;
    if (!isSuperAdmin) {
      setActionError('Only SUPERADMIN can create staff accounts.');
      return;
    }

    setIsCreatingStaff(true);
    setActionError(null);

    try {
      const targetUserId = selectedUserForStaff.id || selectedUserForStaff.uid;
      const res = await createStaffMemberInSupabase(targetUserId, adminNotes.trim());

      if (!res.success) {
        throw new Error(res.error || 'Failed to create staff member.');
      }

      const generatedId = res.staffId || 'WX7-STF-NEW';
      setCreateResult({
        staffId: generatedId,
        user: selectedUserForStaff
      });

      // Reload staff list
      await loadStaffMembers();
      setActionSuccess(`Staff member created successfully with Staff ID: ${generatedId}`);
    } catch (err: any) {
      console.error('[StaffManagement] Create staff error:', err);
      setActionError(formatStaffError(err));
    } finally {
      setIsCreatingStaff(false);
    }
  };

  // Handler: Confirm Suspension of Staff Member
  const handleConfirmSuspend = async () => {
    if (!staffToSuspend) return;
    if (!isSuperAdmin) {
      setActionError('Only SUPERADMIN can suspend staff accounts.');
      return;
    }

    setIsSuspending(true);
    setActionError(null);

    try {
      const displayStaffId = staffToSuspend.staffId || staffToSuspend.staff_id || staffToSuspend.id;
      const targetId = staffToSuspend.id || staffToSuspend.userId || displayStaffId;
      const res = await suspendStaffMemberInSupabase(targetId, suspendReason.trim(), {
        id: staffToSuspend.id,
        userId: staffToSuspend.userId || staffToSuspend.user_id,
        staffCode: staffToSuspend.staffId || staffToSuspend.staff_id
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to suspend staff member.');
      }

      setStaffMembers((prev) =>
        prev.map((s) => (s.id === staffToSuspend.id ? { ...s, status: 'SUSPENDED' } : s))
      );

      if (selectedStaffDetails && selectedStaffDetails.id === staffToSuspend.id) {
        setSelectedStaffDetails((prev) => prev ? { ...prev, status: 'SUSPENDED' } : null);
      }

      setStaffToSuspend(null);
      setSuspendReason('');
      setActionSuccess(`Staff member ${staffToSuspend.name} (${displayStaffId}) has been suspended.`);
      await loadStaffMembers(true);
    } catch (err: any) {
      console.error('[StaffManagement] Suspend error:', err);
      setActionError(formatStaffError(err));
    } finally {
      setIsSuspending(false);
    }
  };

  // Handler: Confirm Reactivation of Staff Member
  const handleConfirmReactivate = async () => {
    if (!staffToReactivate) return;
    if (!isSuperAdmin) {
      setActionError('Only SUPERADMIN can reactivate staff accounts.');
      return;
    }

    setIsReactivating(true);
    setActionError(null);

    try {
      const displayStaffId = staffToReactivate.staffId || staffToReactivate.staff_id || staffToReactivate.id;
      const targetId = staffToReactivate.id || staffToReactivate.userId || displayStaffId;
      const res = await reactivateStaffMemberInSupabase(targetId, {
        id: staffToReactivate.id,
        userId: staffToReactivate.userId || staffToReactivate.user_id,
        staffCode: staffToReactivate.staffId || staffToReactivate.staff_id
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to reactivate staff member.');
      }

      setStaffMembers((prev) =>
        prev.map((s) => (s.id === staffToReactivate.id ? { ...s, status: 'ACTIVE' } : s))
      );

      if (selectedStaffDetails && selectedStaffDetails.id === staffToReactivate.id) {
        setSelectedStaffDetails((prev) => prev ? { ...prev, status: 'ACTIVE' } : null);
      }

      setStaffToReactivate(null);
      setActionSuccess(`Staff member ${staffToReactivate.name} (${displayStaffId}) has been reactivated.`);
      await loadStaffMembers(true);
    } catch (err: any) {
      console.error('[StaffManagement] Reactivate error:', err);
      setActionError(formatStaffError(err));
    } finally {
      setIsReactivating(false);
    }
  };

  // Handler: Confirm Removal of Staff Member
  const handleConfirmRemove = async () => {
    if (!staffToRemove) return;
    if (!isSuperAdmin) {
      setActionError('Only SUPERADMIN can remove staff accounts.');
      return;
    }

    setIsRemoving(true);
    setActionError(null);

    try {
      const displayStaffId = staffToRemove.staffId || staffToRemove.staff_id || staffToRemove.id;
      const targetId = staffToRemove.id || staffToRemove.userId || displayStaffId;
      const res = await removeStaffMemberInSupabase(targetId, removeReason.trim(), {
        id: staffToRemove.id,
        userId: staffToRemove.userId || staffToRemove.user_id,
        staffCode: staffToRemove.staffId || staffToRemove.staff_id
      });

      if (!res.success) {
        throw new Error(res.error || 'Failed to remove staff member.');
      }

      setStaffMembers((prev) =>
        prev.map((s) => (s.id === staffToRemove.id ? { ...s, status: 'REMOVED' } : s))
      );

      if (selectedStaffDetails && selectedStaffDetails.id === staffToRemove.id) {
        setSelectedStaffDetails((prev) => prev ? { ...prev, status: 'REMOVED' } : null);
      }

      setStaffToRemove(null);
      setRemoveReason('');
      setActionSuccess(`Staff member ${staffToRemove.name} (${displayStaffId}) has been removed. Record retained in historical archives.`);
      await loadStaffMembers(true);
    } catch (err: any) {
      console.error('[StaffManagement] Remove error:', err);
      setActionError(formatStaffError(err));
    } finally {
      setIsRemoving(false);
    }
  };

  // Format Dates
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Access Control Guard
  if (!isSuperAdmin) {
    return (
      <div id="staff-restricted-view" className="p-8 rounded-3xl bg-[#120F24] border border-rose-900/40 text-center max-w-2xl mx-auto my-12 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8 text-rose-400" />
        </div>
        <h2 className="text-xl font-extrabold text-white mb-2">Access Restricted</h2>
        <p className="text-sm text-purple-200/80 mb-6">
          Staff Management is exclusively restricted to authorized <strong className="text-amber-400">SUPERADMIN</strong> accounts.
          Normal users and staff accounts are strictly forbidden from viewing or modifying tournament staff.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-950/60 border border-purple-800 text-xs text-purple-300 font-mono">
          Current Role: <span className="text-rose-400 font-bold uppercase">{currentUser?.role || 'USER'}</span>
        </div>
      </div>
    );
  }

  return (
    <div id="staff-management-container" className="space-y-6 animate-in fade-in pb-16 md:pb-8">
      {/* Toast Notifications */}
      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-between shadow-lg animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            <p className="text-xs font-semibold text-emerald-200">{actionSuccess}</p>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="p-1 rounded-lg text-emerald-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-500/40 flex items-center justify-between shadow-lg animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <p className="text-xs font-semibold text-rose-200">{actionError}</p>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="p-1 rounded-lg text-rose-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header Section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-[#171233] via-[#120F24] to-[#1A1438] border border-purple-800/40 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-purple-600 p-0.5 shadow-md">
              <div className="w-full h-full bg-[#120F24] rounded-[14px] flex items-center justify-center">
                <Users className="w-5 h-5 text-amber-400" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Staff Management
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  SUPERADMIN ONLY
                </span>
              </h1>
              <p className="text-xs text-purple-300/80">
                Manage WinX7 tournament staff and their access.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            id="refresh-staff-btn"
            onClick={() => loadStaffMembers(true)}
            disabled={isRefreshing || loading}
            className="p-2.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/60 border border-purple-800/50 text-purple-300 hover:text-white transition active:scale-95 disabled:opacity-50"
            title="Refresh Staff List"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          <button
            id="open-add-staff-btn"
            onClick={() => {
              setSelectedUserForStaff(null);
              setUserSearchQuery('');
              setAdminNotes('');
              setCreateResult(null);
              setIsAddModalOpen(true);
            }}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-extrabold text-xs shadow-lg shadow-amber-950/50 transition active:scale-95 cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-black" />
            <span>+ Add Staff</span>
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Staff */}
        <div className="p-4 rounded-2xl bg-[#141029] border border-purple-800/40 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">Total Staff</p>
            <h3 className="text-2xl font-black text-white mt-1">{stats.total}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-900/40 border border-purple-700/50 flex items-center justify-center text-purple-300">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Active */}
        <div className="p-4 rounded-2xl bg-[#141029] border border-emerald-800/40 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">Active</p>
            <h3 className="text-2xl font-black text-emerald-300 mt-1">{stats.active}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-700/50 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Suspended */}
        <div className="p-4 rounded-2xl bg-[#141029] border border-amber-800/40 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Suspended</p>
            <h3 className="text-2xl font-black text-amber-300 mt-1">{stats.suspended}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-700/50 flex items-center justify-center text-amber-400">
            <Ban className="w-5 h-5" />
          </div>
        </div>

        {/* Removed */}
        <div className="p-4 rounded-2xl bg-[#141029] border border-rose-800/40 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">Removed</p>
            <h3 className="text-2xl font-black text-rose-300 mt-1">{stats.removed}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-950/60 border border-rose-700/50 flex items-center justify-center text-rose-400">
            <Slash className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search and Filters Section */}
      <div className="p-4 rounded-2xl bg-[#141029] border border-purple-800/40 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="staff-search-input"
            type="text"
            placeholder="Search by name, Staff ID, email, phone, FF UID, FF IGN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#0F0D1A] border border-purple-800/50 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-amber-400 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-purple-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {(['ALL', 'ACTIVE', 'SUSPENDED', 'REMOVED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex-shrink-0 cursor-pointer ${
                statusFilter === st
                  ? 'bg-purple-800 text-amber-300 border border-amber-500/40 shadow'
                  : 'bg-purple-950/40 text-purple-300 hover:bg-purple-900/40 hover:text-white border border-purple-900/30'
              }`}
            >
              {st === 'ALL' ? 'All Status' : st}
            </button>
          ))}

          {/* Role Filter (Fixed to STAFF) */}
          <div className="px-3 py-2 rounded-xl text-xs font-black bg-purple-950/80 text-amber-400 border border-amber-500/30 flex items-center gap-1 flex-shrink-0">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>Role: STAFF</span>
          </div>
        </div>
      </div>

      {/* Staff List Table / Card View */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="h-20 rounded-2xl bg-[#141029] border border-purple-800/30 animate-pulse"
            />
          ))}
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#141029] border border-purple-800/40 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-purple-950/60 border border-purple-800/60 flex items-center justify-center mx-auto text-purple-400">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white">No Staff Members Found</h3>
          <p className="text-xs text-purple-300/70 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'ALL'
              ? 'No staff members match the current search filters. Try adjusting your query.'
              : 'No staff accounts have been added yet. Click "+ Add Staff" to search and appoint a WinX7 user as tournament staff.'}
          </p>
          {!searchQuery && statusFilter === 'ALL' && (
            <button
              onClick={() => {
                setSelectedUserForStaff(null);
                setUserSearchQuery('');
                setAdminNotes('');
                setIsAddModalOpen(true);
              }}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs transition"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add First Staff</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden lg:block rounded-3xl bg-[#141029] border border-purple-800/40 overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0F0D1A] border-b border-purple-800/50 text-purple-300 uppercase tracking-wider font-extrabold text-[10px]">
                <tr>
                  <th className="px-4 py-3.5">Staff Name & ID</th>
                  <th className="px-4 py-3.5">Contact Info</th>
                  <th className="px-4 py-3.5">FF UID / IGN</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Joined Date</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-900/30">
                {filteredStaff.map((staff) => {
                  const staffDisplayId = staff.staffId || staff.staff_id || staff.id;
                  const isSuspended = staff.status === 'SUSPENDED';
                  const isRemoved = staff.status === 'REMOVED';

                  return (
                    <tr
                      key={staff.id}
                      className="hover:bg-purple-950/30 transition group cursor-pointer"
                      onClick={() => setSelectedStaffDetails(staff)}
                    >
                      {/* Name & ID */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <img
                            src={staff.avatarUrl || staff.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                            alt={staff.name}
                            className="w-10 h-10 rounded-xl object-cover ring-2 ring-purple-700/50 flex-shrink-0"
                          />
                          <div className="min-w-0">
                            <h4 className="font-bold text-white text-sm truncate group-hover:text-amber-300 transition">
                              {staff.name || staff.displayName || 'Staff Member'}
                            </h4>
                            <span className="font-mono text-[11px] text-amber-400/90 font-bold block">
                              {staffDisplayId}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Email & Phone */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-0.5">
                          <p className="text-purple-200 flex items-center gap-1.5 truncate">
                            <Mail className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                            <span className="truncate">{staff.email || 'No email'}</span>
                          </p>
                          <p className="text-purple-400 text-[11px] flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-purple-500 flex-shrink-0" />
                            <span>{staff.phone || 'No phone'}</span>
                          </p>
                        </div>
                      </td>

                      {/* FF IGN & UID */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-0.5">
                          <p className="font-bold text-purple-100 flex items-center gap-1.5 truncate">
                            <Gamepad2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                            <span className="truncate">{staff.ffIgn || staff.ff_ign || staff.inGameName || 'No IGN'}</span>
                          </p>
                          <p className="font-mono text-[11px] text-purple-400">
                            UID: {staff.ffUid || staff.ff_uid || staff.inGameId || 'N/A'}
                          </p>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3.5">
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-900/60 text-amber-300 border border-amber-500/30">
                          STAFF
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 border ${
                            staff.status === 'ACTIVE'
                              ? 'bg-emerald-950/80 text-emerald-400 border-emerald-700/60'
                              : staff.status === 'SUSPENDED'
                              ? 'bg-amber-950/80 text-amber-400 border-amber-700/60'
                              : 'bg-rose-950/80 text-rose-400 border-rose-700/60'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              staff.status === 'ACTIVE'
                                ? 'bg-emerald-400 animate-pulse'
                                : staff.status === 'SUSPENDED'
                                ? 'bg-amber-400'
                                : 'bg-rose-400'
                            }`}
                          />
                          {staff.status}
                        </span>
                      </td>

                      {/* Joined Date */}
                      <td className="px-4 py-3.5 text-purple-300 text-[11px]">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-purple-400" />
                          <span>{formatDate(staff.joinedDate || staff.created_at)}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedStaffDetails(staff)}
                            className="p-1.5 rounded-lg bg-purple-950 hover:bg-purple-900 text-purple-300 hover:text-white border border-purple-800 transition"
                            title="View Staff Profile"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {staff.status === 'ACTIVE' && (
                            <>
                              <button
                                onClick={() => setStaffToSuspend(staff)}
                                className="px-2 py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-800/50 text-[11px] font-bold transition"
                                title="Suspend Staff"
                              >
                                Suspend
                              </button>
                              <button
                                onClick={() => setStaffToRemove(staff)}
                                className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-400 border border-rose-800/40 transition"
                                title="Remove Staff"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {staff.status === 'SUSPENDED' && (
                            <>
                              <button
                                onClick={() => setStaffToReactivate(staff)}
                                className="px-2 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/50 text-[11px] font-bold transition"
                                title="Reactivate Staff"
                              >
                                Reactivate
                              </button>
                              <button
                                onClick={() => setStaffToRemove(staff)}
                                className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-400 border border-rose-800/40 transition"
                                title="Remove Staff"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {staff.status === 'REMOVED' && (
                            <span className="text-[10px] text-purple-400 font-semibold px-2 py-1 bg-purple-950 rounded-lg">
                              Archived
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:hidden gap-3.5">
            {filteredStaff.map((staff) => {
              const staffDisplayId = staff.staffId || staff.staff_id || staff.id;

              return (
                <div
                  key={staff.id}
                  onClick={() => setSelectedStaffDetails(staff)}
                  className="p-4 rounded-2xl bg-[#141029] border border-purple-800/40 hover:border-purple-600 transition flex flex-col justify-between space-y-3 shadow-md cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <img
                        src={staff.avatarUrl || staff.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                        alt={staff.name}
                        className="w-12 h-12 rounded-2xl object-cover ring-2 ring-purple-700/50 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <h4 className="font-bold text-white text-sm truncate">
                          {staff.name || staff.displayName || 'Staff Member'}
                        </h4>
                        <p className="font-mono text-xs font-bold text-amber-400">
                          {staffDisplayId}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-purple-900/80 text-amber-300 border border-amber-500/30">
                            STAFF
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                              staff.status === 'ACTIVE'
                                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                : staff.status === 'SUSPENDED'
                                ? 'bg-amber-950 text-amber-400 border-amber-800'
                                : 'bg-rose-950 text-rose-400 border-rose-800'
                            }`}
                          >
                            {staff.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-purple-900/30">
                    <div>
                      <span className="text-[10px] text-purple-400 block font-semibold">Email</span>
                      <span className="text-purple-200 truncate block text-[11px]">
                        {staff.email || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-purple-400 block font-semibold">Phone</span>
                      <span className="text-purple-200 truncate block text-[11px]">
                        {staff.phone || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-purple-400 block font-semibold">FF IGN</span>
                      <span className="text-purple-100 font-bold truncate block text-[11px]">
                        {staff.ffIgn || staff.ff_ign || staff.inGameName || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-purple-400 block font-semibold">FF UID</span>
                      <span className="text-purple-200 font-mono truncate block text-[11px]">
                        {staff.ffUid || staff.ff_uid || staff.inGameId || 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div
                    className="pt-2.5 border-t border-purple-900/40 flex items-center justify-between gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setSelectedStaffDetails(staff)}
                      className="flex-1 py-1.5 px-3 rounded-xl bg-purple-950 hover:bg-purple-900 text-purple-200 font-bold text-xs border border-purple-800 text-center transition"
                    >
                      View Details
                    </button>

                    {staff.status === 'ACTIVE' && (
                      <>
                        <button
                          onClick={() => setStaffToSuspend(staff)}
                          className="px-3 py-1.5 rounded-xl bg-amber-950/80 hover:bg-amber-900/80 text-amber-300 border border-amber-800 font-bold text-xs transition"
                        >
                          Suspend
                        </button>
                        <button
                          onClick={() => setStaffToRemove(staff)}
                          className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-400 border border-rose-800 transition"
                          title="Remove Staff"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    {staff.status === 'SUSPENDED' && (
                      <>
                        <button
                          onClick={() => setStaffToReactivate(staff)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800 font-bold text-xs transition"
                        >
                          Reactivate
                        </button>
                        <button
                          onClick={() => setStaffToRemove(staff)}
                          className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-400 border border-rose-800 transition"
                          title="Remove Staff"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* ADD STAFF MODAL: Select WinX7 User Flow */}
      {/* ========================================================================= */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-xl bg-[#120F24] border border-purple-700/60 rounded-3xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-purple-800/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    {createResult ? 'Staff Created Successfully' : 'Select WinX7 User to Appoint'}
                  </h3>
                  <p className="text-xs text-purple-300/80">
                    {createResult
                      ? 'Tournament staff member is now provisioned'
                      : 'Search an existing registered user to grant tournament staff access'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-xl bg-purple-950 text-purple-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Success State */}
            {createResult ? (
              <div className="space-y-4 py-2">
                <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-950/60 via-purple-950/40 to-[#141029] border border-emerald-600/50 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mx-auto text-emerald-400">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-extrabold text-white">
                    Staff Member Successfully Created!
                  </h4>
                  <div className="inline-block px-4 py-1.5 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-300 font-mono font-black text-sm">
                    Staff ID: {createResult.staffId}
                  </div>
                  <p className="text-xs text-purple-200/90 max-w-md mx-auto">
                    <strong>{createResult.user.username || createResult.user.displayName}</strong> can now log into the separate <strong>WinX7 Staff App</strong> with role <strong className="text-amber-400">STAFF</strong>.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setSelectedUserForStaff(null);
                      setCreateResult(null);
                      setUserSearchQuery('');
                      setAdminNotes('');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-purple-950 hover:bg-purple-900 text-purple-300 text-xs font-bold transition"
                  >
                    + Add Another Staff
                  </button>
                  <button
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs transition shadow"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : !selectedUserForStaff ? (
              /* Step 1: User Search & Selection */
              <div className="space-y-4">
                <div className="relative">
                  <Search className="w-4 h-4 text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="user-search-modal-input"
                    type="text"
                    placeholder="Search by username, email, phone, FF UID, FF IGN..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0F0D1A] border border-purple-700/60 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-amber-400"
                    autoFocus
                  />
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                  {eligibleUsers.length === 0 ? (
                    <div className="p-6 text-center text-xs text-purple-400">
                      No matching WinX7 users found.
                    </div>
                  ) : (
                    eligibleUsers.map((user) => {
                      const { isEligible, reason } = getUserStaffStatus(user);

                      return (
                        <div
                          key={user.id || user.uid}
                          className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 ${
                            isEligible
                              ? 'bg-[#161230] border-purple-800/50 hover:border-amber-500/60 hover:bg-purple-950/40 cursor-pointer'
                              : 'bg-purple-950/20 border-purple-900/30 opacity-60 cursor-not-allowed'
                          }`}
                          onClick={() => {
                            if (isEligible) {
                              setSelectedUserForStaff(user);
                            }
                          }}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={user.avatarUrl || user.avatar || user.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                              alt={user.username}
                              className="w-10 h-10 rounded-xl object-cover ring-1 ring-purple-700/50 flex-shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h5 className="font-bold text-white text-xs truncate">
                                  {user.username || user.displayName || 'User'}
                                </h5>
                                <span
                                  className={`px-1.5 py-0.2 text-[9px] font-bold rounded uppercase ${
                                    (user.status || 'active').toLowerCase() === 'active'
                                      ? 'bg-emerald-950 text-emerald-400'
                                      : 'bg-rose-950 text-rose-400'
                                  }`}
                                >
                                  {user.status || 'active'}
                                </span>
                              </div>
                              <p className="text-[11px] text-purple-300/80 truncate">
                                IGN: <strong className="text-purple-100">{user.inGameName || 'N/A'}</strong> • UID: {user.inGameId || 'N/A'}
                              </p>
                              <p className="text-[10px] text-purple-400/80 truncate">
                                {user.email || user.phone || 'No contact info'}
                              </p>
                            </div>
                          </div>

                          <div className="flex-shrink-0">
                            {isEligible ? (
                              <button
                                type="button"
                                className="px-3 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400 hover:text-black text-amber-300 font-extrabold text-xs border border-amber-400/40 transition"
                              >
                                Select
                              </button>
                            ) : (
                              <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-950/60 text-rose-400 border border-rose-900/40">
                                {reason}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              /* Step 2: Confirmation View */
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-[#161230] border border-amber-500/40 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-purple-800/40">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                      Selected WinX7 User
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedUserForStaff(null)}
                      className="text-xs text-purple-300 hover:text-white underline"
                    >
                      Change User
                    </button>
                  </div>

                  <div className="flex items-center gap-3.5">
                    <img
                      src={selectedUserForStaff.avatarUrl || selectedUserForStaff.avatar || selectedUserForStaff.photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                      alt={selectedUserForStaff.username}
                      className="w-12 h-12 rounded-2xl object-cover ring-2 ring-amber-400/60 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <h4 className="text-sm font-extrabold text-white truncate">
                        {selectedUserForStaff.username || selectedUserForStaff.displayName}
                      </h4>
                      <p className="text-xs text-purple-200">
                        FF IGN: <strong className="text-amber-300">{selectedUserForStaff.inGameName || 'N/A'}</strong> • FF UID: {selectedUserForStaff.inGameId || 'N/A'}
                      </p>
                      <p className="text-[11px] text-purple-400 truncate">
                        {selectedUserForStaff.email || selectedUserForStaff.phone}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-xs">
                    <span className="text-purple-300">Appointed Role:</span>
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase bg-purple-900 text-amber-300 border border-amber-500/40">
                      STAFF
                    </span>
                  </div>
                </div>

                {/* Admin Notes Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-purple-200">
                    Admin Notes <span className="text-purple-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Appointed tournament host for weekend Free Fire & BGMI tournaments..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    className="w-full p-3 bg-[#0F0D1A] border border-purple-800/60 rounded-xl text-xs text-white placeholder-purple-400/50 focus:outline-none focus:border-amber-400 custom-scrollbar"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedUserForStaff(null)}
                    disabled={isCreatingStaff}
                    className="px-4 py-2.5 rounded-xl bg-purple-950 hover:bg-purple-900 text-purple-300 text-xs font-bold transition disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    id="confirm-create-staff-btn"
                    onClick={handleCreateStaff}
                    disabled={isCreatingStaff}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs shadow-lg transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {isCreatingStaff ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-black" />
                        <span>Creating Staff...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 text-black" />
                        <span>Confirm & Appoint Staff</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STAFF DETAILS MODAL & PERMISSIONS DESK */}
      {/* ========================================================================= */}
      {selectedStaffDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-2xl bg-[#120F24] border border-purple-700/60 rounded-3xl p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-purple-800/40">
              <div className="flex items-center gap-3">
                <img
                  src={selectedStaffDetails.avatarUrl || selectedStaffDetails.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                  alt={selectedStaffDetails.name}
                  className="w-12 h-12 rounded-2xl object-cover ring-2 ring-amber-400/60 flex-shrink-0"
                />
                <div>
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    {selectedStaffDetails.name || selectedStaffDetails.displayName || 'Staff Member'}
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-900 text-amber-300 border border-amber-500/40">
                      STAFF
                    </span>
                  </h3>
                  <p className="font-mono text-xs font-bold text-amber-400">
                    ID: {selectedStaffDetails.staffId || selectedStaffDetails.staff_id || selectedStaffDetails.id}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedStaffDetails(null)}
                className="p-1.5 rounded-xl bg-purple-950 text-purple-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Staff Information Grid */}
            <div className="space-y-2">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-400" />
                Staff Profile Information
              </h4>

              <div className="p-4 rounded-2xl bg-[#161230] border border-purple-800/40 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-purple-400 block font-semibold">Staff Name</span>
                  <span className="font-bold text-white">{selectedStaffDetails.name || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-400 block font-semibold">Staff ID</span>
                  <span className="font-mono font-bold text-amber-300">
                    {selectedStaffDetails.staffId || selectedStaffDetails.staff_id || selectedStaffDetails.id}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-400 block font-semibold">Role</span>
                  <span className="font-bold text-amber-400">STAFF</span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-400 block font-semibold">Status</span>
                  <span
                    className={`font-black uppercase inline-block text-[11px] ${
                      selectedStaffDetails.status === 'ACTIVE'
                        ? 'text-emerald-400'
                        : selectedStaffDetails.status === 'SUSPENDED'
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {selectedStaffDetails.status}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-400 block font-semibold">Email</span>
                  <span className="text-purple-200 truncate block">{selectedStaffDetails.email || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-400 block font-semibold">Phone</span>
                  <span className="text-purple-200">{selectedStaffDetails.phone || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-400 block font-semibold">FF IGN</span>
                  <span className="font-bold text-purple-100">
                    {selectedStaffDetails.ffIgn || selectedStaffDetails.ff_ign || selectedStaffDetails.inGameName || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-400 block font-semibold">FF UID</span>
                  <span className="font-mono text-purple-300">
                    {selectedStaffDetails.ffUid || selectedStaffDetails.ff_uid || selectedStaffDetails.inGameId || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-purple-400 block font-semibold">Joined Date</span>
                  <span className="text-purple-300">{formatDate(selectedStaffDetails.joinedDate || selectedStaffDetails.created_at)}</span>
                </div>
                {selectedStaffDetails.approvedDate && (
                  <div>
                    <span className="text-[10px] text-purple-400 block font-semibold">Approved Date</span>
                    <span className="text-purple-300">{formatDate(selectedStaffDetails.approvedDate)}</span>
                  </div>
                )}
                <div className="col-span-2 sm:col-span-3 pt-1 border-t border-purple-900/30">
                  <span className="text-[10px] text-purple-400 block font-semibold">Admin Notes</span>
                  <p className="text-purple-200 italic mt-0.5">
                    {selectedStaffDetails.notes || selectedStaffDetails.adminNotes || 'No administrative notes attached.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Read-Only Permission Scope */}
            <div className="space-y-2">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Staff App Permissions (Read-Only)
              </h4>

              <div className="p-4 rounded-2xl bg-[#161230] border border-purple-800/40 space-y-3.5 text-xs">
                {/* Match Management */}
                <div>
                  <span className="text-[11px] font-bold text-amber-300 block mb-1.5">
                    Match Management
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 flex items-center gap-1.5 text-[11px]">
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Create Match
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 flex items-center gap-1.5 text-[11px]">
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> View Match
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 flex items-center gap-1.5 text-[11px]">
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Edit Match
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 flex items-center gap-1.5 text-[11px]">
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Delete Match
                    </span>
                  </div>
                </div>

                {/* Registration Management */}
                <div>
                  <span className="text-[11px] font-bold text-amber-300 block mb-1.5">
                    Registration Management
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 flex items-center gap-1.5 text-[11px]">
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> View Registrations
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 flex items-center gap-1.5 text-[11px]">
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Edit Registrations
                    </span>
                  </div>
                </div>

                {/* Results */}
                <div>
                  <span className="text-[11px] font-bold text-amber-300 block mb-1.5">
                    Results Management
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-950/60 text-emerald-300 border border-emerald-800/50 flex items-center gap-1.5 text-[11px]">
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Publish Match Results
                    </span>
                  </div>
                </div>

                {/* Explicit Restricted Modules */}
                <div className="pt-2 border-t border-purple-900/40">
                  <span className="text-[11px] font-bold text-rose-400 block mb-1.5">
                    Restricted Modules (No Access)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Wallets & Balance Adjustments',
                      'Deposits & Withdrawals',
                      'Payment Gateways',
                      'Promo Coupons',
                      'Users Management',
                      'System Settings & Config',
                      'Staff & Roles Management',
                      'SUPERADMIN Operations'
                    ].map((restricted) => (
                      <span
                        key={restricted}
                        className="px-2 py-0.5 rounded text-[10px] bg-rose-950/40 text-rose-400 border border-rose-900/40 flex items-center gap-1"
                      >
                        <X className="w-3 h-3 text-rose-500" />
                        {restricted}: <strong>No Access</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-purple-800/40">
              <div className="text-[11px] text-purple-400">
                Status: <strong className="text-white">{selectedStaffDetails.status}</strong>
              </div>

              <div className="flex items-center gap-2">
                {selectedStaffDetails.status === 'ACTIVE' && (
                  <>
                    <button
                      onClick={() => {
                        setStaffToSuspend(selectedStaffDetails);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-800 text-xs font-bold transition"
                    >
                      Suspend Staff
                    </button>
                    <button
                      onClick={() => {
                        setStaffToRemove(selectedStaffDetails);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-400 border border-rose-800 text-xs font-bold transition"
                    >
                      Remove Staff
                    </button>
                  </>
                )}

                {selectedStaffDetails.status === 'SUSPENDED' && (
                  <>
                    <button
                      onClick={() => {
                        setStaffToReactivate(selectedStaffDetails);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 text-xs font-bold transition"
                    >
                      Reactivate Staff
                    </button>
                    <button
                      onClick={() => {
                        setStaffToRemove(selectedStaffDetails);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-400 border border-rose-800 text-xs font-bold transition"
                    >
                      Remove Staff
                    </button>
                  </>
                )}

                <button
                  onClick={() => setSelectedStaffDetails(null)}
                  className="px-4 py-2 rounded-xl bg-purple-950 hover:bg-purple-900 text-purple-300 text-xs font-bold transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUSPEND STAFF CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {staffToSuspend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#120F24] border border-amber-500/60 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400">
              <Ban className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">
                Suspend Staff Member?
              </h3>
              <p className="text-xs text-purple-300">
                Are you sure you want to suspend <strong className="text-amber-400">{staffToSuspend.name}</strong> ({staffToSuspend.staffId || staffToSuspend.id})?
                Their Staff App access will be immediately revoked.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-purple-200">
                Suspension Reason / Note <span className="text-purple-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="Reason for suspension..."
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                className="w-full p-2.5 bg-[#0F0D1A] border border-purple-800/60 rounded-xl text-xs text-white placeholder-purple-400/50 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStaffToSuspend(null)}
                disabled={isSuspending}
                className="px-4 py-2.5 rounded-xl bg-purple-950 text-purple-300 text-xs font-bold hover:bg-purple-900 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-suspend-staff-btn"
                onClick={handleConfirmSuspend}
                disabled={isSuspending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs shadow transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isSuspending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                    <span>Suspending...</span>
                  </>
                ) : (
                  <span>Confirm Suspension</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REACTIVATE STAFF CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {staffToReactivate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#120F24] border border-emerald-500/60 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">
                Reactivate Staff Member?
              </h3>
              <p className="text-xs text-purple-300">
                Are you sure you want to reactivate <strong className="text-emerald-400">{staffToReactivate.name}</strong> ({staffToReactivate.staffId || staffToReactivate.id})?
                Their Staff App access will become active again immediately.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStaffToReactivate(null)}
                disabled={isReactivating}
                className="px-4 py-2.5 rounded-xl bg-purple-950 text-purple-300 text-xs font-bold hover:bg-purple-900 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-reactivate-staff-btn"
                onClick={handleConfirmReactivate}
                disabled={isReactivating}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs shadow transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isReactivating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                    <span>Reactivating...</span>
                  </>
                ) : (
                  <span>Confirm Reactivation</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REMOVE STAFF CONFIRMATION MODAL (Destructive Action) */}
      {/* ========================================================================= */}
      {staffToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#120F24] border border-rose-600/70 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-400/40 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">
                Remove this staff member?
              </h3>
              <p className="text-xs text-rose-200/90 leading-relaxed">
                The staff member will lose Staff App access. Their staff record will be retained for administrative history.
              </p>
              <p className="text-[11px] text-purple-400 mt-1">
                Target: <strong>{staffToRemove.name}</strong> ({staffToRemove.staffId || staffToRemove.id})
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-purple-200">
                Removal Reason / Note <span className="text-purple-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="Reason for removal..."
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                className="w-full p-2.5 bg-[#0F0D1A] border border-purple-800/60 rounded-xl text-xs text-white placeholder-purple-400/50 focus:outline-none focus:border-rose-400"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStaffToRemove(null)}
                disabled={isRemoving}
                className="px-4 py-2.5 rounded-xl bg-purple-950 text-purple-300 text-xs font-bold hover:bg-purple-900 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-remove-staff-btn"
                onClick={handleConfirmRemove}
                disabled={isRemoving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs shadow-lg transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isRemoving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <span>Remove Staff Account</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
