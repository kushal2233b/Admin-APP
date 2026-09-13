import React, { useState, useEffect, useMemo } from 'react';
import {
  UserCheck,
  UserX,
  UserPlus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Clock,
  Mail,
  Gamepad2,
  X,
  RefreshCw,
  PowerOff,
  Power,
  Trash2,
  AlertCircle,
  HelpCircle,
  Users,
  AtSign
} from 'lucide-react';
import { SupportStaffMember, AppUser } from '../../types';
import {
  fetchSupportStaffMembersFromSupabase,
  grantSupportStaffAccess,
  updateSupportStaffStatusInSupabase,
  removeSupportStaffRoleInSupabase
} from '../../services/supabaseService';
import { supabase } from '../../services/supabase';

interface UserCandidate {
  id: string;
  name: string;
  email: string;
  username: string;
  inGameName: string;
  inGameId: string;
  avatarUrl: string;
  isPreviouslyDisabled?: boolean;
}

interface SupportStaffManagementProps {
  users?: AppUser[];
}

export const SupportStaffManagement: React.FC<SupportStaffManagementProps> = ({
  users = []
}) => {
  const [staffList, setStaffList] = useState<SupportStaffMember[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED'>('ALL');

  // Add Support Staff Modal & Candidate Picker State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [fetchedUsersList, setFetchedUsersList] = useState<UserCandidate[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [selectedUser, setSelectedUser] = useState<UserCandidate | null>(null);
  const [showConfirmGrantModal, setShowConfirmGrantModal] = useState<boolean>(false);
  const [isSubmittingGrant, setIsSubmittingGrant] = useState<boolean>(false);

  // Status/Remove Action Confirmation Modals
  const [targetStaff, setTargetStaff] = useState<SupportStaffMember | null>(null);
  const [confirmActionType, setConfirmActionType] = useState<'DISABLE' | 'ENABLE' | 'REMOVE' | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState<boolean>(false);

  // Toast / Status Message
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadStaff = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await fetchSupportStaffMembersFromSupabase();
      setStaffList(data);
    } catch (err: any) {
      console.error('[Support Staff Load Error]:', err);
      showToast('Failed to load support staff members', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  // Load existing users when Add Modal is opened via secure server search endpoint
  const loadAvailableUsers = async (query = '') => {
    setLoadingUsers(true);
    try {
      let headers: Record<string, string> = {};
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`;
        }
      } catch {}

      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json && json.success && Array.isArray(json.data)) {
          setFetchedUsersList(json.data);
          setLoadingUsers(false);
          return;
        }
      }
    } catch (e) {
      console.warn('[Search API Notice]:', e);
    }

    // Client fallback if server API is unavailable
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150);

      if (!error && data) {
        const mapped: UserCandidate[] = data.map((p: any) => ({
          id: p.id,
          name: p.display_name || p.name || p.username || 'User',
          email: p.email || '',
          username: p.username || '',
          inGameName: p.in_game_name || p.ff_ign || p.bgmi_ign || '',
          inGameId: p.in_game_id || p.ff_uid || p.bgmi_uid || '',
          avatarUrl: p.avatar_url || ''
        }));
        setFetchedUsersList(mapped);
      }
    } catch (err) {
      console.warn('[Load Users Error]:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleOpenAddModal = () => {
    setSelectedUser(null);
    setUserSearchQuery('');
    setShowConfirmGrantModal(false);
    setShowAddModal(true);
    loadAvailableUsers();
  };

  // Filter staff list
  const filteredStaff = useMemo(() => {
    return staffList.filter((staff) => {
      const matchesSearch =
        staff.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (staff.email && staff.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (staff.username && staff.username.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (staff.inGameName && staff.inGameName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        staff.userId.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'ALL' || staff.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [staffList, searchQuery, statusFilter]);

  // Sets for authoritative matching
  // ONLY ACTIVE staff are excluded from candidate list
  const activeStaffUserIds = useMemo(() => {
    return new Set(staffList.filter((s) => s.status === 'ACTIVE').map((s) => s.userId));
  }, [staffList]);

  // DISABLED staff are retained and marked so they can be reactivated
  const disabledStaffMap = useMemo(() => {
    return new Map(staffList.filter((s) => s.status === 'DISABLED').map((s) => [s.userId, s]));
  }, [staffList]);

  // Unified candidates list from AppUser in-memory pool + fetched profiles
  const candidateUsers = useMemo(() => {
    const q = userSearchQuery.toLowerCase().trim();
    const map = new Map<string, UserCandidate>();

    // 1. Ingest users from existing in-memory pool (AppUser[])
    users.forEach((u: any) => {
      const uid = u.id || u.uid;
      if (!uid) return;
      map.set(uid, {
        id: uid,
        name: u.name || u.displayName || u.username || 'User',
        email: u.email || '',
        username: u.username || '',
        inGameName: u.inGameName || u.ffIgn || u.bgmiIgn || '',
        inGameId: u.inGameId || u.ffUid || u.bgmiUid || '',
        avatarUrl: u.avatarUrl || ''
      });
    });

    // 2. Ingest users from fetched profiles API
    fetchedUsersList.forEach((fu) => {
      if (!fu.id) return;
      const existing = map.get(fu.id);
      map.set(fu.id, {
        id: fu.id,
        name: fu.name || existing?.name || 'User',
        email: fu.email || existing?.email || '',
        username: fu.username || existing?.username || '',
        inGameName: fu.inGameName || existing?.inGameName || '',
        inGameId: fu.inGameId || existing?.inGameId || '',
        avatarUrl: fu.avatarUrl || existing?.avatarUrl || ''
      });
    });

    // 3. Filter candidates:
    // EXCLUDE active support staff
    // KEEP fresh users and DISABLED support staff (for reactivation)
    const result: UserCandidate[] = [];
    map.forEach((user) => {
      // Exclude if already ACTIVE support staff
      if (activeStaffUserIds.has(user.id)) return;

      const isPreviouslyDisabled = disabledStaffMap.has(user.id);

      // Search matching
      if (q) {
        const matches =
          (user.name && user.name.toLowerCase().includes(q)) ||
          (user.email && user.email.toLowerCase().includes(q)) ||
          (user.username && user.username.toLowerCase().includes(q)) ||
          (user.inGameName && user.inGameName.toLowerCase().includes(q)) ||
          (user.inGameId && user.inGameId.toLowerCase().includes(q)) ||
          (user.id && user.id.toLowerCase().includes(q));

        if (!matches) return;
      }

      result.push({
        ...user,
        isPreviouslyDisabled
      });
    });

    console.log(`[Support Staff Picker] Diagnostics:
- TOTAL USERS FOUND: ${map.size}
- ACTIVE SUPPORT STAFF COUNT: ${activeStaffUserIds.size}
- DISABLED SUPPORT STAFF COUNT: ${disabledStaffMap.size}
- USERS AVAILABLE FOR ASSIGNMENT: ${result.length}`);

    // Sort: disabled staff first (for quick reactivation), then alphabetically by name
    return result.sort((a, b) => {
      if (a.isPreviouslyDisabled && !b.isPreviouslyDisabled) return -1;
      if (!a.isPreviouslyDisabled && b.isPreviouslyDisabled) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [users, fetchedUsersList, activeStaffUserIds, disabledStaffMap, userSearchQuery]);

  // Handle granting or reactivating support staff role
  const handleConfirmGrantAccess = async () => {
    if (!selectedUser) return;
    setIsSubmittingGrant(true);

    try {
      const isReactivating = Boolean(selectedUser.isPreviouslyDisabled);
      console.log(`[Admin Support Staff] Submitting assignment for user: ${selectedUser.id} (${selectedUser.name}), isReactivating: ${isReactivating}`);

      let result: { success: boolean; message: string; data?: any; staff?: any };

      if (isReactivating) {
        // If user was previously disabled, update status to ACTIVE
        result = await updateSupportStaffStatusInSupabase(selectedUser.id, 'ACTIVE');
      } else {
        // Fresh user: grant support staff access
        result = await grantSupportStaffAccess(
          selectedUser.id,
          selectedUser.name,
          selectedUser.email
        );
      }

      console.log('[Admin Support Staff] Assignment response:', {
        success: result.success,
        message: result.message,
        staff: result.staff || result.data
      });

      if (!result.success) {
        showToast(result.message || 'Unable to assign support staff', 'error');
        return;
      }

      showToast(
        result.message || (isReactivating
          ? `Support Staff access reactivated for ${selectedUser.name}!`
          : `Support Staff access granted to ${selectedUser.name}!`),
        'success'
      );
      setShowConfirmGrantModal(false);
      setShowAddModal(false);
      setSelectedUser(null);
      await loadStaff(true);
    } catch (err: any) {
      console.error('[Admin Support Staff] Assignment Exception:', err?.message || err);
      showToast('Unable to assign support staff. Please try again.', 'error');
    } finally {
      setIsSubmittingGrant(false);
    }
  };

  // Handle Disable / Enable / Remove Actions
  const handleExecuteAction = async () => {
    if (!targetStaff || !confirmActionType) return;
    setIsProcessingAction(true);

    try {
      if (confirmActionType === 'DISABLE') {
        const res = await updateSupportStaffStatusInSupabase(targetStaff.userId, 'DISABLED');
        if (res.success) {
          showToast(`Support access disabled for ${targetStaff.name}.`, 'success');
        } else {
          showToast(res.message, 'error');
        }
      } else if (confirmActionType === 'ENABLE') {
        const res = await updateSupportStaffStatusInSupabase(targetStaff.userId, 'ACTIVE');
        if (res.success) {
          showToast(`Support access re-enabled for ${targetStaff.name}.`, 'success');
        } else {
          showToast(res.message, 'error');
        }
      } else if (confirmActionType === 'REMOVE') {
        const res = await removeSupportStaffRoleInSupabase(targetStaff.userId);
        if (res.success) {
          showToast(`Removed SUPPORT STAFF role from ${targetStaff.name}. User account preserved.`, 'success');
        } else {
          showToast(res.message, 'error');
        }
      }
      setTargetStaff(null);
      setConfirmActionType(null);
      await loadStaff(true);
    } catch (err: any) {
      showToast(err?.message || 'Action failed', 'error');
    } finally {
      setIsProcessingAction(false);
    }
  };

  return (
    <div className="space-y-6" id="winx7-support-staff-management">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-xs font-bold transition-all animate-in fade-in slide-in-from-top-4 ${
            toastMessage.type === 'success'
              ? 'bg-[#151216] border-[#C9A34E] text-[#C9A34E]'
              : 'bg-[#2A0808] border-[#E21B36] text-[#FF9B9B]'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#C9A34E] shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-[#E21B36] shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header & Overview Card */}
      <div className="bg-[#141215] border border-[#29252A] rounded-2xl p-5 sm:p-6 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#C9A34E]/20 to-[#E21B36]/20 border border-[#C9A34E]/30 flex items-center justify-center text-[#C9A34E] shrink-0 shadow-inner">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-[#F5F5F5] uppercase tracking-wide">
                Support Staff Management
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-[#350A12] text-[#C9A34E] rounded-md border border-[#C9A34E]/30">
                Web App RBAC
              </span>
            </div>
            <p className="text-xs text-[#B0ACB0] mt-0.5">
              Grant or revoke application-level Support Staff role for authenticated WINX7 users to access the separate Support Web App.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadStaff(true)}
            disabled={refreshing || loading}
            className="p-2.5 rounded-xl bg-[#1B181C] hover:bg-[#252126] border border-[#29252A] text-[#B0ACB0] hover:text-[#F5F5F5] transition disabled:opacity-50"
            title="Refresh Staff List"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#C9A34E]' : ''}`} />
          </button>
          <button
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#C9A34E] to-[#B38F3F] text-[#0D0B0D] font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-[#C9A34E]/20 hover:brightness-110 active:scale-95 transition"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Add Support Staff</span>
          </button>
        </div>
      </div>

      {/* Security Architecture Badge Notice */}
      <div className="bg-[#171418] border border-[#29252A] rounded-xl p-4 flex items-start gap-3 text-xs text-[#B0ACB0]">
        <Shield className="w-4 h-4 text-[#C9A34E] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-[#F5F5F5]">
            Authoritative Support Access System
          </p>
          <p className="text-[11px] leading-relaxed text-[#777278]">
            Support Staff authorization is maintained securely in the database. Active staff can log into the WINX7 Support Web App. Disabled or removed users retain their player accounts and wallet data completely intact.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#141215] border border-[#29252A] p-3 rounded-2xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#777278] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search support staff by name, email, username, IGN, or UID..."
            className="w-full bg-[#1B181C] text-[#F5F5F5] text-xs pl-10 pr-4 py-2.5 rounded-xl border border-[#29252A] placeholder-[#777278] focus:outline-none focus:border-[#C9A34E]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777278] hover:text-[#F5F5F5]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 bg-[#1B181C] p-1 rounded-xl border border-[#29252A]">
          {(['ALL', 'ACTIVE', 'DISABLED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${
                statusFilter === st
                  ? 'bg-[#C9A34E] text-[#0D0B0D] shadow-md'
                  : 'text-[#777278] hover:text-[#F5F5F5]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Staff Table / Cards */}
      <div className="bg-[#141215] border border-[#29252A] rounded-2xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="py-16 text-center text-[#777278] space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#C9A34E]" />
            <p className="text-xs uppercase font-extrabold tracking-wider">Loading Support Staff...</p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="py-16 text-center text-[#777278] space-y-3">
            <Users className="w-10 h-10 mx-auto text-[#29252A]" />
            <p className="text-sm font-bold text-[#F5F5F5]">No Support Staff Found</p>
            <p className="text-xs text-[#777278] max-w-sm mx-auto">
              {searchQuery
                ? 'No support staff matching your search query.'
                : 'Click "+ Add Support Staff" above to grant support privileges to an existing WINX7 user.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#29252A]">
            {filteredStaff.map((staff) => (
              <div
                key={staff.id || staff.userId}
                className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#181519] transition"
              >
                {/* Staff Details */}
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-[#1B181C] border border-[#29252A] flex items-center justify-center text-sm font-black text-[#C9A34E] shrink-0 overflow-hidden">
                    {staff.avatarUrl ? (
                      <img src={staff.avatarUrl} alt={staff.name} className="w-full h-full object-cover" />
                    ) : (
                      staff.name.substring(0, 2).toUpperCase()
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-sm text-[#F5F5F5]">{staff.name}</span>
                      {staff.username && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#1B181C] text-[#C9A34E] border border-[#29252A] flex items-center gap-1">
                          <AtSign className="w-2.5 h-2.5 text-[#C9A34E]" />
                          <span>{staff.username}</span>
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-[#350A12] text-[#C9A34E] border border-[#C9A34E]/30">
                        SUPPORT STAFF
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                          staff.status === 'ACTIVE'
                            ? 'bg-emerald-950/50 text-emerald-400 border-emerald-500/30'
                            : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                        }`}
                      >
                        {staff.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[#777278] flex-wrap">
                      {staff.email ? (
                        <span className="flex items-center gap-1.5 text-[#B0ACB0] font-medium bg-[#1B181C]/90 px-2 py-0.5 rounded-md border border-[#29252A]/80">
                          <Mail className="w-3 h-3 text-[#C9A34E]" />
                          <span>{staff.email}</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-[#555057] italic">
                          <Mail className="w-3 h-3 text-[#555057]" />
                          <span>No email linked</span>
                        </span>
                      )}
                      {staff.inGameName && (
                        <span className="flex items-center gap-1 text-[#9E98A0]">
                          <Gamepad2 className="w-3 h-3 text-[#777278]" />
                          IGN: {staff.inGameName}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-[#666168]">
                        <Clock className="w-3 h-3 text-[#555057]" />
                        Assigned: {new Date(staff.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end md:self-center">
                  {staff.status === 'ACTIVE' ? (
                    <button
                      onClick={() => {
                        setTargetStaff(staff);
                        setConfirmActionType('DISABLE');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1B181C] hover:bg-[#252126] border border-amber-900/40 text-amber-400 text-xs font-bold transition"
                      title="Disable Support Access"
                    >
                      <PowerOff className="w-3.5 h-3.5 text-amber-400" />
                      <span>Disable Access</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setTargetStaff(staff);
                        setConfirmActionType('ENABLE');
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-950/60 border border-emerald-500/40 text-emerald-400 text-xs font-bold transition"
                      title="Re-enable Support Access"
                    >
                      <Power className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Re-enable Access</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setTargetStaff(staff);
                      setConfirmActionType('REMOVE');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1B181C] hover:bg-[#2A0808] border border-[#29252A] hover:border-[#E21B36]/50 text-[#777278] hover:text-[#E21B36] text-xs font-bold transition"
                    title="Remove Support Staff Role"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Remove Role</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD SUPPORT STAFF (PICK EXISTING WINX7 AUTHENTICATED USER) */}
      {/* ========================================================================= */}
      {showAddModal && !showConfirmGrantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#141215] border border-[#29252A] rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 sm:p-5 border-b border-[#29252A] flex items-center justify-between bg-gradient-to-r from-[#350A12]/40 to-transparent">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#1B181C] border border-[#29252A] flex items-center justify-center text-[#C9A34E]">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm uppercase text-[#F5F5F5]">Add Support Staff</h3>
                  <p className="text-[10px] text-[#777278]">Select an existing WINX7 authenticated user</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-[#777278] hover:text-[#F5F5F5] p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4 border-b border-[#29252A] bg-[#171418]">
              <div className="relative">
                <Search className="w-4 h-4 text-[#777278] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUserSearchQuery(val);
                    if (val.trim().length > 1) {
                      loadAvailableUsers(val.trim());
                    }
                  }}
                  placeholder="Search existing users by name, email, IGN, or UID..."
                  className="w-full bg-[#1B181C] text-[#F5F5F5] text-xs pl-9 pr-3 py-2.5 rounded-xl border border-[#29252A] placeholder-[#777278] focus:outline-none focus:border-[#C9A34E]"
                  autoFocus
                />
              </div>
            </div>

            {/* User Candidate List */}
            <div className="flex-1 overflow-y-auto p-4 divide-y divide-[#29252A] custom-scrollbar">
              {loadingUsers && candidateUsers.length === 0 ? (
                <div className="py-12 text-center text-[#777278] space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#C9A34E]" />
                  <p className="text-xs font-bold uppercase tracking-wider">Loading registered WINX7 users...</p>
                </div>
              ) : candidateUsers.length === 0 ? (
                <div className="py-12 text-center text-[#777278] space-y-2">
                  <Users className="w-8 h-8 mx-auto text-[#29252A]" />
                  <p className="text-xs font-bold text-[#F5F5F5]">No matching users available</p>
                  <p className="text-[11px] max-w-xs mx-auto text-[#777278]">
                    {userSearchQuery
                      ? 'No users match your search query.'
                      : 'All existing registered users currently have active Support Staff access.'}
                  </p>
                </div>
              ) : (
                candidateUsers.map((user) => (
                  <div
                    key={user.id}
                    onClick={() => {
                      setSelectedUser(user);
                      setShowConfirmGrantModal(true);
                    }}
                    className={`py-3 px-3 flex items-center justify-between rounded-xl cursor-pointer transition group my-1 ${
                      user.isPreviouslyDisabled
                        ? 'hover:bg-[#201815] bg-[#171214]/50 border border-amber-900/30'
                        : 'hover:bg-[#1B181C] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#1B181C] border border-[#29252A] flex items-center justify-center text-xs font-bold text-[#C9A34E] overflow-hidden shrink-0">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                        ) : (
                          user.name.substring(0, 2).toUpperCase()
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-bold text-[#F5F5F5] group-hover:text-[#C9A34E] transition">
                            {user.name}
                          </p>
                          {user.username && (
                            <span className="text-[10px] font-medium text-[#C9A34E] flex items-center gap-0.5">
                              <AtSign className="w-2.5 h-2.5" />
                              {user.username}
                            </span>
                          )}
                          {user.isPreviouslyDisabled ? (
                            <span className="px-2 py-0.2 text-[9px] font-black uppercase tracking-wider bg-amber-950/60 text-amber-400 rounded-md border border-amber-500/30">
                              PREVIOUSLY DISABLED
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider bg-[#1B181C] text-[#777278] rounded border border-[#29252A]">
                              USER
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5 text-[10px] text-[#777278] flex-wrap">
                          {user.email ? (
                            <span className="flex items-center gap-1 text-[#B0ACB0] font-medium">
                              <Mail className="w-2.5 h-2.5 text-[#C9A34E]" />
                              {user.email}
                            </span>
                          ) : (
                            <span className="text-[#555057] italic">No email linked</span>
                          )}
                          {user.inGameName && (
                            <span className="flex items-center gap-1 text-[#9E98A0]">
                              <Gamepad2 className="w-2.5 h-2.5 text-[#777278]" />
                              IGN: {user.inGameName}
                            </span>
                          )}
                          <span className="text-[#555057] font-mono">
                            UID: {user.id.substring(0, 8)}...
                          </span>
                        </div>
                      </div>
                    </div>

                    <button
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition ${
                        user.isPreviouslyDisabled
                          ? 'bg-amber-500 hover:bg-amber-400 text-black shadow-md shadow-amber-500/20'
                          : 'bg-[#350A12] group-hover:bg-[#C9A34E] text-[#C9A34E] group-hover:text-[#0D0B0D]'
                      }`}
                    >
                      {user.isPreviouslyDisabled ? 'Reactivate Staff' : 'Assign Staff'}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-[#29252A] flex justify-between items-center bg-[#141215]">
              <span className="text-[10px] text-[#777278]">
                Showing {candidateUsers.length} available {candidateUsers.length === 1 ? 'user' : 'users'}
              </span>
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl bg-[#1B181C] text-[#B0ACB0] text-xs font-bold hover:text-[#F5F5F5]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CONFIRM GRANT / REACTIVATE SUPPORT STAFF ACCESS */}
      {/* ========================================================================= */}
      {showConfirmGrantModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#141215] border border-[#C9A34E]/40 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#350A12] border border-[#C9A34E]/40 flex items-center justify-center text-[#C9A34E] shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-[#F5F5F5] uppercase">
                  {selectedUser.isPreviouslyDisabled ? 'Reactivate Support Staff Access?' : 'Grant Support Staff Access?'}
                </h3>
                <p className="text-xs text-[#777278]">
                  {selectedUser.isPreviouslyDisabled ? 'Restore Support Web App access' : 'Granting access to WINX7 Support Web App'}
                </p>
              </div>
            </div>

            <div className="bg-[#1B181C] border border-[#29252A] rounded-xl p-4 space-y-2.5">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#777278] block">User Profile:</span>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-bold text-[#F5F5F5]">{selectedUser.name}</p>
                  {selectedUser.username && (
                    <span className="text-[11px] font-medium text-[#C9A34E] flex items-center gap-0.5">
                      <AtSign className="w-2.5 h-2.5" />
                      {selectedUser.username}
                    </span>
                  )}
                </div>
                {selectedUser.email && (
                  <p className="text-[11px] text-[#B0ACB0] flex items-center gap-1.5 pt-0.5">
                    <Mail className="w-3 h-3 text-[#C9A34E]" />
                    <span>{selectedUser.email}</span>
                  </p>
                )}
                {selectedUser.inGameName && (
                  <p className="text-[11px] text-[#777278] flex items-center gap-1.5">
                    <Gamepad2 className="w-3 h-3 text-[#777278]" />
                    <span>IGN: {selectedUser.inGameName}</span>
                  </p>
                )}
                <p className="text-[10px] text-[#555057] font-mono pt-1">
                  User ID: {selectedUser.id}
                </p>
              </div>

              <div className="pt-2 border-t border-[#29252A] flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#777278] block">Role:</span>
                  <span className="inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#350A12] text-[#C9A34E] border border-[#C9A34E]/30">
                    SUPPORT STAFF
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#777278] block">Status:</span>
                  <span className="inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-950/50 text-emerald-400 border border-emerald-500/30">
                    ACTIVE
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-[#777278] leading-relaxed">
              {selectedUser.isPreviouslyDisabled
                ? 'This user previously had Support Staff access disabled. Reactivating will restore their ability to log into the WINX7 Support Web App. No duplicate account will be created.'
                : 'This will allow this user to log into the WINX7 Support Web App to respond to customer inquiries and tickets. No duplicate account will be created.'}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowConfirmGrantModal(false)}
                disabled={isSubmittingGrant}
                className="px-4 py-2 rounded-xl bg-[#1B181C] text-[#B0ACB0] text-xs font-bold hover:text-[#F5F5F5] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmGrantAccess}
                disabled={isSubmittingGrant}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#C9A34E] to-[#B38F3F] text-[#0D0B0D] text-xs font-black uppercase tracking-wider shadow-lg shadow-[#C9A34E]/20 hover:brightness-110 active:scale-95 transition disabled:opacity-50 flex items-center gap-2"
              >
                {isSubmittingGrant ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>{selectedUser.isPreviouslyDisabled ? 'Reactivate Access' : 'Grant Access'}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CONFIRM ACTION (DISABLE / ENABLE / REMOVE) */}
      {/* ========================================================================= */}
      {targetStaff && confirmActionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#141215] border border-[#29252A] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  confirmActionType === 'DISABLE'
                    ? 'bg-amber-950/40 border-amber-500/40 text-amber-400'
                    : confirmActionType === 'ENABLE'
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-400'
                    : 'bg-red-950/40 border-red-500/40 text-red-400'
                }`}
              >
                {confirmActionType === 'DISABLE' && <PowerOff className="w-5 h-5" />}
                {confirmActionType === 'ENABLE' && <Power className="w-5 h-5" />}
                {confirmActionType === 'REMOVE' && <Trash2 className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-black text-[#F5F5F5] uppercase">
                  {confirmActionType === 'DISABLE' && 'Disable Support Access?'}
                  {confirmActionType === 'ENABLE' && 'Re-enable Support Access?'}
                  {confirmActionType === 'REMOVE' && 'Remove Support Staff Role?'}
                </h3>
                <p className="text-xs text-[#777278]">Staff member: {targetStaff.name}</p>
              </div>
            </div>

            <p className="text-xs text-[#B0ACB0] leading-relaxed">
              {confirmActionType === 'DISABLE' &&
                'This user will no longer be able to access WINX7 Support. Their player account and login credentials will remain active.'}
              {confirmActionType === 'ENABLE' &&
                'This user will regain access to the WINX7 Support Web App immediately.'}
              {confirmActionType === 'REMOVE' &&
                'This will permanently remove the Support Staff role from this user. Their WINX7 user account and wallet data will NOT be deleted.'}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setTargetStaff(null);
                  setConfirmActionType(null);
                }}
                disabled={isProcessingAction}
                className="px-4 py-2 rounded-xl bg-[#1B181C] text-[#B0ACB0] text-xs font-bold hover:text-[#F5F5F5] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteAction}
                disabled={isProcessingAction}
                className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition disabled:opacity-50 flex items-center gap-2 ${
                  confirmActionType === 'DISABLE'
                    ? 'bg-amber-600 hover:bg-amber-500 text-black'
                    : confirmActionType === 'ENABLE'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-black'
                    : 'bg-[#E21B36] hover:bg-red-500 text-white'
                }`}
              >
                {isProcessingAction ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : confirmActionType === 'DISABLE' ? (
                  'Disable Access'
                ) : confirmActionType === 'ENABLE' ? (
                  'Enable Access'
                ) : (
                  'Remove Role'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
