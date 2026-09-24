import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchStaffDailyTasksFromSupabase, updateStaffDailyTaskTargetsInSupabase } from '../../services/supabaseService';
import { 
  CheckCircle2, 
  Clock, 
  Gamepad2, 
  KeyRound, 
  ListTodo, 
  RefreshCw, 
  ShieldCheck, 
  Sparkles, 
  Trophy, 
  AlertTriangle,
  Edit3,
  Check,
  X
} from 'lucide-react';

interface StaffDailyTasksCardProps {
  staffIdProp?: string;
  staffNameProp?: string;
  assignedGameProp?: string;
}

export const StaffDailyTasksCard: React.FC<StaffDailyTasksCardProps> = ({
  staffIdProp,
  staffNameProp,
  assignedGameProp
}) => {
  const { currentUser, isSuperAdmin } = useAuth();
  const staffId = staffIdProp || currentUser?.id || currentUser?.uid || currentUser?.email || 'staff_default';
  const staffName = staffNameProp || currentUser?.displayName || 'Staff Member';
  const assignedGame = assignedGameProp || currentUser?.assignedGame || currentUser?.assigned_game || 'All / General';

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState({
    roomReleasesCount: 0,
    roomReleasesTarget: 20,
    matchesCreatedCount: 0,
    matchesCreatedTarget: 20,
    resultSubmissionsCount: 0,
    resultSubmissionsTarget: 20,
    date: new Date().toISOString().split('T')[0]
  });

  // Edit targets state (for admin adjustment)
  const [isEditingTargets, setIsEditingTargets] = useState(false);
  const [editRoomTarget, setEditRoomTarget] = useState(20);
  const [editMatchTarget, setEditMatchTarget] = useState(20);
  const [editResultTarget, setEditResultTarget] = useState(20);
  const [isSavingTargets, setIsSavingTargets] = useState(false);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStaffDailyTasksFromSupabase(staffId);
      setTasks(data);
      setEditRoomTarget(data.roomReleasesTarget);
      setEditMatchTarget(data.matchesCreatedTarget);
      setEditResultTarget(data.resultSubmissionsTarget);
    } catch (err: any) {
      console.error('[StaffDailyTasksCard] Error loading tasks:', err);
      setError(err?.message || 'Failed to load daily tasks.');
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 30000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  const handleSaveTargets = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingTargets(true);
    try {
      await updateStaffDailyTaskTargetsInSupabase(staffId, {
        roomReleasesTarget: Number(editRoomTarget),
        matchesCreatedTarget: Number(editMatchTarget),
        resultSubmissionsTarget: Number(editResultTarget)
      });
      await loadTasks();
      setIsEditingTargets(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to update task targets.');
    } finally {
      setIsSavingTargets(false);
    }
  };

  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const taskList = [
    {
      id: 'room_release',
      name: 'Release Room ID & Password',
      icon: KeyRound,
      completed: tasks.roomReleasesCount,
      target: tasks.roomReleasesTarget,
      color: 'from-amber-500 to-amber-700',
      badgeBg: 'bg-amber-950/60 text-amber-400 border-amber-800/60'
    },
    {
      id: 'match_create',
      name: 'Create Matches',
      icon: Gamepad2,
      completed: tasks.matchesCreatedCount,
      target: tasks.matchesCreatedTarget,
      color: 'from-emerald-500 to-emerald-700',
      badgeBg: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
    },
    {
      id: 'result_submission',
      name: 'Submit Result Requests',
      icon: Trophy,
      completed: tasks.resultSubmissionsCount,
      target: tasks.resultSubmissionsTarget,
      color: 'from-rose-500 to-rose-700',
      badgeBg: 'bg-rose-950/60 text-rose-400 border-rose-800/60'
    }
  ];

  return (
    <div className="bg-[#141215] border border-[#29252A] rounded-3xl p-6 shadow-2xl relative overflow-hidden mb-6">
      <div className="absolute top-0 right-0 w-96 h-96 bg-[#C9A34E]/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#29252A]">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#C9A34E]/20 to-[#E21B36]/20 border border-[#C9A34E]/30 flex items-center justify-center text-[#C9A34E] shadow-inner">
            <ListTodo className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-white tracking-wide">
                Staff Daily Tasks & Performance
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-[#1B181C] border border-[#29252A] text-[#C9A34E] text-[10px] font-mono font-bold uppercase tracking-wider">
                Assigned
              </span>
            </div>
            <p className="text-xs text-[#B0ACB0] font-medium flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3.5 h-3.5 text-[#C9A34E]" />
              <span>{todayFormatted}</span>
              <span className="text-[#777278]">•</span>
              <span className="text-white font-semibold">{staffName}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {isSuperAdmin && (
            <button
              onClick={() => setIsEditingTargets(!isEditingTargets)}
              className="px-3.5 py-2 rounded-xl bg-amber-400/20 hover:bg-amber-400 hover:text-black text-amber-400 text-xs font-bold border border-amber-400/30 transition flex items-center gap-1.5 cursor-pointer"
              title="Adjust Daily Targets for this Staff"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditingTargets ? 'Cancel Edit' : 'Adjust Targets'}</span>
            </button>
          )}
          <button
            onClick={loadTasks}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-[#1B181C] hover:bg-[#29252A] border border-[#29252A] text-[#B0ACB0] hover:text-white text-xs font-bold flex items-center gap-2 transition disabled:opacity-50"
            title="Refresh daily tasks"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#C9A34E]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Admin Adjust Targets Panel */}
      {isEditingTargets && (
        <form onSubmit={handleSaveTargets} className="mb-6 p-4 rounded-2xl bg-[#0D0B0D] border border-amber-400/40 space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-[#29252A] pb-3">
            <h3 className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Adjust Assigned Daily Targets for {staffName}
            </h3>
            <button 
              type="button" 
              onClick={() => setIsEditingTargets(false)}
              className="text-[#777278] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-[10px] text-[#777278] font-semibold mb-1">Room Releases Target</label>
              <input
                type="number"
                min="1"
                max="200"
                value={editRoomTarget}
                onChange={(e) => setEditRoomTarget(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-[#1B181C] border border-[#29252A] text-white font-bold focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#777278] font-semibold mb-1">Matches Created Target</label>
              <input
                type="number"
                min="1"
                max="100"
                value={editMatchTarget}
                onChange={(e) => setEditMatchTarget(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-[#1B181C] border border-[#29252A] text-white font-bold focus:outline-none focus:border-amber-400"
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#777278] font-semibold mb-1">Result Submissions Target</label>
              <input
                type="number"
                min="1"
                max="100"
                value={editResultTarget}
                onChange={(e) => setEditResultTarget(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl bg-[#1B181C] border border-[#29252A] text-white font-bold focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEditingTargets(false)}
              className="px-4 py-2 rounded-xl bg-[#1B181C] text-[#B0ACB0] text-xs font-bold hover:bg-[#29252A]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSavingTargets}
              className="px-5 py-2 rounded-xl bg-amber-400 text-black text-xs font-extrabold hover:bg-amber-300 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isSavingTargets ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>Save Assigned Targets</span>
            </button>
          </div>
        </form>
      )}

      {/* Error state */}
      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button 
            onClick={loadTasks}
            className="underline font-bold hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !tasks ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#29252A] border-t-[#C9A34E] animate-spin" />
          <p className="text-xs text-[#B0ACB0]">Loading staff task performance...</p>
        </div>
      ) : (
        /* Task Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {taskList.map((task) => {
            const Icon = task.icon;
            const remaining = Math.max(0, task.target - task.completed);
            const rawPct = task.target > 0 ? (task.completed / task.target) * 100 : 0;
            const pct = Math.min(100, Math.max(0, rawPct));
            const isCompleted = task.completed >= task.target;

            return (
              <div 
                key={task.id}
                className="bg-[#0D0B0D] border border-[#29252A] rounded-2xl p-4 flex flex-col justify-between hover:border-[#C9A34E]/40 transition shadow-lg group relative overflow-hidden"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-[#1B181C] border border-[#29252A] flex items-center justify-center text-[#C9A34E] group-hover:scale-105 transition">
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${task.badgeBg}`}>
                      {task.completed} / {task.target}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white mb-1">
                    {task.name}
                  </h3>
                  <p className="text-[11px] text-[#B0ACB0] font-medium">
                    {isCompleted ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Target Achieved Today!
                      </span>
                    ) : (
                      <span><strong className="text-[#C9A34E]">{remaining}</strong> remaining to reach daily target</span>
                    )}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-[#1B181C]">
                  <div className="flex items-center justify-between text-[11px] font-mono mb-1.5">
                    <span className="text-[#777278]">Progress</span>
                    <span className="font-bold text-white">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#1B181C] overflow-hidden p-0.5">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 bg-gradient-to-r ${isCompleted ? 'from-emerald-400 to-emerald-600' : 'from-[#C9A34E] to-[#E21B36]'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Info Notice */}
      <div className="mt-5 pt-4 border-t border-[#29252A] flex flex-col sm:flex-row items-center justify-between text-[11px] text-[#777278] gap-2">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-[#C9A34E]" />
          <span>Assigned Daily Performance Tracker: Automatically logs staff activity in real-time.</span>
        </span>
        <span className="font-mono text-[#B0ACB0]">
          Assigned Game: <strong className="text-white uppercase">{assignedGame}</strong>
        </span>
      </div>
    </div>
  );
};
