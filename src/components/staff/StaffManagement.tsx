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
  Sparkles,
  Flame,
  Target,
  Edit3,
  ListTodo
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AppUser, StaffMember, StaffStatus, StaffAssignedGame } from '../../types';
import { supabase } from '../../services/supabase';
import {
  fetchStaffMembersFromSupabase,
  createStaffMemberInSupabase,
  suspendStaffMemberInSupabase,
  reactivateStaffMemberInSupabase,
  removeStaffMemberInSupabase,
  updateStaffMemberGameAssignmentInSupabase,
  formatStaffError
} from '../../services/supabaseService';
import { StaffDailyTasksCard } from './StaffDailyTasksCard';

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
  const [gameFilter, setGameFilter] = useState<'ALL' | 'Free Fire' | 'BGMI' | 'NOT_ASSIGNED'>('ALL');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedUserForStaff, setSelectedUserForStaff] = useState<AppUser | null>(null);
  const [selectedGameForStaff, setSelectedGameForStaff] = useState<'Free Fire' | 'BGMI'>('Free Fire');
  const [adminNotes, setAdminNotes] = useState('');
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [createResult, setCreateResult] = useState<{ staffId: string; user: AppUser; assignedGame: string } | null>(null);

  // Details Modal
  const [selectedStaffDetails, setSelectedStaffDetails] = useState<StaffMember | null>(null);

  // Edit Game Assignment Modal
  const [staffToEditGame, setStaffToEditGame] = useState<StaffMember | null>(null);
  const [editGameValue, setEditGameValue] = useState<'Free Fire' | 'BGMI'>('Free Fire');
  const [isUpdatingGame, setIsUpdatingGame] = useState(false);

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
    const freeFire = staffMembers.filter((s) => s.assignedGame === 'Free Fire' || s.assigned_game === 'Free Fire').length;
    const bgmi = staffMembers.filter((s) => s.assignedGame === 'BGMI' || s.assigned_game === 'BGMI').length;
    const unassigned = staffMembers.filter((s) => !s.assignedGame && !s.assigned_game).length;
    return { total, active, suspended, removed, freeFire, bgmi, unassigned };
  }, [staffMembers]);

  // Filtered Staff List
  const filteredStaff = useMemo(() => {
    return staffMembers.filter((member) => {
      // Status Filter
      if (statusFilter !== 'ALL' && member.status !== statusFilter) {
        return false;
      }

      // Game Filter
      const memberGame = member.assignedGame || member.assigned_game;
      if (gameFilter === 'Free Fire' && memberGame !== 'Free Fire') {
        return false;
      }
      if (gameFilter === 'BGMI' && memberGame !== 'BGMI') {
        return false;
      }
      if (gameFilter === 'NOT_ASSIGNED' && memberGame && memberGame !== 'Not Assigned') {
        return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const nameMatch = (member.name || '').toLowerCase().includes(query) || (member.displayName || '').toLowerCase().includes(query);
        const staffIdMatch = (member.staffId || member.staff_id || member.id || '').toLowerCase().includes(query);
        const emailMatch = (member.email || '').toLowerCase().includes(query);
        const phoneMatch = (member.phone || '').toLowerCase().includes(query);
        const ffIgnMatch = (member.ffIgn || member.ff_ign || member.inGameName || '').toLowerCase().includes(query);
        const gameMatch = (memberGame || '').toLowerCase().includes(query);

        return nameMatch || staffIdMatch || emailMatch || phoneMatch || ffIgnMatch || gameMatch;
      }

      return true;
    });
  }, [staffMembers, statusFilter, gameFilter, searchQuery]);

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
      const ffIgnMatch = (u.inGameName || '').toLowerCase().includes(q);
      const idMatch = (u.id || '').toLowerCase().includes(q) || (u.uid || '').toLowerCase().includes(q);
      return nameMatch || emailMatch || phoneMatch || ffIgnMatch || idMatch;
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

  // Handler: Confirm Creation of Staff Member with Game Assignment
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
      const res = await createStaffMemberInSupabase(targetUserId, adminNotes.trim(), selectedGameForStaff);

      if (!res.success) {
        throw new Error(res.error || 'Failed to create staff member.');
      }

      const generatedId = res.staffId || 'WX7-STF-NEW';
      setCreateResult({
        staffId: generatedId,
        user: selectedUserForStaff,
        assignedGame: selectedGameForStaff
      });

      // Reload staff list
      await loadStaffMembers();
      setActionSuccess(`Staff member created successfully! Appointed for ${selectedGameForStaff} with Staff ID: ${generatedId}`);
    } catch (err: any) {
      console.error('[StaffManagement] Create staff error:', err);
      setActionError(formatStaffError(err));
    } finally {
      setIsCreatingStaff(false);
    }
  };

  // Handler: Open Edit Game Modal
  const handleOpenEditGameModal = (staff: StaffMember, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStaffToEditGame(staff);
    const currentGame = (staff.assignedGame || staff.assigned_game) as 'Free Fire' | 'BGMI';
    setEditGameValue(currentGame === 'BGMI' ? 'BGMI' : 'Free Fire');
  };

  // Handler: Confirm Update Game Assignment
  const handleConfirmEditGame = async () => {
    if (!staffToEditGame) return;
    if (!isSuperAdmin) {
      setActionError('Only SUPERADMIN can modify staff game assignments.');
      return;
    }

    setIsUpdatingGame(true);
    setActionError(null);

    try {
      const selectedGame = editGameValue;
      if (selectedGame !== 'Free Fire' && selectedGame !== 'BGMI') {
        throw new Error('Please select either "Free Fire" or "BGMI".');
      }

      // Requirement 6: Make sure the update is executed using the currently authenticated SUPERADMIN Supabase session.
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr || !sessionData?.session) {
        console.error('[StaffManagement] Supabase auth session error:', sessionErr);
        throw new Error('Authenticated SUPERADMIN session required. Please re-login.');
      }

      console.log('[StaffManagement] Superadmin authenticated session:', {
        user: sessionData.session.user?.email,
        id: sessionData.session.user?.id
      });

      // Requirement 5: Make sure "staffId" is the "staff_members.id", NOT the user_id and NOT the staff_id text.
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const staffCode = staffToEditGame.staffId || staffToEditGame.staff_id;
      const userUuid = staffToEditGame.userId || staffToEditGame.user_id;
      let staffRowId = staffToEditGame.staffRecordId || staffToEditGame.staff_member_id || staffToEditGame.id;

      console.log('[StaffManagement] Initial staff record for update:', {
        selectedStaff: staffToEditGame,
        candidateId: staffRowId,
        staffCode,
        userUuid,
        selectedGame
      });

      // If staffRowId is not a valid UUID or matches user_id or staff_id text, query staff_members to resolve exact staff_members.id
      if (!staffRowId || !UUID_REGEX.test(staffRowId) || staffRowId === staffCode || (userUuid && staffRowId === userUuid)) {
        let lookupQuery = supabase.from('staff_members').select('id, user_id, staff_id');
        if (staffCode) {
          lookupQuery = lookupQuery.or(`staff_id.eq.${staffCode},staff_code.eq.${staffCode}`);
        } else if (userUuid) {
          lookupQuery = lookupQuery.eq('user_id', userUuid);
        }
        const { data: matchedRows, error: lookupErr } = await lookupQuery.limit(1);
        if (lookupErr) {
          console.error('[StaffManagement] Error resolving staff_members.id:', lookupErr);
          throw new Error(`Database error resolving staff row: ${lookupErr.message}`);
        }
        if (matchedRows && matchedRows[0]?.id) {
          staffRowId = matchedRows[0].id;
        }
      }

      console.log('[StaffManagement] Authoritative staff_members row ID to update:', staffRowId);

      // Requirement 1: supabase.from('staff_members').update({ assigned_game: selectedGame, updated_at: new Date().toISOString() }).eq('id', staffId)
      const updatePayload = {
        assigned_game: selectedGame,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('staff_members')
        .update(updatePayload)
        .eq('id', staffRowId)
        .select();

      // Log exact staff row ID and update response
      console.log('[StaffManagement] Supabase update response:', {
        staffRowId,
        selectedGame,
        data,
        error
      });

      // Requirement 2 & 3: Check returned { data, error }. If error exists, display REAL Supabase error message and do not show success.
      if (error) {
        console.error('[StaffManagement] Direct Supabase update error:', error);
        throw new Error(error.message || error.details || 'Supabase database update failed');
      }

      if (!data || data.length === 0) {
        console.warn('[StaffManagement] 0 rows matched by id:', staffRowId, '- attempting fallback by user_id/staff_id');
        let fallbackMatched = false;
        if (userUuid) {
          const { data: fbDataUser, error: fbErrUser } = await supabase
            .from('staff_members')
            .update(updatePayload)
            .eq('user_id', userUuid)
            .select();
          if (!fbErrUser && fbDataUser && fbDataUser.length > 0) {
            fallbackMatched = true;
            console.log('[StaffManagement] Fallback updated by user_id:', fbDataUser);
          }
        }
        if (!fallbackMatched && staffCode) {
          const { data: fbDataCode, error: fbErrCode } = await supabase
            .from('staff_members')
            .update(updatePayload)
            .or(`staff_id.eq.${staffCode},staff_code.eq.${staffCode}`)
            .select();
          if (!fbErrCode && fbDataCode && fbDataCode.length > 0) {
            fallbackMatched = true;
            console.log('[StaffManagement] Fallback updated by staffCode:', fbDataCode);
          }
        }

        if (!fallbackMatched) {
          throw new Error(`No staff record found in public.staff_members matching ID "${staffRowId}". Ensure the record exists in Supabase.`);
        }
      }

      // Also update profiles for consistency if userUuid is present
      if (userUuid) {
        try {
          await supabase.from('profiles').update({ assigned_game: selectedGame }).eq('id', userUuid);
        } catch (profileUpdateErr) {
          console.debug('[StaffManagement] Optional profile update notice:', profileUpdateErr);
        }
      }

      setActionSuccess(`Game assignment for ${staffToEditGame.name || staffCode || 'staff'} successfully updated to ${selectedGame}!`);
      setStaffToEditGame(null);

      // Requirement 4: After successful update, re-fetch "staff_members" and update the UI from the database response.
      await loadStaffMembers(true);
    } catch (err: any) {
      console.error('[StaffManagement] Edit game assignment error:', err);
      // Requirement 3 & 8: Display the REAL Supabase error message, do not silently catch/ignore
      setActionError(err?.message || 'Failed to update game assignment.');
    } finally {
      setIsUpdatingGame(false);
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
      <div id="staff-restricted-view" className="p-8 rounded-3xl bg-[#0D0B0D] border border-[#350A12] text-center max-w-2xl mx-auto my-12 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8 text-rose-400" />
        </div>
        <h2 className="text-xl font-extrabold text-white mb-2">Access Restricted</h2>
        <p className="text-sm text-[#B0ACB0]/80 mb-6">
          Staff Management is exclusively restricted to authorized <strong className="text-[#C9A34E]">SUPERADMIN</strong> accounts.
          Normal users and staff accounts are strictly forbidden from viewing or modifying tournament staff.
        </p>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0D0B0D]/60 border border-[#29252A] text-xs text-[#B0ACB0] font-mono">
          Current Role: <span className="text-rose-400 font-bold uppercase">{currentUser?.role || 'USER'}</span>
        </div>
      </div>
    );
  }

  return (
    <div id="staff-management-container" className="space-y-6 animate-in fade-in pb-16 md:pb-8">
      {/* Toast Notifications */}
      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-[#350A12]/80 border border-emerald-500/40 flex items-center justify-between shadow-lg animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#C9A34E] flex-shrink-0" />
            <p className="text-xs font-semibold text-emerald-200">{actionSuccess}</p>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="p-1 rounded-lg text-[#C9A34E] hover:text-white transition"
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-3xl bg-gradient-to-r from-[#350A12]/30 via-[#0D0B0D] to-[#141215] border border-[#29252A] shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#C9A34E] to-[#E21B36] p-0.5 shadow-md">
              <div className="w-full h-full bg-[#0D0B0D] rounded-[14px] flex items-center justify-center">
                <Users className="w-5 h-5 text-[#C9A34E]" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Staff Management
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-amber-400/20 text-[#C9A34E] border border-amber-400/30">
                  SUPERADMIN ONLY
                </span>
              </h1>
              <p className="text-xs text-[#B0ACB0]/80">
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
            className="p-2.5 rounded-xl bg-[#0D0B0D]/60 hover:bg-[#1B181C] border border-[#29252A] text-[#B0ACB0] hover:text-white transition active:scale-95 disabled:opacity-50"
            title="Refresh Staff List"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#C9A34E]' : ''}`} />
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
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Total Staff */}
        <div className="p-4 rounded-2xl bg-[#141215] border border-[#29252A] flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-[#777278] uppercase tracking-wider">Total Staff</p>
            <h3 className="text-2xl font-black text-white mt-1">{stats.total}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#1B181C] border border-[#29252A] flex items-center justify-center text-[#B0ACB0]">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* Free Fire Staff */}
        <div className="p-4 rounded-2xl bg-[#141215] border border-orange-500/30 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-orange-400 uppercase tracking-wider flex items-center gap-1">
              <Flame className="w-3 h-3" /> Free Fire
            </p>
            <h3 className="text-2xl font-black text-orange-400 mt-1">{stats.freeFire}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-950/40 border border-orange-500/40 flex items-center justify-center text-orange-400">
            <Flame className="w-5 h-5" />
          </div>
        </div>

        {/* BGMI Staff */}
        <div className="p-4 rounded-2xl bg-[#141215] border border-amber-500/30 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
              <Gamepad2 className="w-3 h-3" /> BGMI
            </p>
            <h3 className="text-2xl font-black text-amber-400 mt-1">{stats.bgmi}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Gamepad2 className="w-5 h-5" />
          </div>
        </div>

        {/* Active */}
        <div className="p-4 rounded-2xl bg-[#141215] border border-[#29252A] flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-[#C9A34E] uppercase tracking-wider">Active</p>
            <h3 className="text-2xl font-black text-[#C9A34E] mt-1">{stats.active}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#350A12] border border-emerald-700/50 flex items-center justify-center text-[#C9A34E]">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        {/* Suspended */}
        <div className="p-4 rounded-2xl bg-[#141215] border border-amber-800/40 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-[#C9A34E] uppercase tracking-wider">Suspended</p>
            <h3 className="text-2xl font-black text-[#C9A34E] mt-1">{stats.suspended}</h3>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-700/50 flex items-center justify-center text-[#C9A34E]">
            <Ban className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Search and Filters Section */}
      <div className="p-4 rounded-2xl bg-[#141215] border border-[#29252A] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#777278] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="staff-search-input"
            type="text"
            placeholder="Search by name, Staff ID, email, phone, game, IGN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#0D0B0D] border border-[#29252A] rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-[#C9A34E] transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777278] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Badges & Game Filters */}
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          {/* Game Filters */}
          <div className="flex items-center gap-1 bg-[#0D0B0D] p-1 rounded-xl border border-[#29252A]">
            <button
              onClick={() => setGameFilter('ALL')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex-shrink-0 cursor-pointer ${
                gameFilter === 'ALL'
                  ? 'bg-amber-400 text-black font-extrabold shadow'
                  : 'text-[#B0ACB0] hover:text-white'
              }`}
            >
              All Games
            </button>
            <button
              onClick={() => setGameFilter('Free Fire')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex-shrink-0 flex items-center gap-1 cursor-pointer ${
                gameFilter === 'Free Fire'
                  ? 'bg-orange-500 text-white font-extrabold shadow'
                  : 'text-orange-400 hover:text-orange-300'
              }`}
            >
              <Flame className="w-3 h-3" />
              Free Fire
            </button>
            <button
              onClick={() => setGameFilter('BGMI')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex-shrink-0 flex items-center gap-1 cursor-pointer ${
                gameFilter === 'BGMI'
                  ? 'bg-amber-500 text-black font-extrabold shadow'
                  : 'text-amber-400 hover:text-amber-300'
              }`}
            >
              <Gamepad2 className="w-3 h-3" />
              BGMI
            </button>
          </div>

          {/* Status Filter Buttons */}
          {(['ALL', 'ACTIVE', 'SUSPENDED', 'REMOVED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition flex-shrink-0 cursor-pointer ${
                statusFilter === st
                  ? 'bg-purple-800 text-[#C9A34E] border border-[#C9A34E]/30 shadow'
                  : 'bg-[#0D0B0D]/40 text-[#B0ACB0] hover:bg-[#1B181C] hover:text-white border border-[#29252A]/30'
              }`}
            >
              {st === 'ALL' ? 'All Status' : st}
            </button>
          ))}

          {/* Role Filter (Fixed to STAFF) */}
          <div className="px-3 py-2 rounded-xl text-xs font-black bg-[#0D0B0D]/80 text-[#C9A34E] border border-[#C9A34E]/30 flex items-center gap-1 flex-shrink-0">
            <Shield className="w-3.5 h-3.5 text-[#C9A34E]" />
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
              className="h-20 rounded-2xl bg-[#141215] border border-[#29252A] animate-pulse"
            />
          ))}
        </div>
      ) : filteredStaff.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#141215] border border-[#29252A] text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-[#0D0B0D]/60 border border-[#29252A] flex items-center justify-center mx-auto text-[#777278]">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white">No Staff Members Found</h3>
          <p className="text-xs text-[#B0ACB0]/70 max-w-sm mx-auto">
            {searchQuery || statusFilter !== 'ALL' || gameFilter !== 'ALL'
              ? 'No staff members match the current search filters. Try adjusting your query.'
              : 'No staff accounts have been added yet. Click "+ Add Staff" to search and appoint a WinX7 user as tournament staff.'}
          </p>
          {!searchQuery && statusFilter === 'ALL' && gameFilter === 'ALL' && (
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
          <div className="hidden lg:block rounded-3xl bg-[#141215] border border-[#29252A] overflow-hidden shadow-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#0D0B0D] border-b border-[#29252A] text-[#B0ACB0] uppercase tracking-wider font-extrabold text-[10px]">
                <tr>
                  <th className="px-4 py-3.5">Staff Name & ID</th>
                  <th className="px-4 py-3.5">Assigned Game</th>
                  <th className="px-4 py-3.5">Contact Info</th>
                  <th className="px-4 py-3.5">In-Game Name (IGN)</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Joined Date</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-900/30">
                {filteredStaff.map((staff) => {
                  const staffDisplayId = staff.staffId || staff.staff_id || staff.id;
                  const assignedGame = staff.assignedGame || staff.assigned_game;

                  return (
                    <tr
                      key={staff.id}
                      className="hover:bg-[#0D0B0D]/30 transition group cursor-pointer"
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
                            <h4 className="font-bold text-white text-sm truncate group-hover:text-[#C9A34E] transition">
                              {staff.name || staff.displayName || 'Staff Member'}
                            </h4>
                            <span className="font-mono text-[11px] text-[#C9A34E]/90 font-bold block">
                              {staffDisplayId}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Assigned Game */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          {assignedGame === 'Free Fire' ? (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 bg-orange-950/60 text-orange-400 border border-orange-600/50">
                              <Flame className="w-3 h-3 text-orange-400" />
                              Free Fire
                            </span>
                          ) : assignedGame === 'BGMI' ? (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 bg-amber-950/60 text-amber-400 border border-amber-500/50">
                              <Gamepad2 className="w-3 h-3 text-amber-400" />
                              BGMI
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-[#777278] bg-[#0D0B0D] border border-[#29252A]">
                              Not Assigned
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => handleOpenEditGameModal(staff, e)}
                            className="p-1 rounded-md text-[#777278] hover:text-[#C9A34E] hover:bg-[#1B181C] transition opacity-70 group-hover:opacity-100"
                            title="Edit Game Assignment"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      {/* Email & Phone */}
                      <td className="px-4 py-3.5">
                        <div className="space-y-0.5">
                          <p className="text-[#B0ACB0] flex items-center gap-1.5 truncate">
                            <Mail className="w-3.5 h-3.5 text-[#777278] flex-shrink-0" />
                            <span className="truncate">{staff.email || 'No email'}</span>
                          </p>
                          <p className="text-[#777278] text-[11px] flex items-center gap-1.5">
                            <Phone className="w-3 h-3 text-[#E21B36] flex-shrink-0" />
                            <span>{staff.phone || 'No phone'}</span>
                          </p>
                        </div>
                      </td>

                      {/* In-Game Name (IGN) */}
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-[#F5F5F5] flex items-center gap-1.5 truncate">
                          <Gamepad2 className="w-3.5 h-3.5 text-[#C9A34E] flex-shrink-0" />
                          <span className="truncate">{staff.bgmiIgn || staff.bgmi_ign || staff.ffIgn || staff.ff_ign || staff.inGameName || 'No IGN'}</span>
                        </p>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3.5">
                        <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-[#1B181C] text-[#C9A34E] border border-[#C9A34E]/30">
                          STAFF
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 border ${
                            staff.status === 'ACTIVE'
                              ? 'bg-[#350A12]/80 text-[#C9A34E] border-emerald-700/60'
                              : staff.status === 'SUSPENDED'
                              ? 'bg-amber-950/80 text-[#C9A34E] border-amber-700/60'
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
                      <td className="px-4 py-3.5 text-[#B0ACB0] text-[11px]">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[#777278]" />
                          <span>{formatDate(staff.joinedDate || staff.created_at)}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedStaffDetails(staff)}
                            className="p-1.5 rounded-lg bg-[#0D0B0D] hover:bg-[#141215] text-[#B0ACB0] hover:text-white border border-[#29252A] transition"
                            title="View Staff Profile"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleOpenEditGameModal(staff, e)}
                            className="p-1.5 rounded-lg bg-amber-400/10 hover:bg-amber-400 hover:text-black text-[#C9A34E] border border-amber-400/30 transition"
                            title="Edit Game Assignment"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {staff.status === 'ACTIVE' && (
                            <>
                              <button
                                onClick={() => setStaffToSuspend(staff)}
                                className="px-2 py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 text-[#C9A34E] border border-amber-800/50 text-[11px] font-bold transition"
                                title="Suspend Staff"
                              >
                                Suspend
                              </button>
                              <button
                                onClick={() => setStaffToRemove(staff)}
                                className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition"
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
                                className="px-2 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-700 text-emerald-300 hover:text-white border border-emerald-700/60 text-[11px] font-bold transition"
                                title="Reactivate Staff"
                              >
                                Reactivate
                              </button>
                              <button
                                onClick={() => setStaffToRemove(staff)}
                                className="p-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition"
                                title="Remove Staff"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {staff.status === 'REMOVED' && (
                            <span className="text-[10px] text-[#777278] font-semibold px-2 py-1 bg-[#0D0B0D] rounded-lg">
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
              const assignedGame = staff.assignedGame || staff.assigned_game;

              return (
                <div
                  key={staff.id}
                  onClick={() => setSelectedStaffDetails(staff)}
                  className="p-4 rounded-2xl bg-[#141215] border border-[#29252A] hover:border-[#29252A] transition flex flex-col justify-between space-y-3 shadow-md cursor-pointer"
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
                        <p className="font-mono text-xs font-bold text-[#C9A34E]">
                          {staffDisplayId}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-[#141215]/80 text-[#C9A34E] border border-[#C9A34E]/30">
                            STAFF
                          </span>
                          {assignedGame === 'Free Fire' ? (
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase inline-flex items-center gap-0.5 bg-orange-950/80 text-orange-400 border border-orange-600/40">
                              <Flame className="w-2.5 h-2.5" /> Free Fire
                            </span>
                          ) : assignedGame === 'BGMI' ? (
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase inline-flex items-center gap-0.5 bg-amber-950/80 text-amber-400 border border-amber-500/40">
                              <Gamepad2 className="w-2.5 h-2.5" /> BGMI
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[9px] font-semibold text-[#777278] bg-[#0D0B0D] border border-[#29252A]">
                              Not Assigned
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                              staff.status === 'ACTIVE'
                                ? 'bg-[#350A12] text-[#C9A34E] border-[#29252A]'
                                : staff.status === 'SUSPENDED'
                                ? 'bg-amber-950 text-[#C9A34E] border-amber-800'
                                : 'bg-rose-950 text-rose-400 border-rose-800'
                            }`}
                          >
                            {staff.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[#29252A]/30">
                    <div>
                      <span className="text-[10px] text-[#777278] block font-semibold">Email</span>
                      <span className="text-[#B0ACB0] truncate block text-[11px]">
                        {staff.email || 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#777278] block font-semibold">Phone</span>
                      <span className="text-[#B0ACB0] truncate block text-[11px]">
                        {staff.phone || 'N/A'}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[10px] text-[#777278] block font-semibold">In-Game Name (IGN)</span>
                      <span className="text-[#F5F5F5] font-bold truncate block text-[11px]">
                        {staff.bgmiIgn || staff.bgmi_ign || staff.ffIgn || staff.ff_ign || staff.inGameName || 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div
                    className="pt-2.5 border-t border-[#29252A] flex items-center justify-between gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setSelectedStaffDetails(staff)}
                      className="flex-1 py-1.5 px-2 rounded-xl bg-[#0D0B0D] hover:bg-[#141215] text-[#B0ACB0] font-bold text-xs border border-[#29252A] text-center transition"
                    >
                      Details
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleOpenEditGameModal(staff, e)}
                      className="py-1.5 px-2.5 rounded-xl bg-amber-400/15 hover:bg-amber-400 hover:text-black text-[#C9A34E] font-bold text-xs border border-amber-400/30 transition flex items-center gap-1"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Game</span>
                    </button>

                    {staff.status === 'ACTIVE' && (
                      <>
                        <button
                          onClick={() => setStaffToSuspend(staff)}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-950/80 hover:bg-amber-900/80 text-[#C9A34E] border border-amber-800 font-bold text-xs transition"
                        >
                          Suspend
                        </button>
                        <button
                          onClick={() => setStaffToRemove(staff)}
                          className="p-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition"
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
                          className="px-2.5 py-1.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-700 text-emerald-300 hover:text-white border border-emerald-700/60 font-bold text-xs transition"
                        >
                          Reactivate
                        </button>
                        <button
                          onClick={() => setStaffToRemove(staff)}
                          className="p-1.5 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30 transition"
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
          <div className="w-full max-w-xl bg-[#0D0B0D] border border-[#29252A]/60 rounded-3xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#29252A]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-[#C9A34E]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    {createResult ? 'Staff Created Successfully' : 'Select WinX7 User to Appoint'}
                  </h3>
                  <p className="text-xs text-[#B0ACB0]/80">
                    {createResult
                      ? 'Tournament staff member is now provisioned'
                      : 'Search an existing registered user to grant tournament staff access'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-xl bg-[#0D0B0D] text-[#777278] hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

             {/* Success State */}
            {createResult ? (
              <div className="space-y-4 py-2">
                <div className="p-6 rounded-2xl bg-[#141215] border border-[#29252A] text-center space-y-3">
                  <div className="w-14 h-14 rounded-xl bg-[#C9A34E]/20 border border-[#C9A34E]/30 flex items-center justify-center mx-auto text-[#C9A34E]">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h4 className="text-base font-extrabold text-white">
                    Staff Member Successfully Created!
                  </h4>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <div className="inline-block px-4 py-1.5 rounded-xl bg-amber-400/20 border border-amber-400/40 text-[#C9A34E] font-mono font-black text-sm">
                      Staff ID: {createResult.staffId}
                    </div>
                    {createResult.assignedGame && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-900/40 border border-[#C9A34E]/40 text-[#C9A34E] font-black text-xs">
                        {createResult.assignedGame === 'Free Fire' ? (
                          <Flame className="w-3.5 h-3.5 text-orange-400" />
                        ) : (
                          <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        <span>{createResult.assignedGame}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-[#B0ACB0]/90 max-w-md mx-auto">
                    <strong>{createResult.user.username || createResult.user.displayName}</strong> can now log into the separate <strong>WinX7 Staff App</strong> with role <strong className="text-[#C9A34E]">STAFF</strong> assigned to <strong className="text-white">{createResult.assignedGame || 'the selected game'}</strong>.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setSelectedUserForStaff(null);
                      setCreateResult(null);
                      setUserSearchQuery('');
                      setAdminNotes('');
                      setSelectedGameForStaff('Free Fire');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-[#0D0B0D] hover:bg-[#141215] text-[#B0ACB0] text-xs font-bold transition"
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
                  <Search className="w-4 h-4 text-[#777278] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="user-search-modal-input"
                    type="text"
                    placeholder="Search by username, email, phone, In-Game IGN..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0D0B0D] border border-[#29252A]/60 rounded-xl text-xs text-white placeholder-purple-400/60 focus:outline-none focus:border-[#C9A34E]"
                    autoFocus
                  />
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                  {eligibleUsers.length === 0 ? (
                    <div className="p-6 text-center text-xs text-[#777278]">
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
                              ? 'bg-[#161230] border-[#29252A] hover:border-amber-500/60 hover:bg-[#0D0B0D]/40 cursor-pointer'
                              : 'bg-[#0D0B0D]/20 border-[#29252A]/30 opacity-60 cursor-not-allowed'
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
                                      ? 'bg-[#350A12] text-[#C9A34E]'
                                      : 'bg-rose-950 text-rose-400'
                                  }`}
                                >
                                  {user.status || 'active'}
                                </span>
                              </div>
                              <p className="text-[11px] text-[#B0ACB0]/80 truncate">
                                IGN: <strong className="text-[#F5F5F5]">{user.inGameName || 'N/A'}</strong>
                              </p>
                              <p className="text-[10px] text-[#777278]/80 truncate">
                                {user.email || user.phone || 'No contact info'}
                              </p>
                            </div>
                          </div>

                          <div className="flex-shrink-0">
                            {isEligible ? (
                              <button
                                type="button"
                                className="px-3 py-1.5 rounded-xl bg-amber-400/20 hover:bg-amber-400 hover:text-black text-[#C9A34E] font-extrabold text-xs border border-amber-400/40 transition"
                              >
                                Select
                              </button>
                            ) : (
                              <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-[#350A12] text-rose-400 border border-[#350A12]">
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
                <div className="p-4 rounded-2xl bg-[#161230] border border-[#C9A34E]/30 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-[#29252A]">
                    <span className="text-[11px] font-bold text-[#C9A34E] uppercase tracking-wider">
                      Selected WinX7 User
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedUserForStaff(null)}
                      className="text-xs text-[#B0ACB0] hover:text-white underline"
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
                      <p className="text-xs text-[#B0ACB0]">
                        In-Game IGN: <strong className="text-[#C9A34E]">{selectedUserForStaff.inGameName || 'N/A'}</strong>
                      </p>
                      <p className="text-[11px] text-[#777278] truncate">
                        {selectedUserForStaff.email || selectedUserForStaff.phone}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between text-xs">
                    <span className="text-[#B0ACB0]">Appointed Role:</span>
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase bg-[#141215] text-[#C9A34E] border border-[#C9A34E]/30">
                      STAFF
                    </span>
                  </div>
                </div>

                {/* Game Assignment Selection (Required) */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-white flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
                      Game Assignment <span className="text-amber-400">*</span>
                    </span>
                    <span className="text-[10px] text-[#777278] font-normal">Select which game this staff manages</span>
                  </label>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {/* Free Fire Option */}
                    <button
                      type="button"
                      onClick={() => setSelectedGameForStaff('Free Fire')}
                      className={`p-3.5 rounded-2xl border text-left transition relative cursor-pointer ${
                        selectedGameForStaff === 'Free Fire'
                          ? 'bg-gradient-to-br from-orange-950/60 to-purple-950/40 border-orange-500 ring-2 ring-orange-500/30'
                          : 'bg-[#0D0B0D] border-[#29252A] hover:border-[#29252A]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                            selectedGameForStaff === 'Free Fire' ? 'bg-orange-500 text-white shadow-md shadow-orange-950' : 'bg-[#1B181C] text-[#B0ACB0]'
                          }`}>
                            <Flame className="w-4 h-4" />
                          </div>
                          <div>
                            <h5 className="font-extrabold text-xs text-white">Free Fire</h5>
                            <span className="text-[10px] text-[#B0ACB0]">Garena Free Fire MAX</span>
                          </div>
                        </div>
                        {selectedGameForStaff === 'Free Fire' && (
                          <div className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    </button>

                    {/* BGMI Option */}
                    <button
                      type="button"
                      onClick={() => setSelectedGameForStaff('BGMI')}
                      className={`p-3.5 rounded-2xl border text-left transition relative cursor-pointer ${
                        selectedGameForStaff === 'BGMI'
                          ? 'bg-gradient-to-br from-amber-950/60 to-purple-950/40 border-amber-400 ring-2 ring-amber-400/30'
                          : 'bg-[#0D0B0D] border-[#29252A] hover:border-[#29252A]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                            selectedGameForStaff === 'BGMI' ? 'bg-amber-400 text-black shadow-md shadow-amber-950' : 'bg-[#1B181C] text-[#B0ACB0]'
                          }`}>
                            <Gamepad2 className="w-4 h-4" />
                          </div>
                          <div>
                            <h5 className="font-extrabold text-xs text-white">BGMI</h5>
                            <span className="text-[10px] text-[#B0ACB0]">Battlegrounds Mobile</span>
                          </div>
                        </div>
                        {selectedGameForStaff === 'BGMI' && (
                          <div className="w-5 h-5 rounded-full bg-amber-400 text-black flex items-center justify-center">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    </button>
                  </div>
                </div>

                {/* Admin Notes Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-[#B0ACB0]">
                    Admin Notes <span className="text-[#777278] font-normal">(Optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="e.g. Appointed tournament host for weekend Free Fire & BGMI tournaments..."
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    className="w-full p-3 bg-[#0D0B0D] border border-[#29252A] rounded-xl text-xs text-white placeholder-[#777278] focus:outline-none focus:border-[#C9A34E] custom-scrollbar"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedUserForStaff(null)}
                    disabled={isCreatingStaff}
                    className="px-4 py-2.5 rounded-xl bg-[#0D0B0D] hover:bg-[#141215] text-[#B0ACB0] text-xs font-bold transition disabled:opacity-50"
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
          <div className="w-full max-w-2xl bg-[#0D0B0D] border border-[#29252A]/60 rounded-3xl p-6 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#29252A]">
              <div className="flex items-center gap-3">
                <img
                  src={selectedStaffDetails.avatarUrl || selectedStaffDetails.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                  alt={selectedStaffDetails.name}
                  className="w-12 h-12 rounded-2xl object-cover ring-2 ring-amber-400/60 flex-shrink-0"
                />
                <div>
                  <h3 className="text-lg font-black text-white flex items-center gap-2">
                    {selectedStaffDetails.name || selectedStaffDetails.displayName || 'Staff Member'}
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-[#141215] text-[#C9A34E] border border-[#C9A34E]/30">
                      STAFF
                    </span>
                  </h3>
                  <p className="font-mono text-xs font-bold text-[#C9A34E]">
                    ID: {selectedStaffDetails.staffId || selectedStaffDetails.staff_id || selectedStaffDetails.id}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedStaffDetails(null)}
                className="p-1.5 rounded-xl bg-[#0D0B0D] text-[#777278] hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Staff Information Grid */}
            <div className="space-y-2">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#B0ACB0] flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-[#C9A34E]" />
                Staff Profile Information
              </h4>

              <div className="p-4 rounded-2xl bg-[#161230] border border-[#29252A] grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-[#777278] block font-semibold">Staff Name</span>
                  <span className="font-bold text-white">{selectedStaffDetails.name || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#777278] block font-semibold">Staff ID</span>
                  <span className="font-mono font-bold text-[#C9A34E]">
                    {selectedStaffDetails.staffId || selectedStaffDetails.staff_id || selectedStaffDetails.id}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#777278] block font-semibold">Role</span>
                  <span className="font-bold text-[#C9A34E]">STAFF</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#777278] block font-semibold">Assigned Game</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {selectedStaffDetails.assignedGame === 'Free Fire' || selectedStaffDetails.assigned_game === 'Free Fire' ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase inline-flex items-center gap-1 bg-orange-950/60 text-orange-400 border border-orange-600/50">
                        <Flame className="w-3 h-3 text-orange-400" />
                        Free Fire
                      </span>
                    ) : selectedStaffDetails.assignedGame === 'BGMI' || selectedStaffDetails.assigned_game === 'BGMI' ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase inline-flex items-center gap-1 bg-amber-950/60 text-amber-400 border border-amber-500/50">
                        <Gamepad2 className="w-3 h-3 text-amber-400" />
                        BGMI
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold text-[#777278] bg-[#0D0B0D] border border-[#29252A]">
                        Not Assigned
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => handleOpenEditGameModal(selectedStaffDetails, e)}
                      className="px-2 py-0.5 rounded-md bg-amber-400/20 hover:bg-amber-400 hover:text-black text-[#C9A34E] text-[10px] font-bold border border-amber-400/30 transition flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-2.5 h-2.5" />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-[#777278] block font-semibold">Status</span>
                  <span
                    className={`font-black uppercase inline-block text-[11px] ${
                      selectedStaffDetails.status === 'ACTIVE'
                        ? 'text-[#C9A34E]'
                        : selectedStaffDetails.status === 'SUSPENDED'
                        ? 'text-[#C9A34E]'
                        : 'text-rose-400'
                    }`}
                  >
                    {selectedStaffDetails.status}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#777278] block font-semibold">Email</span>
                  <span className="text-[#B0ACB0] truncate block">{selectedStaffDetails.email || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#777278] block font-semibold">Phone</span>
                  <span className="text-[#B0ACB0]">{selectedStaffDetails.phone || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#777278] block font-semibold">In-Game Name (IGN)</span>
                  <span className="font-bold text-[#F5F5F5]">
                    {selectedStaffDetails.bgmiIgn || selectedStaffDetails.bgmi_ign || selectedStaffDetails.ffIgn || selectedStaffDetails.ff_ign || selectedStaffDetails.inGameName || 'N/A'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#777278] block font-semibold">Joined Date</span>
                  <span className="text-[#B0ACB0]">{formatDate(selectedStaffDetails.joinedDate || selectedStaffDetails.created_at)}</span>
                </div>
                {selectedStaffDetails.approvedDate && (
                  <div>
                    <span className="text-[10px] text-[#777278] block font-semibold">Approved Date</span>
                    <span className="text-[#B0ACB0]">{formatDate(selectedStaffDetails.approvedDate)}</span>
                  </div>
                )}
                <div className="col-span-2 sm:col-span-3 pt-1 border-t border-[#29252A]/30">
                  <span className="text-[10px] text-[#777278] block font-semibold">Admin Notes</span>
                  <p className="text-[#B0ACB0] italic mt-0.5">
                    {selectedStaffDetails.notes || selectedStaffDetails.adminNotes || 'No administrative notes attached.'}
                  </p>
                </div>
              </div>
            </div>



            {/* Assigned Staff Daily Tasks & Performance Management */}
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#B0ACB0] flex items-center gap-1.5">
                <ListTodo className="w-3.5 h-3.5 text-[#C9A34E]" />
                Staff Daily Tasks & Performance Desk
              </h4>
              <StaffDailyTasksCard
                staffIdProp={selectedStaffDetails.userId || selectedStaffDetails.user_id || selectedStaffDetails.id}
                staffNameProp={selectedStaffDetails.name || selectedStaffDetails.displayName}
                assignedGameProp={selectedStaffDetails.assignedGame || selectedStaffDetails.assigned_game}
              />
            </div>

            {/* Modal Actions Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-[#29252A]">
              <div className="text-[11px] text-[#777278]">
                Status: <strong className="text-white">{selectedStaffDetails.status}</strong>
              </div>

              <div className="flex items-center gap-2">
                {selectedStaffDetails.status === 'ACTIVE' && (
                  <>
                    <button
                      onClick={() => {
                        setStaffToSuspend(selectedStaffDetails);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-amber-950/80 hover:bg-amber-900 text-[#C9A34E] border border-amber-800 text-xs font-bold transition"
                    >
                      Suspend Staff
                    </button>
                    <button
                      onClick={() => {
                        setStaffToRemove(selectedStaffDetails);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white border border-rose-500 text-xs font-black shadow-md shadow-rose-950/50 transition cursor-pointer"
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
                      className="px-3.5 py-2 rounded-xl bg-emerald-950/80 hover:bg-emerald-700 text-emerald-300 hover:text-white border border-emerald-700/60 text-xs font-bold transition cursor-pointer"
                    >
                      Reactivate Staff
                    </button>
                    <button
                      onClick={() => {
                        setStaffToRemove(selectedStaffDetails);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white border border-rose-500 text-xs font-black shadow-md shadow-rose-950/50 transition cursor-pointer"
                    >
                      Remove Staff
                    </button>
                  </>
                )}

                <button
                  onClick={() => setSelectedStaffDetails(null)}
                  className="px-4 py-2 rounded-xl bg-[#0D0B0D] hover:bg-[#141215] text-[#B0ACB0] text-xs font-bold transition"
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
          <div className="w-full max-w-md bg-[#0D0B0D] border border-amber-500/60 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-[#C9A34E]/20 border border-amber-400/40 flex items-center justify-center text-[#C9A34E]">
              <Ban className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">
                Suspend Staff Member?
              </h3>
              <p className="text-xs text-[#B0ACB0]">
                Are you sure you want to suspend <strong className="text-[#C9A34E]">{staffToSuspend.name}</strong> ({staffToSuspend.staffId || staffToSuspend.id})?
                Their Staff App access will be immediately revoked.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#B0ACB0]">
                Suspension Reason / Note <span className="text-[#777278] font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="Reason for suspension..."
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                className="w-full p-2.5 bg-[#0D0B0D] border border-[#29252A] rounded-xl text-xs text-white placeholder-[#777278] focus:outline-none focus:border-[#C9A34E]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStaffToSuspend(null)}
                disabled={isSuspending}
                className="px-4 py-2.5 rounded-xl bg-[#0D0B0D] text-[#B0ACB0] text-xs font-bold hover:bg-[#141215] transition disabled:opacity-50"
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
          <div className="w-full max-w-md bg-[#0D0B0D] border border-emerald-500/60 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-[#C9A34E]/20 border border-emerald-400/40 flex items-center justify-center text-[#C9A34E]">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">
                Reactivate Staff Member?
              </h3>
              <p className="text-xs text-[#B0ACB0]">
                Are you sure you want to reactivate <strong className="text-[#C9A34E]">{staffToReactivate.name}</strong> ({staffToReactivate.staffId || staffToReactivate.id})?
                Their Staff App access will become active again immediately.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStaffToReactivate(null)}
                disabled={isReactivating}
                className="px-4 py-2.5 rounded-xl bg-[#0D0B0D] text-[#B0ACB0] text-xs font-bold hover:bg-[#141215] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-reactivate-staff-btn"
                onClick={handleConfirmReactivate}
                disabled={isReactivating}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C9A34E] hover:bg-emerald-400 text-black font-extrabold text-xs shadow transition active:scale-95 disabled:opacity-50 cursor-pointer"
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
          <div className="w-full max-w-md bg-[#0D0B0D] border border-rose-600/70 rounded-3xl p-6 space-y-4 shadow-2xl">
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
              <p className="text-[11px] text-[#777278] mt-1">
                Target: <strong>{staffToRemove.name}</strong> ({staffToRemove.staffId || staffToRemove.id})
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#B0ACB0]">
                Removal Reason / Note <span className="text-[#777278] font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="Reason for removal..."
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                className="w-full p-2.5 bg-[#0D0B0D] border border-[#29252A] rounded-xl text-xs text-white placeholder-[#777278] focus:outline-none focus:border-rose-400"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStaffToRemove(null)}
                disabled={isRemoving}
                className="px-4 py-2.5 rounded-xl bg-[#0D0B0D] text-[#B0ACB0] text-xs font-bold hover:bg-[#141215] transition disabled:opacity-50"
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

      {/* ========================================================================= */}
      {/* EDIT GAME ASSIGNMENT MODAL */}
      {/* ========================================================================= */}
      {staffToEditGame && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="w-full max-w-md bg-[#0D0B0D] border border-[#29252A] rounded-3xl p-6 space-y-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#29252A]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
                  <Gamepad2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Edit Game Assignment
                  </h3>
                  <p className="text-xs text-[#B0ACB0]/80">
                    Update assigned game for this staff member
                  </p>
                </div>
              </div>
              <button
                onClick={() => setStaffToEditGame(null)}
                disabled={isUpdatingGame}
                className="p-1.5 rounded-xl bg-[#0D0B0D] text-[#777278] hover:text-white transition disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Target Staff Preview */}
            <div className="p-3.5 rounded-2xl bg-[#161230] border border-[#29252A] flex items-center gap-3">
              <img
                src={staffToEditGame.avatarUrl || staffToEditGame.avatar_url || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                alt={staffToEditGame.name}
                className="w-10 h-10 rounded-xl object-cover ring-1 ring-purple-700/50 flex-shrink-0"
              />
              <div className="min-w-0">
                <h4 className="font-extrabold text-white text-xs truncate">
                  {staffToEditGame.name || staffToEditGame.displayName || 'Staff Member'}
                </h4>
                <p className="font-mono text-[11px] text-[#C9A34E] font-bold">
                  {staffToEditGame.staffId || staffToEditGame.staff_id || staffToEditGame.id}
                </p>
              </div>
            </div>

            {/* Game Options */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-white">
                Select Assigned Game <span className="text-amber-400">*</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                {/* Free Fire Option */}
                <button
                  type="button"
                  onClick={() => setEditGameValue('Free Fire')}
                  className={`p-3.5 rounded-2xl border text-left transition relative cursor-pointer ${
                    editGameValue === 'Free Fire'
                      ? 'bg-gradient-to-br from-orange-950/70 to-purple-950/50 border-orange-500 ring-2 ring-orange-500/30'
                      : 'bg-[#0D0B0D] border-[#29252A] hover:border-[#29252A]/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        editGameValue === 'Free Fire' ? 'bg-orange-500 text-white shadow-md shadow-orange-950' : 'bg-[#1B181C] text-[#B0ACB0]'
                      }`}>
                        <Flame className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="font-extrabold text-xs text-white">Free Fire</h5>
                        <span className="text-[10px] text-[#B0ACB0]">Garena FF MAX</span>
                      </div>
                    </div>
                    {editGameValue === 'Free Fire' && (
                      <div className="w-5 h-5 rounded-full bg-orange-500 text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </div>
                </button>

                {/* BGMI Option */}
                <button
                  type="button"
                  onClick={() => setEditGameValue('BGMI')}
                  className={`p-3.5 rounded-2xl border text-left transition relative cursor-pointer ${
                    editGameValue === 'BGMI'
                      ? 'bg-gradient-to-br from-amber-950/70 to-purple-950/50 border-amber-400 ring-2 ring-amber-400/30'
                      : 'bg-[#0D0B0D] border-[#29252A] hover:border-[#29252A]/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        editGameValue === 'BGMI' ? 'bg-amber-400 text-black shadow-md shadow-amber-950' : 'bg-[#1B181C] text-[#B0ACB0]'
                      }`}>
                        <Gamepad2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h5 className="font-extrabold text-xs text-white">BGMI</h5>
                        <span className="text-[10px] text-[#B0ACB0]">Battlegrounds</span>
                      </div>
                    </div>
                    {editGameValue === 'BGMI' && (
                      <div className="w-5 h-5 rounded-full bg-amber-400 text-black flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </div>
                </button>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStaffToEditGame(null)}
                disabled={isUpdatingGame}
                className="px-4 py-2.5 rounded-xl bg-[#0D0B0D] text-[#B0ACB0] text-xs font-bold hover:bg-[#141215] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                id="save-game-assignment-btn"
                onClick={handleConfirmEditGame}
                disabled={isUpdatingGame}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs shadow-lg transition active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isUpdatingGame ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 text-black" />
                    <span>Save Assignment</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
