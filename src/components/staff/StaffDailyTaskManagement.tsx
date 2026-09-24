import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Target, Search, Edit3, Save, X, Activity, RefreshCw, Eye, Copy, Check, Plus, Hash, CheckCircle2, Clock, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { StaffMember } from '../../types';
import { fetchAllStaffDailyTasksFromSupabase, updateStaffDailyTargetsInSupabase, fetchStaffMembersFromSupabase, fetchStaffTaskLogsFromSupabase } from '../../services/supabaseService';
import { supabase } from '../../services/supabase';

interface StaffWorkItem {
  id: string;
  matchId: string;
  tournamentTitle: string;
  game: string;
  workType: 'Room Released' | 'Match Created' | 'Result Submitted' | 'General Management';
  timestamp: string;
  status: string;
  notes?: string;
}

interface StaffDailyTaskManagementProps {}

export const StaffDailyTaskManagement: React.FC<StaffDailyTaskManagementProps> = () => {
  const { currentUser } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  
  // Edit Form State
  const [editRoomTarget, setEditRoomTarget] = useState(20);
  const [editMatchTarget, setEditMatchTarget] = useState(20);
  const [editResultTarget, setEditResultTarget] = useState(20);
  const [notification, setNotification] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Match Details Modal State
  const [selectedStaffForDetails, setSelectedStaffForDetails] = useState<StaffMember | null>(null);
  const [staffWorkLogs, setStaffWorkLogs] = useState<StaffWorkItem[]>([]);
  const [loadingWorkLogs, setLoadingWorkLogs] = useState(false);
  const [matchSearchQuery, setMatchSearchQuery] = useState('');
  const [copiedMatchId, setCopiedMatchId] = useState<string | null>(null);

  // Filter states
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('');

  // New Work Entry Form
  const [showAddLogForm, setShowAddLogForm] = useState(false);
  const [newLogMatchId, setNewLogMatchId] = useState('');
  const [newLogTitle, setNewLogTitle] = useState('');
  const [newLogWorkType, setNewLogWorkType] = useState<'Room Released' | 'Match Created' | 'Result Submitted' | 'General Management'>('Room Released');
  const [newLogNotes, setNewLogNotes] = useState('');

  const [allRawLogs, setAllRawLogs] = useState<any[]>([]);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 3000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch action logs strictly from public.staff_action_logs
      const rawLogs = await fetchStaffTaskLogsFromSupabase();
      setAllRawLogs(rawLogs || []);

      // 2. Fetch both staff members and their tasks for today
      const staffMembers = await fetchStaffMembersFromSupabase();
      setStaffList(staffMembers || []);
      
      const today = new Date().toISOString().split('T')[0];
      const activeStaff = (staffMembers || []).filter(s => s.status === 'ACTIVE');
      const activeIds = activeStaff.map(s => s.staff_id || s.staffId || s.id).filter(Boolean);
      
      const tasksData = await fetchAllStaffDailyTasksFromSupabase(today, activeIds as string[]);
      setTasks(tasksData || []);
    } catch (err) {
      console.error('Failed to load data', err);
      showNotification('Failed to load staff tasks', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const activeStaff = useMemo(() => {
    return staffList.filter(s => s.status === 'ACTIVE');
  }, [staffList]);

  const filteredStaff = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return activeStaff;
    return activeStaff.filter(s => 
      (s.name || s.displayName || '').toLowerCase().includes(q) || 
      (s.email || '').toLowerCase().includes(q) ||
      (s.username || '').toLowerCase().includes(q)
    );
  }, [activeStaff, searchQuery]);

  const handleEditClick = (staff: StaffMember) => {
    const canonicalId = String(staff.staff_id || staff.staffId || '').trim();
    const uid = canonicalId || staff.userId || staff.user_id || staff.id;
    const existingTask = tasks.find(t => String(t.staff_id || '').trim() === canonicalId);
    
    setEditRoomTarget(existingTask?.room_releases_target ?? 20);
    setEditMatchTarget(existingTask?.matches_created_target ?? 20);
    setEditResultTarget(existingTask?.result_submissions_target ?? 20);
    setEditingStaffId(uid);
  };

  const handleCancelEdit = () => {
    setEditingStaffId(null);
  };

  const handleSaveTargets = async (staff: StaffMember) => {
    const canonicalId = String(staff.staff_id || staff.staffId || '').trim();
    const uid = canonicalId || staff.userId || staff.user_id || staff.id;
    if (!uid) {
      showNotification('Cannot identify staff user ID', 'error');
      return;
    }

    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const success = await updateStaffDailyTargetsInSupabase(
        uid,
        editRoomTarget,
        editMatchTarget,
        editResultTarget,
        today
      );
      
      if (success) {
        showNotification(`Targets updated for ${staff.name || staff.displayName || 'Staff'}`);
        await loadData();
        setEditingStaffId(null);
      } else {
        showNotification('Failed to update targets', 'error');
      }
    } catch (err) {
      console.error('Error saving targets:', err);
      showNotification('An error occurred while saving targets', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Fetch match details specifically worked on by selected staff member
  const handleOpenDetailsModal = async (staff: StaffMember) => {
    setSelectedStaffForDetails(staff);
    setLoadingWorkLogs(true);
    setMatchSearchQuery('');
    setShowAddLogForm(false);
    
    const canonicalStaffId = String(staff.staff_id || staff.staffId || '').trim();
    const staffUid = (staff.userId || staff.user_id || staff.id || '').toLowerCase();
    const staffEmail = (staff.email || '').toLowerCase();
    const staffName = (staff.name || staff.displayName || '').toLowerCase();

    try {
      const logs: StaffWorkItem[] = [];

      // 1. Fetch action logs strictly from public.staff_action_logs matching log.staff_id === staff.staff_id
      try {
        const taskLogs = await fetchStaffTaskLogsFromSupabase();
        
        // Match logs strictly on canonical staff_id
        const staffTaskLogs = taskLogs.filter(l => {
          const sid = String(l.staff_id || '').trim();
          return canonicalStaffId ? sid === canonicalStaffId : false;
        });

        staffTaskLogs.forEach((l) => {
          let workType: StaffWorkItem['workType'] = 'General Management';
          if (l.action_type === 'room_release') workType = 'Room Released';
          else if (l.action_type === 'match_creation') workType = 'Match Created';
          else if (l.action_type === 'result_submission') workType = 'Result Submitted';

          if (!logs.some(existing => existing.matchId === l.match_id && existing.workType === workType)) {
            logs.push({
              id: l.id,
              matchId: l.match_id,
              tournamentTitle: (l as any).tournament_title || `${workType} [${l.match_id}]`,
              game: (l as any).game || staff.assignedGame || 'Free Fire',
              workType,
              timestamp: l.created_at,
              status: 'completed',
              notes: `Executed by ${l.staff_name || staff.name || 'Staff'}`
            });
          }
        });
      } catch (logErr) {
        console.warn('[StaffDailyTaskManagement] Error reading staff_action_logs:', logErr);
      }

      // 2. Cross-check tournaments in database for matched room releases / creations
      const { data: tourns } = await supabase
        .from('tournaments')
        .select('*')
        .order('created_at', { ascending: false });

      if (tourns && tourns.length > 0) {
        tourns.forEach((t: any) => {
          const matchIdStr = t.match_id || t.matchId || t.id;
          const createdBy = (t.created_by || t.createdBy || '').toLowerCase();
          const roomBy = (t.room_released_by || t.roomReleasedBy || '').toLowerCase();
          const resultBy = (t.result_declared_by || t.resultDeclaredBy || '').toLowerCase();

          const matchesStaff = 
            (staffUid && (createdBy.includes(staffUid) || roomBy.includes(staffUid) || resultBy.includes(staffUid))) ||
            (staffEmail && (createdBy.includes(staffEmail) || roomBy.includes(staffEmail) || resultBy.includes(staffEmail))) ||
            (staffName && createdBy.includes(staffName));

          if (matchesStaff) {
            let workType: StaffWorkItem['workType'] = 'General Management';
            if (t.room_id || t.roomId) workType = 'Room Released';
            else if (t.status === 'completed' || t.is_results_published) workType = 'Result Submitted';
            else workType = 'Match Created';

            if (!logs.some(l => l.matchId === String(matchIdStr) && l.workType === workType)) {
              logs.push({
                id: `db_${t.id}`,
                matchId: String(matchIdStr),
                tournamentTitle: t.title || 'Tournament Match',
                game: t.game || t.game_category || staff.assignedGame || 'Free Fire',
                workType,
                timestamp: t.created_at || new Date().toISOString(),
                status: t.status || 'upcoming',
                notes: t.room_id ? `Room ID: ${t.room_id}` : undefined
              });
            }
          }
        });
      }

      setStaffWorkLogs(logs);
    } catch (err) {
      console.error('Error loading staff match work details:', err);
    } finally {
      setLoadingWorkLogs(false);
    }
  };

  const handleCloseDetailsModal = () => {
    setSelectedStaffForDetails(null);
    setStaffWorkLogs([]);
  };

  const handleCopyMatchId = (matchId: string) => {
    navigator.clipboard.writeText(matchId);
    setCopiedMatchId(matchId);
    setTimeout(() => setCopiedMatchId(null), 2000);
  };

  const handleAddManualWorkLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogMatchId.trim() || !selectedStaffForDetails) return;

    const staffUid = selectedStaffForDetails.userId || selectedStaffForDetails.user_id || selectedStaffForDetails.id;
    const newWorkItem: StaffWorkItem = {
      id: `manual_${Date.now()}`,
      matchId: newLogMatchId.trim().toUpperCase(),
      tournamentTitle: newLogTitle.trim() || `${selectedStaffForDetails.assignedGame || 'Match'} Action`,
      game: selectedStaffForDetails.assignedGame || 'Free Fire',
      workType: newLogWorkType,
      timestamp: new Date().toISOString(),
      status: 'completed',
      notes: newLogNotes.trim() || undefined
    };

    const updatedLogs = [newWorkItem, ...staffWorkLogs];
    setStaffWorkLogs(updatedLogs);

    // Save to localStorage
    try {
      localStorage.setItem(`winx7_staff_match_work_${staffUid}`, JSON.stringify(updatedLogs));
    } catch (e) {
      console.warn('Error saving staff work log:', e);
    }

    setNewLogMatchId('');
    setNewLogTitle('');
    setNewLogNotes('');
    setShowAddLogForm(false);
    showNotification(`Match ID ${newWorkItem.matchId} logged for staff member!`);
  };

  const filteredWorkLogs = useMemo(() => {
    const q = matchSearchQuery.toLowerCase().trim();
    return staffWorkLogs.filter(w => {
      // 1. Text Search
      const matchesSearch = !q || 
        w.matchId.toLowerCase().includes(q) ||
        w.tournamentTitle.toLowerCase().includes(q) ||
        w.workType.toLowerCase().includes(q) ||
        (w.notes || '').toLowerCase().includes(q);

      // 2. Action Type Filter
      const matchesAction = actionFilter === 'ALL' || w.workType === actionFilter;

      // 3. Date Filter
      const logDateStr = w.timestamp ? new Date(w.timestamp).toISOString().split('T')[0] : '';
      const matchesDate = !dateFilter || logDateStr === dateFilter;

      return matchesSearch && matchesAction && matchesDate;
    });
  }, [staffWorkLogs, matchSearchQuery, actionFilter, dateFilter]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl border text-xs font-bold flex items-center gap-2 animate-bounce ${
          notification.type === 'error' 
            ? 'bg-rose-950/90 text-rose-300 border-rose-800' 
            : 'bg-emerald-950/90 text-emerald-300 border-emerald-800'
        }`}>
          <Target className="w-4 h-4" />
          <span>{notification.text}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-[#0D0B0D] border border-[#29252A] shadow-xl relative overflow-hidden">
        <div className="space-y-1 z-10">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-md bg-[#C9A34E]/10 border border-[#C9A34E]/30 text-[#C9A34E] text-[10px] font-black uppercase tracking-wider">
              Staff Target & Work Desk
            </span>
            <span className="text-xs text-[#777278]">•</span>
            <span className="text-xs text-[#B0ACB0] font-semibold">Active Staff Performance Desk</span>
          </div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            Staff Daily Task & Match Activity Management
          </h2>
          <p className="text-xs text-[#B0ACB0]">
            Track real-time room releases, match creations, result submissions, and inspect specific Match IDs assigned or worked on by staff.
          </p>
        </div>

        <button 
          onClick={loadData} 
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#161230] hover:bg-[#1C173D] text-[#C9A34E] font-bold text-xs transition border border-[#29252A] disabled:opacity-50 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Sync Staff Data</span>
        </button>
      </div>

      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#777278]" />
          <input
            type="text"
            placeholder="Search staff member by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-[#0D0B0D] border border-[#29252A] rounded-xl text-xs text-white placeholder-[#777278] focus:outline-none focus:border-[#C9A34E] transition"
          />
        </div>

        <div className="text-xs text-[#B0ACB0] font-medium flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#C9A34E]" />
          <span>Showing <strong>{filteredStaff.length}</strong> active staff members</span>
        </div>
      </div>

      {/* Staff Daily Tasks Table */}
      <div className="bg-[#0D0B0D] border border-[#29252A] rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#29252A] bg-[#141215] text-[10px] font-black uppercase text-[#B0ACB0] tracking-wider">
                <th className="px-6 py-4">Staff Member</th>
                <th className="px-6 py-4 text-center">Room Releases</th>
                <th className="px-6 py-4 text-center">Matches Created</th>
                <th className="px-6 py-4 text-center">Result Submissions</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D1A1E]">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#B0ACB0] text-sm">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-[#C9A34E]" />
                      <span>Loading staff task targets...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-[#B0ACB0] text-sm font-medium">
                    No active staff members found matching your search.
                  </td>
                </tr>
              ) : (
                filteredStaff.map((staff) => {
                  const canonicalStaffId = String(staff.staff_id || staff.staffId || '').trim();
                  const uid = canonicalStaffId || staff.userId || staff.user_id || staff.id;
                  const isEditing = editingStaffId === uid;
                  const task = tasks.find(t => String(t.staff_id || '').trim() === canonicalStaffId);

                  // Calculate exact log counts strictly matching log.staff_id === staff.staff_id
                  const matchingRoomReleaseLogs = allRawLogs.filter(
                    l => String(l.staff_id || '').trim() === canonicalStaffId && l.action_type === 'room_release'
                  );
                  const matchingMatchCreationLogs = allRawLogs.filter(
                    l => String(l.staff_id || '').trim() === canonicalStaffId && l.action_type === 'match_creation'
                  );
                  const matchingResultSubmissionLogs = allRawLogs.filter(
                    l => String(l.staff_id || '').trim() === canonicalStaffId && l.action_type === 'result_submission'
                  );

                  return (
                    <tr key={uid} className="hover:bg-[#141215]/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={staff.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                            alt=""
                            className="w-10 h-10 rounded-xl object-cover ring-1 ring-white/10"
                          />
                          <div>
                            <div className="font-extrabold text-white text-sm">
                              {staff.name || staff.displayName || 'Staff Member'}
                            </div>
                            <div className="text-[10px] font-bold text-[#C9A34E] uppercase tracking-wide">
                              {staff.assignedGame || staff.assigned_game || 'ALL'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Room Releases */}
                      <td className="px-6 py-4 text-center align-middle">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={editRoomTarget}
                            onChange={(e) => setEditRoomTarget(parseInt(e.target.value) || 0)}
                            className="w-16 bg-[#1B181C] text-white text-center text-sm font-bold py-1.5 rounded-lg border border-[#C9A34E] focus:outline-none focus:ring-2 focus:ring-[#C9A34E]/30"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-sm font-black text-white">
                              <span className={matchingRoomReleaseLogs.length >= (task?.room_releases_target ?? 20) ? 'text-emerald-400' : 'text-amber-400 font-extrabold'}>
                                {matchingRoomReleaseLogs.length}
                              </span>
                              <span className="text-[#777278] mx-1">/</span>
                              {task?.room_releases_target ?? 20}
                            </span>
                            <span className="text-[9px] font-bold text-[#777278] uppercase">Count / Target</span>
                          </div>
                        )}
                      </td>

                      {/* Matches Created */}
                      <td className="px-6 py-4 text-center align-middle">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={editMatchTarget}
                            onChange={(e) => setEditMatchTarget(parseInt(e.target.value) || 0)}
                            className="w-16 bg-[#1B181C] text-white text-center text-sm font-bold py-1.5 rounded-lg border border-[#C9A34E] focus:outline-none focus:ring-2 focus:ring-[#C9A34E]/30"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-sm font-black text-white">
                              <span className={matchingMatchCreationLogs.length >= (task?.matches_created_target ?? 20) ? 'text-emerald-400' : 'text-amber-400 font-extrabold'}>
                                {matchingMatchCreationLogs.length}
                              </span>
                              <span className="text-[#777278] mx-1">/</span>
                              {task?.matches_created_target ?? 20}
                            </span>
                            <span className="text-[9px] font-bold text-[#777278] uppercase">Count / Target</span>
                          </div>
                        )}
                      </td>

                      {/* Result Submissions */}
                      <td className="px-6 py-4 text-center align-middle">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={editResultTarget}
                            onChange={(e) => setEditResultTarget(parseInt(e.target.value) || 0)}
                            className="w-16 bg-[#1B181C] text-white text-center text-sm font-bold py-1.5 rounded-lg border border-[#C9A34E] focus:outline-none focus:ring-2 focus:ring-[#C9A34E]/30"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-sm font-black text-white">
                              <span className={matchingResultSubmissionLogs.length >= (task?.result_submissions_target ?? 20) ? 'text-emerald-400' : 'text-amber-400 font-extrabold'}>
                                {matchingResultSubmissionLogs.length}
                              </span>
                              <span className="text-[#777278] mx-1">/</span>
                              {task?.result_submissions_target ?? 20}
                            </span>
                            <span className="text-[9px] font-bold text-[#777278] uppercase">Count / Target</span>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={handleCancelEdit}
                              disabled={saving}
                              className="p-2 rounded-lg bg-[#1B181C] text-[#B0ACB0] hover:text-white transition disabled:opacity-50 cursor-pointer"
                              title="Cancel"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleSaveTargets(staff)}
                              disabled={saving}
                              className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-black border border-emerald-500/30 transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                              title="Save Targets"
                            >
                              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                              <span className="text-[10px] font-black uppercase hidden sm:inline">Save</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleOpenDetailsModal(staff)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B181C] border border-amber-400/40 text-amber-400 hover:bg-amber-400 hover:text-black font-bold text-[10px] uppercase tracking-wide transition shadow-sm cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Match Details
                            </button>

                            <button
                              onClick={() => handleEditClick(staff)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B181C] border border-[#350A12] text-[#C9A34E] hover:bg-[#350A12] hover:text-amber-400 font-bold text-[10px] uppercase tracking-wide transition cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Edit Targets
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Staff Match Work Details Modal */}
      {selectedStaffForDetails && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-[#0D0B0D] border border-[#29252A] w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 bg-[#141215] border-b border-[#29252A] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={selectedStaffForDetails.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                  alt=""
                  className="w-12 h-12 rounded-xl object-cover ring-2 ring-amber-400/40"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-white">
                      {selectedStaffForDetails.name || selectedStaffForDetails.displayName || 'Staff Member'}
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-400/10 border border-amber-400/30 text-amber-400">
                      {selectedStaffForDetails.assignedGame || 'ALL GAMES'}
                    </span>
                  </div>
                  <p className="text-xs text-[#B0ACB0] font-mono">
                    {selectedStaffForDetails.email} • Staff ID: {selectedStaffForDetails.userId || selectedStaffForDetails.user_id || selectedStaffForDetails.id}
                  </p>
                </div>
              </div>

              <button
                onClick={handleCloseDetailsModal}
                className="p-2 rounded-xl bg-[#1B181C] text-[#B0ACB0] hover:text-white hover:bg-[#29252A] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Daily Performance Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-xl bg-[#141215] border border-[#29252A] flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-400/10 text-amber-400 flex items-center justify-center font-bold">
                    <Hash className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-[#777278]">Worked Match IDs</div>
                    <div className="text-lg font-black text-white">{staffWorkLogs.length} Matches</div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#141215] border border-[#29252A] flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-400/10 text-emerald-400 flex items-center justify-center font-bold">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-[#777278]">Today's Completed Releases</div>
                    <div className="text-lg font-black text-white">
                      {tasks.find(t => t.staff_id === (selectedStaffForDetails.userId || selectedStaffForDetails.user_id || selectedStaffForDetails.id))?.room_releases_count ?? 0} Rooms
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#141215] border border-[#29252A] flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-400/10 text-purple-400 flex items-center justify-center font-bold">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-[#777278]">Result Submissions</div>
                    <div className="text-lg font-black text-white">
                      {tasks.find(t => t.staff_id === (selectedStaffForDetails.userId || selectedStaffForDetails.user_id || selectedStaffForDetails.id))?.result_submissions_count ?? 0} Declared
                    </div>
                  </div>
                </div>
              </div>

              {/* Work Log Toolbar */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-2">
                <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#777278]" />
                    <input
                      type="text"
                      placeholder="Search specific Match ID or title..."
                      value={matchSearchQuery}
                      onChange={(e) => setMatchSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-[#141215] border border-[#29252A] rounded-xl text-xs text-white placeholder-[#777278] focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  {/* Action Type Filter */}
                  <select
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    className="w-full sm:w-40 py-2 px-3 bg-[#141215] border border-[#29252A] rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="ALL">All Actions</option>
                    <option value="Match Created">Match Created</option>
                    <option value="Room Released">Room Released</option>
                    <option value="Result Submitted">Result Submitted</option>
                    <option value="General Management">General Management</option>
                  </select>

                  {/* Date Filter */}
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="w-full sm:w-36 py-1.5 px-2 bg-[#141215] border border-[#29252A] rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                    title="Filter by Date"
                  />
                  {dateFilter && (
                    <button
                      onClick={() => setDateFilter('')}
                      className="p-1.5 rounded-lg bg-[#1B181C] text-[#777278] hover:text-white text-xs cursor-pointer"
                      title="Clear date filter"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setShowAddLogForm(!showAddLogForm)}
                  className="w-full md:w-auto px-4 py-2 rounded-xl bg-amber-400 text-black text-xs font-black hover:bg-amber-300 transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Log Match ID Work</span>
                </button>
              </div>

              {/* Add Manual Work Log Form */}
              {showAddLogForm && (
                <form onSubmit={handleAddManualWorkLog} className="p-4 rounded-xl bg-[#141215] border border-amber-400/40 space-y-3 animate-in fade-in">
                  <div className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="w-4 h-4" /> Record Worked Match ID for {selectedStaffForDetails.name || 'Staff'}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block text-[10px] text-[#777278] font-bold mb-1">Match ID *</label>
                      <input
                        type="text"
                        placeholder="e.g. MATCH-10492"
                        value={newLogMatchId}
                        onChange={(e) => setNewLogMatchId(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-lg bg-[#0D0B0D] border border-[#29252A] text-white font-mono focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-[#777278] font-bold mb-1">Tournament Title</label>
                      <input
                        type="text"
                        placeholder="e.g. Free Fire Solo Battle"
                        value={newLogTitle}
                        onChange={(e) => setNewLogTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#0D0B0D] border border-[#29252A] text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-[#777278] font-bold mb-1">Work Action *</label>
                      <select
                        value={newLogWorkType}
                        onChange={(e) => setNewLogWorkType(e.target.value as any)}
                        className="w-full px-3 py-2 rounded-lg bg-[#0D0B0D] border border-[#29252A] text-white focus:outline-none focus:border-amber-400"
                      >
                        <option value="Room Released">Room Released</option>
                        <option value="Match Created">Match Created</option>
                        <option value="Result Submitted">Result Submitted</option>
                        <option value="General Management">General Management</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-[#777278] font-bold mb-1">Notes / Action Summary</label>
                    <input
                      type="text"
                      placeholder="e.g. Generated room ID and distributed pass to 48 players"
                      value={newLogNotes}
                      onChange={(e) => setNewLogNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#0D0B0D] border border-[#29252A] text-white text-xs focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddLogForm(false)}
                      className="px-3 py-1.5 rounded-lg bg-[#0D0B0D] text-[#B0ACB0] text-xs font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-lg bg-amber-400 text-black text-xs font-black hover:bg-amber-300 cursor-pointer"
                    >
                      Save Work Log
                    </button>
                  </div>
                </form>
              )}

              {/* Match IDs Worked List */}
              <div className="bg-[#141215] border border-[#29252A] rounded-xl overflow-hidden">
                <div className="px-4 py-3 bg-[#1A171D] border-b border-[#29252A] text-xs font-black uppercase text-amber-400 flex items-center justify-between">
                  <span>Worked Match IDs & Activity Logs</span>
                  <span className="text-[10px] text-[#777278] font-normal uppercase">
                    {filteredWorkLogs.length} Records
                  </span>
                </div>

                {loadingWorkLogs ? (
                  <div className="py-12 flex items-center justify-center gap-2 text-xs text-[#B0ACB0]">
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Loading worked match IDs from database...</span>
                  </div>
                ) : filteredWorkLogs.length === 0 ? (
                  <div className="py-12 text-center text-xs text-[#B0ACB0]">
                    No match work records found for this staff member matching your search filter.
                  </div>
                ) : (
                  <div className="divide-y divide-[#29252A]">
                    {filteredWorkLogs.map((log) => (
                      <div key={log.id} className="p-4 hover:bg-[#1C1820]/60 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-1 rounded-md bg-[#0D0B0D] border border-amber-400/40 text-amber-400 font-mono font-black text-xs flex items-center gap-1.5">
                              <Hash className="w-3.5 h-3.5" />
                              {log.matchId}
                              <button
                                onClick={() => handleCopyMatchId(log.matchId)}
                                className="ml-1 p-0.5 text-[#777278] hover:text-white transition cursor-pointer"
                                title="Copy Match ID"
                              >
                                {copiedMatchId === log.matchId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              </button>
                            </span>

                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                              log.workType === 'Room Released' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                              log.workType === 'Match Created' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                              log.workType === 'Result Submitted' ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' :
                              'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            }`}>
                              {log.workType}
                            </span>

                            <span className="text-[10px] font-bold text-[#777278] uppercase">
                              {log.game}
                            </span>
                          </div>

                          <div className="text-xs font-bold text-white">
                            {log.tournamentTitle}
                          </div>

                          {log.notes && (
                            <div className="text-[11px] text-[#B0ACB0] font-medium italic">
                              "{log.notes}"
                            </div>
                          )}
                        </div>

                        <div className="text-right text-[11px] font-mono text-[#777278] flex sm:flex-col items-center sm:items-end justify-between gap-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-[#C9A34E]" />
                            {new Date(log.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST
                          </span>
                          <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-[#0D0B0D] text-[#B0ACB0] border border-[#29252A]">
                            Status: {log.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#141215] border-t border-[#29252A] flex justify-end">
              <button
                onClick={handleCloseDetailsModal}
                className="px-5 py-2 rounded-xl bg-amber-400 text-black text-xs font-black hover:bg-amber-300 transition cursor-pointer"
              >
                Close Work Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
