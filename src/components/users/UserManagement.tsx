import React, { useState, useEffect } from 'react';
import { AppUser, UserStatus, WalletTransaction, Tournament, AvatarPreset } from '../../types';
import {
  getCachedPresetAvatars,
  resolvePresetAvatarUrl,
  fetchPresetAvatars,
  DEFAULT_PRESET_AVATARS,
  normalizePublicMatchId,
} from '../../services/supabaseService';
import {
  Search,
  Filter,
  User,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Ban,
  Trash2,
  Edit3,
  Wallet,
  PlusCircle,
  MinusCircle,
  X,
  CheckCircle2,
  AlertTriangle,
  History,
  Phone,
  Mail,
  Gamepad2,
  ChevronRight,
  Sparkles,
  Upload,
  Camera,
  ArrowUpRight,
  ArrowDownRight,
  Image as ImageIcon
} from 'lucide-react';

interface UserManagementProps {
  users: AppUser[];
  transactions: WalletTransaction[];
  tournaments: Tournament[];
  onUpdateUserStatus: (userId: string, newStatus: UserStatus, reason?: string) => void;
  onUpdateUserWallet: (userId: string, amount: number, isAddition: boolean, note: string, walletType?: 'main' | 'winning') => Promise<void>;
  onDeleteUser: (userId: string) => void;
  onEditUser: (userId: string, profileData: { 
    username: string; 
    email: string; 
    phone: string; 
    inGameName: string; 
    inGameId?: string; 
    avatar_id?: string; 
    avatarId?: string; 
    avatarUrl?: string;
    ffIgn?: string;
    ffUid?: string;
    bgmiIgn?: string;
    bgmiUid?: string;
  }) => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({
  users,
  transactions,
  tournaments,
  onUpdateUserStatus,
  onUpdateUserWallet,
  onDeleteUser,
  onEditUser
}) => {
  const [presetAvatars, setPresetAvatars] = useState<AvatarPreset[]>(getCachedPresetAvatars());

  useEffect(() => {
    fetchPresetAvatars().then((loaded) => {
      if (loaded && loaded.length > 0) {
        setPresetAvatars(loaded);
      }
    });
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'banned'>('all');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selectedUser = (users || []).find((u) => u && (u.id === selectedUserId || u.uid === selectedUserId)) || null;

  // Modals state
  const [showBanModal, setShowBanModal] = useState(false);
  const [banReason, setBanReason] = useState('');

  // Explicit Suspension & Unsuspension State
  const [suspendTargetUser, setSuspendTargetUser] = useState<AppUser | null>(null);
  const [suspendReasonInput, setSuspendReasonInput] = useState('Account suspended by administrator');
  const [unsuspendTargetUser, setUnsuspendTargetUser] = useState<AppUser | null>(null);
  const [isProcessingStatus, setIsProcessingStatus] = useState(false);
  
  const [showWalletAdjustModal, setShowWalletAdjustModal] = useState(false);
  const [walletType, setWalletType] = useState<'main' | 'winning'>('main');
  const [walletAmount, setWalletAmount] = useState<number>(100);
  const [walletIsAddition, setWalletIsAddition] = useState<boolean>(true);
  const [walletNote, setWalletNote] = useState('');

  // Edit Profile Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editInGameName, setEditInGameName] = useState('');
  const [editFfIgn, setEditFfIgn] = useState('');
  const [editFfUid, setEditFfUid] = useState('');
  const [editBgmiIgn, setEditBgmiIgn] = useState('');
  const [editBgmiUid, setEditBgmiUid] = useState('');
  const [editAvatarId, setEditAvatarId] = useState('avatar_1');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');

  const [activeUserDetailTab, setActiveUserDetailTab] = useState<'profile' | 'matches' | 'transactions'>('profile');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Memoized filter logic
  const filteredUsers = React.useMemo(() => {
    return (users || []).filter((u) => {
      if (!u) return false;
      const q = (searchQuery || '').toLowerCase().trim();
      if (!q && statusFilter === 'all') return true;

      const username = (u.username || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const phone = u.phone || '';
      const inGameName = (u.inGameName || '').toLowerCase();
      const ffIgn = (u.ffIgn || '').toLowerCase();
      const ffUid = (u.ffUid || '').toLowerCase();
      const bgmiIgn = (u.bgmiIgn || '').toLowerCase();
      const bgmiUid = (u.bgmiUid || '').toLowerCase();

      const matchesSearch = !q ||
        username.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        inGameName.includes(q) ||
        ffIgn.includes(q) ||
        ffUid.includes(q) ||
        bgmiIgn.includes(q) ||
        bgmiUid.includes(q);

      const isSusp = Boolean(u.is_suspended ?? u.isSuspended ?? ['suspended', 'blocked', 'banned'].includes(String(u.status || '').toLowerCase()));
      let matchesStatus = true;
      if (statusFilter === 'active') {
        matchesStatus = !isSusp;
      } else if (statusFilter === 'suspended') {
        matchesStatus = isSusp;
      } else if (statusFilter === 'banned') {
        matchesStatus = Boolean(u.is_banned || String(u.status || '').toLowerCase() === 'banned');
      }
      return matchesSearch && matchesStatus;
    });
  }, [users, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const paginatedUsers = React.useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [filteredUsers, currentPage, pageSize]);

  // Reset page when filter/search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const handleConfirmSuspend = async () => {
    if (suspendTargetUser) {
      try {
        setIsProcessingStatus(true);
        const reason = suspendReasonInput.trim() || 'Account suspended by administrator';
        await onUpdateUserStatus(suspendTargetUser.id, 'suspended', reason);
        setSuspendTargetUser(null);
        setSuspendReasonInput('Account suspended by administrator');
      } finally {
        setIsProcessingStatus(false);
      }
    }
  };

  const handleConfirmUnsuspend = async () => {
    if (unsuspendTargetUser) {
      try {
        setIsProcessingStatus(true);
        await onUpdateUserStatus(unsuspendTargetUser.id, 'active', '');
        setUnsuspendTargetUser(null);
      } finally {
        setIsProcessingStatus(false);
      }
    }
  };

  const handleApplyBan = () => {
    if (selectedUser && banReason) {
      onUpdateUserStatus(selectedUser.id, 'banned', banReason);
      setShowBanModal(false);
      setBanReason('');
      setSelectedUserId(null);
    }
  };

  const handleApplyWalletAdjustment = async () => {
    if (selectedUser && walletAmount > 0) {
      try {
        await onUpdateUserWallet(selectedUser.id, walletAmount, walletIsAddition, walletNote, walletType);
        setShowWalletAdjustModal(false);
        alert('Wallet adjusted successfully.');
      } catch (err: any) {
        alert(err.message || String(err));
      }
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingUserId) {
      onEditUser(editingUserId, {
        username: editUsername,
        email: editEmail,
        phone: editPhone,
        inGameName: editInGameName || editFfIgn,
        ffIgn: editFfIgn,
        ffUid: editFfUid,
        bgmiIgn: editBgmiIgn,
        bgmiUid: editBgmiUid,
        avatar_id: editAvatarId,
        avatarId: editAvatarId,
        avatarUrl: editAvatarUrl
      });
      setShowEditModal(false);
      setEditingUserId(null);
    }
  };

  const userTransactions = selectedUser
    ? (transactions || []).filter((t) => t && t.userId === selectedUser.id)
    : [];

  const userMatches = selectedUser
    ? (tournaments || []).filter((t) => t && (t.participants || []).some((p) => p && p.userId === selectedUser.id))
    : [];

  return (
    <div className="space-y-4 animate-in fade-in pb-16 md:pb-6">
      
      {/* Title & Controls Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#0D0B0D] border border-[#29252A]">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-[#C9A34E]" /> Player Directory & Wallet Desk
          </h2>
          <p className="text-xs text-[#B0ACB0]/80">
            Manage player accounts, in-game IDs, bans, and wallet adjustments
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 text-xs font-bold bg-[#0D0B0D] text-[#C9A34E] border border-[#29252A] rounded-xl">
            Total: {(users || []).length} Players
          </span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Search Field */}
        <div className="sm:col-span-2 relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#777278]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Username, Email, Phone, In-Game ID (5489...), or IGN..."
            className="w-full bg-[#141215] text-white text-xs pl-10 pr-4 py-2.5 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-[#777278] hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1 bg-[#141215] p-1 rounded-xl border border-[#29252A] overflow-x-auto">
          {(['all', 'active', 'suspended', 'banned'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold uppercase transition ${
                statusFilter === st
                  ? 'bg-amber-400 text-black shadow-md'
                  : 'text-[#B0ACB0]/80 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Searchable Players Table */}
      <div className="bg-[#0D0B0D] rounded-2xl border border-[#29252A] overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[#B0ACB0]">
            <thead className="bg-[#141215] text-[#B0ACB0] font-bold uppercase text-[10px] tracking-wider border-b border-[#29252A]">
              <tr>
                <th className="px-4 py-3">Player Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">In-Game Name (IGN)</th>
                <th className="px-4 py-3">Balances (Main / Winning)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-900/30">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#777278]">
                    No players matched your search.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-[#141215]/20 transition">
                    {/* Name */}
                    <td className="px-4 py-3 font-extrabold text-white">
                      <div className="flex items-center gap-2.5">
                        <img
                          src={user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'}
                          alt={user.username}
                          className="w-8 h-8 rounded-lg object-cover ring-1 ring-purple-600/50"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            e.currentTarget.src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';
                          }}
                        />
                        <span>{user.username}</span>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="px-4 py-3 text-[#B0ACB0] font-mono">
                      {user.phone ? user.phone : <span className="text-[#E21B36]">N/A</span>}
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3 text-[#B0ACB0] truncate max-w-[150px]">
                      {user.email ? user.email : <span className="text-[#E21B36]">N/A</span>}
                    </td>

                    {/* In-Game Name (IGN) */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1 text-xs">
                        {user.bgmiIgn && (
                          <div className="flex items-center gap-1.5 font-extrabold text-[#C9A34E]">
                            <span className="text-[8px] tracking-wider px-1 bg-amber-500/10 text-amber-400 rounded border border-amber-500/20 font-black uppercase shrink-0">BGMI</span>
                            <span className="truncate max-w-[120px]">{user.bgmiIgn}</span>
                          </div>
                        )}
                        {(user.ffIgn || user.inGameName) && (user.ffIgn !== user.bgmiIgn) && (
                          <div className="flex items-center gap-1.5 font-extrabold text-rose-400">
                            <span className="text-[8px] tracking-wider px-1 bg-rose-500/10 text-rose-400 rounded border border-rose-500/20 font-black uppercase shrink-0">FF</span>
                            <span className="truncate max-w-[120px]">{user.ffIgn || user.inGameName}</span>
                          </div>
                        )}
                        {!user.bgmiIgn && !(user.ffIgn || user.inGameName) && (
                          <span className="text-[#777278] font-normal">Not Set</span>
                        )}
                      </div>
                    </td>

                    {/* Wallet Balance */}
                    <td className="px-4 py-3">
                      <div className="font-black text-[#C9A34E] text-sm">
                        ₹{((user.totalBalance ?? ((user.walletBalance ?? 0) + (user.unclaimedWinnings ?? 0) + (user.bonusBalance ?? 0))) ?? 0).toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-[#B0ACB0] font-medium mt-1 space-y-0.5">
                        <div className="flex justify-between gap-2"><span>Dep:</span><span className="text-[#C9A34E] font-bold">₹{(user.walletBalance ?? 0).toLocaleString('en-IN')}</span></div>
                        <div className="flex justify-between gap-2"><span>Win:</span><span className="text-[#C9A34E] font-bold">₹{(user.unclaimedWinnings ?? 0).toLocaleString('en-IN')}</span></div>
                        <div className="flex justify-between gap-2"><span>Bonus:</span><span className="text-amber-400 font-bold">₹{(user.bonusBalance ?? 0).toLocaleString('en-IN')}</span></div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      {Boolean(user.is_suspended ?? user.isSuspended ?? ['suspended', 'blocked', 'banned'].includes(String(user.status || '').toLowerCase())) ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-md border bg-rose-950/80 text-rose-300 border-rose-700/60 inline-flex items-center gap-1 w-fit shadow-sm shadow-rose-950">
                            <ShieldAlert className="w-2.5 h-2.5 text-rose-400" />
                            SUSPENDED
                          </span>
                          {(user.banReason || user.ban_reason) && (
                            <span className="text-[10px] text-rose-400/90 font-medium truncate max-w-[150px]" title={user.banReason || user.ban_reason}>
                              {user.banReason || user.ban_reason}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded-md border bg-[#350A12] text-[#C9A34E] border-[#29252A] inline-flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                          ACTIVE
                        </span>
                      )}
                    </td>

                    {/* Actions: View, Edit, Suspend */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* View Button */}
                        <button
                          onClick={() => setSelectedUserId(user.id || user.uid || null)}
                          className="px-2.5 py-1 rounded-lg bg-[#1B181C] hover:bg-[#C9A34E] text-[#C9A34E] hover:text-black border border-[#C9A34E]/30 text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <ChevronRight className="w-3 h-3" />
                          <span>View</span>
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => {
                            const curAvatarId = user.avatar_id || user.avatarId || (user.avatarUrl && user.avatarUrl.startsWith('avatar_') ? user.avatarUrl : 'avatar_1');
                            setEditingUserId(user.id);
                            setEditUsername(user.username || '');
                            setEditEmail(user.email || '');
                            setEditPhone(user.phone || '');
                            setEditInGameName(user.inGameName || '');
                            setEditFfIgn(user.ffIgn || user.inGameName || '');
                            setEditFfUid(user.ffUid || user.inGameId || '');
                            setEditBgmiIgn(user.bgmiIgn || '');
                            setEditBgmiUid(user.bgmiUid || '');
                            setEditAvatarId(curAvatarId);
                            setEditAvatarUrl(resolvePresetAvatarUrl(curAvatarId, user.avatarUrl));
                            setShowEditModal(true);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-[#141215]/60 hover:bg-[#29252A] text-[#B0ACB0] hover:text-white border border-[#29252A] text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3 text-[#B0ACB0]" />
                          <span>Edit</span>
                        </button>

                        {/* Suspend / Unsuspend Button */}
                        {Boolean(user.is_suspended ?? user.isSuspended ?? ['suspended', 'blocked', 'banned'].includes(String(user.status || '').toLowerCase())) ? (
                          <button
                            onClick={() => setUnsuspendTargetUser(user)}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 bg-emerald-950/80 hover:bg-emerald-700 text-emerald-300 hover:text-white border border-emerald-700/60"
                            title="Unsuspend account and restore player login access"
                          >
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            <span>Unsuspend</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setSuspendTargetUser(user);
                              setSuspendReasonInput('Account suspended by administrator');
                            }}
                            className="px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/30"
                            title="Suspend player account"
                          >
                            <ShieldAlert className="w-3 h-3" />
                            <span>Suspend</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-[#141215] border-t border-[#29252A] text-xs text-[#B0ACB0]">
            <div>
              Showing <span className="font-bold text-white">{(currentPage - 1) * pageSize + 1}</span> to{' '}
              <span className="font-bold text-white">{Math.min(currentPage * pageSize, filteredUsers.length)}</span> of{' '}
              <span className="font-bold text-white">{filteredUsers.length}</span> players
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded-lg bg-[#1B181C] border border-[#29252A] hover:bg-[#29252A] hover:text-[#C9A34E] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition"
              >
                Previous
              </button>

              <span className="font-bold text-[#C9A34E] px-2">
                Page {currentPage} of {totalPages}
              </span>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded-lg bg-[#1B181C] border border-[#29252A] hover:bg-[#29252A] hover:text-[#C9A34E] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* User Inspection Modal / Mobile Drawer */}
      {selectedUser && !showBanModal && !showWalletAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-2xl bg-[#0D0B0D] border border-[#29252A] rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#29252A]">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={selectedUser.avatarUrl || (selectedUser as any).photoURL || (selectedUser as any).profilePic || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80'}
                    alt={selectedUser.username}
                    className="w-12 h-12 rounded-2xl object-cover ring-2 ring-amber-400"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';
                    }}
                  />
                </div>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    {selectedUser.username}
                    {Boolean(selectedUser.is_suspended ?? selectedUser.isSuspended ?? ['suspended', 'blocked', 'banned'].includes(String(selectedUser.status || '').toLowerCase())) ? (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-rose-950/80 text-rose-300 font-bold border border-rose-700/60 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-rose-400" />
                        SUSPENDED
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-[#141215] text-[#C9A34E] font-bold border border-[#29252A] flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ACTIVE
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-[#B0ACB0]/80">
                    UID: {selectedUser.uid} • Joined {selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEditingUserId(selectedUser.id);
                    setEditUsername(selectedUser.username || '');
                    setEditEmail(selectedUser.email || '');
                    setEditPhone(selectedUser.phone || '');
                    setEditInGameName(selectedUser.inGameName || '');
                    setShowEditModal(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#141215]/60 hover:bg-[#29252A] text-[#B0ACB0] hover:text-white border border-[#29252A] text-xs font-bold transition flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#B0ACB0]" />
                  <span>Edit Profile</span>
                </button>

                <button
                  onClick={() => setSelectedUserId(null)}
                  className="p-2 rounded-xl bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Account Suspension Banner */}
            {Boolean(selectedUser.is_suspended ?? selectedUser.isSuspended ?? ['suspended', 'blocked', 'banned'].includes(String(selectedUser.status || '').toLowerCase())) && (
              <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-700/50 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-black uppercase text-rose-300 tracking-wide">Account Suspended by Administrator</h4>
                    <p className="text-xs text-rose-200/90 mt-0.5">
                      <strong>Reason:</strong> {selectedUser.banReason || selectedUser.ban_reason || 'Account suspended by administrator'}
                    </p>
                    <p className="text-[11px] text-rose-400/80 mt-0.5">
                      Authentication access (Email/Password & Google) is persistently blocked.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setUnsuspendTargetUser(selectedUser)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1 flex-shrink-0"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Unsuspend</span>
                </button>
              </div>
            )}

            {/* Sub Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-[#29252A] pb-2">
              <button
                onClick={() => setActiveUserDetailTab('profile')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeUserDetailTab === 'profile'
                    ? 'bg-amber-400 text-black shadow-md'
                    : 'text-[#B0ACB0] hover:text-white bg-[#0D0B0D]/40'
                }`}
              >
                Profile & Wallet
              </button>
              <button
                onClick={() => setActiveUserDetailTab('matches')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeUserDetailTab === 'matches'
                    ? 'bg-amber-400 text-black shadow-md'
                    : 'text-[#B0ACB0] hover:text-white bg-[#0D0B0D]/40'
                }`}
              >
                Matches ({userMatches.length})
              </button>
              <button
                onClick={() => setActiveUserDetailTab('transactions')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeUserDetailTab === 'transactions'
                    ? 'bg-amber-400 text-black shadow-md'
                    : 'text-[#B0ACB0] hover:text-white bg-[#0D0B0D]/40'
                }`}
              >
                Transactions ({userTransactions.length})
              </button>
            </div>

            {/* Tab Contents */}
            {activeUserDetailTab === 'profile' && (
              <div className="space-y-4">
                {/* Gaming Profile Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-[#141215] border border-[#29252A] col-span-2 sm:col-span-1 space-y-1.5">
                    <p className="text-[10px] text-[#777278] uppercase font-bold">Gaming Profiles</p>
                    <div className="text-xs space-y-1">
                      {selectedUser.bgmiIgn ? (
                        <p className="font-bold text-[#C9A34E] flex items-center gap-1.5">
                          <span className="text-[8px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 rounded uppercase font-black">BGMI</span>
                          <span>{selectedUser.bgmiIgn}</span>
                        </p>
                      ) : null}
                      {(selectedUser.ffIgn || selectedUser.inGameName) && (selectedUser.ffIgn !== selectedUser.bgmiIgn) ? (
                        <p className="font-bold text-rose-400 flex items-center gap-1.5">
                          <span className="text-[8px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1 rounded uppercase font-black">FF</span>
                          <span>{selectedUser.ffIgn || selectedUser.inGameName}</span>
                        </p>
                      ) : null}
                      {!selectedUser.bgmiIgn && !(selectedUser.ffIgn || selectedUser.inGameName) && (
                        <span className="text-[#777278] font-normal">Not Set</span>
                      )}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#141215] border border-[#29252A]">
                    <p className="text-[10px] text-[#777278] uppercase font-bold">Main (Deposit)</p>
                    <p className="text-sm font-black text-[#C9A34E] mt-0.5">₹{(selectedUser.walletBalance ?? 0).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#141215] border border-[#29252A]">
                    <p className="text-[10px] text-[#777278] uppercase font-bold">Winnings</p>
                    <p className="text-sm font-black text-[#C9A34E] mt-0.5">₹{(selectedUser.unclaimedWinnings ?? 0).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#141215] border border-[#29252A]">
                    <p className="text-[10px] text-[#777278] uppercase font-bold">Bonus Balance</p>
                    <p className="text-sm font-black text-amber-400 mt-0.5">₹{(selectedUser.bonusBalance ?? 0).toLocaleString('en-IN')}</p>
                  </div>
                </div>

                {/* Account Details */}
                <div className="p-3.5 rounded-xl bg-[#141215] border border-[#29252A] space-y-2 text-xs">
                  <div className="flex justify-between items-center text-[#B0ACB0] border-b border-[#29252A] pb-2 mb-2 bg-[#1B181C]/40 p-2 rounded-lg">
                    <span className="text-[#C9A34E] font-black uppercase tracking-wider text-[10px]">Total Combined Balance:</span>
                    <span className="font-black text-[#C9A34E] text-base">
                      ₹{((selectedUser.totalBalance ?? ((selectedUser.walletBalance ?? 0) + (selectedUser.unclaimedWinnings ?? 0) + (selectedUser.bonusBalance ?? 0))) ?? 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#B0ACB0]">
                    <span className="text-[#777278]">Email Address:</span>
                    <span className="font-semibold">
                      {selectedUser.email ? selectedUser.email : <span className="text-[#E21B36] font-normal">N/A</span>}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#B0ACB0]">
                    <span className="text-[#777278]">Phone Number:</span>
                    <span className="font-semibold">
                      {selectedUser.phone ? selectedUser.phone : <span className="text-[#E21B36] font-normal">N/A</span>}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#B0ACB0]">
                    <span className="text-[#777278]">Total Deposits:</span>
                    <span className="font-semibold text-[#C9A34E]">₹{selectedUser.totalDeposits}</span>
                  </div>
                  <div className="flex justify-between text-[#B0ACB0]">
                    <span className="text-[#777278]">Total Withdrawals:</span>
                    <span className="font-semibold text-rose-300">₹{selectedUser.totalWithdrawals}</span>
                  </div>
                  <div className="flex justify-between text-[#B0ACB0]">
                    <span className="text-[#777278]">Kills Record:</span>
                    <span className="font-semibold text-[#C9A34E]">{selectedUser.totalKills} Total Kills</span>
                  </div>
                </div>

                {/* Quick Wallet Adjust Action */}
                <div className="p-3.5 rounded-xl bg-[#0D0B0D]/60 border border-[#29252A] flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-[#C9A34E]">Admin Wallet Adjustment</p>
                    <p className="text-[10px] text-[#B0ACB0]">Add or deduct funds directly from user wallet</p>
                  </div>
                  <button
                    onClick={() => setShowWalletAdjustModal(true)}
                    className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-black text-xs font-bold transition hover:scale-105"
                  >
                    Adjust Wallet
                  </button>
                </div>
              </div>
            )}

            {activeUserDetailTab === 'matches' && (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                {userMatches.length === 0 ? (
                  <p className="text-xs text-[#777278] text-center py-6">No tournament matches played yet.</p>
                ) : (
                  userMatches.map((m) => {
                    const isBgmiMatch = 
                      (m.game || '').toUpperCase() === 'BGMI' || 
                      (m.game || '').toUpperCase().includes('BATTLEGROUND') || 
                      (m.game || '').toUpperCase() === 'PUBG' ||
                      (m.title || '').toUpperCase().includes('BGMI') ||
                      (m.title || '').toUpperCase().includes('BATTLEGROUND') ||
                      (m.title || '').toUpperCase().includes('PUBG') ||
                      (m.category || '').toUpperCase() === 'BGMI' ||
                      (m.matchCategory || '').toUpperCase() === 'BGMI' ||
                      ['ERANGEL', 'MIRAMAR', 'SANHOK', 'VIKENDI', 'LIVIK', 'NUSA', 'KARAKIN'].includes((m.map || '').toUpperCase()) ||
                      (m.matchType || '').toUpperCase().includes('TDM') ||
                      (m.matchType || '').toUpperCase().includes('ULTIMATE ROYALE') ||
                      Number(m.maxSlots) === 100;
                    const gameBadge = isBgmiMatch ? 'BGMI' : (m.game || 'FREE FIRE');
                    const matchId = normalizePublicMatchId(m.matchId || (m as any).match_id) || m.matchId || (m as any).match_id || '';

                    return (
                      <div key={m.id} className="p-3 rounded-xl bg-[#141215] border border-[#29252A] text-xs flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-white">{m.title}</p>
                            <span className="font-mono text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded tracking-wider">
                              {matchId}
                            </span>
                          </div>
                          <p className="text-[10px] text-[#B0ACB0] mt-0.5">
                            <span className={`font-black ${isBgmiMatch ? 'text-emerald-400' : 'text-[#FF3048]'}`}>
                              {gameBadge}
                            </span>
                            {' • '}
                            <span className="text-white font-bold">{m.matchType || 'Solo'}</span>
                            {' • '}
                            <span>Entry: ₹{m.entryFee}</span>
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#141215] text-[#C9A34E]">
                          {m.status}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {activeUserDetailTab === 'transactions' && (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                {userTransactions.length === 0 ? (
                  <p className="text-xs text-[#777278] text-center py-6">No transaction records found.</p>
                ) : (
                  userTransactions.map((tx) => {
                    const isCredit = tx.type !== 'withdrawal' && tx.type !== 'entry_fee';
                    return (
                      <div
                        key={tx.id}
                        className="p-2.5 rounded-xl bg-[#0D0B0D]/80 border border-[#29252A]/20 hover:border-[#29252A] transition flex items-center justify-between gap-3 text-xs"
                      >
                        {/* Left Section: Icon & Metadata */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                              isCredit
                                ? 'bg-[#C9A34E]/10 text-[#C9A34E]'
                                : 'bg-rose-500/10 text-rose-400'
                            }`}
                          >
                            {tx.type === 'deposit' ? (
                              <ArrowDownRight className="w-4 h-4" />
                            ) : tx.type === 'withdrawal' ? (
                              <ArrowUpRight className="w-4 h-4" />
                            ) : (
                              <Sparkles className="w-4 h-4" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-white capitalize text-[12px]">
                                {tx.type === 'deposit' ? 'Deposit' : tx.type === 'withdrawal' ? 'Withdrawal' : tx.type}
                              </span>
                              <span className="text-[9px] px-1 py-0.2 rounded bg-[#141215]/50 text-[#B0ACB0] font-medium">
                                {tx.paymentMethod || 'Wallet'}
                              </span>
                            </div>
                            <p className="text-[10px] text-[#777278] truncate flex items-center gap-1 mt-0.5 font-mono">
                              <span>
                                {tx.type === 'withdrawal'
                                  ? `ID: ${tx.withdrawalRequestId || tx.referenceId || tx.id}`
                                  : `Ref: ${tx.referenceId || tx.id}`}
                              </span>
                              <span className="opacity-40">•</span>
                              <span className="text-[9px]">
                                {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : 'N/A'}
                              </span>
                            </p>
                          </div>
                        </div>

                        {/* Right Section: Amount & Status Badge */}
                        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                          <span
                            className={`font-black text-[13px] tracking-tight ${
                              isCredit ? 'text-[#C9A34E]' : 'text-[#C9A34E]'
                            }`}
                          >
                            {isCredit ? '+' : '-'}₹{(tx.amount || 0).toLocaleString('en-IN')}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-black uppercase rounded-md tracking-wider border ${
                              tx.status === 'pending'
                                ? 'bg-[#C9A34E]/10 text-[#C9A34E] border-amber-500/20'
                                : tx.status === 'approved'
                                ? 'bg-[#C9A34E]/10 text-[#C9A34E] border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            }`}
                          >
                            {tx.status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-3 border-t border-[#29252A] flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onDeleteUser(selectedUser.id);
                    setSelectedUserId(null);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white border border-rose-500 text-xs font-black flex items-center gap-1.5 shadow-md shadow-rose-950/50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-white" /> Delete User
                </button>

                {Boolean(selectedUser.is_suspended ?? selectedUser.isSuspended ?? ['suspended', 'blocked', 'banned'].includes(String(selectedUser.status || '').toLowerCase())) ? (
                  <button
                    onClick={() => setUnsuspendTargetUser(selectedUser)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-950/50"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-white" /> Unsuspend Account
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setSuspendTargetUser(selectedUser);
                      setSuspendReasonInput('Account suspended by administrator');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" /> Suspend Account
                  </button>
                )}
              </div>

              <button
                onClick={() => setSelectedUserId(null)}
                className="px-4 py-2 rounded-xl bg-[#1B181C] hover:bg-[#29252A] text-white text-xs font-bold border border-[#29252A] cursor-pointer"
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Dedicated Suspend Account Modal */}
      {suspendTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#0D0B0D] border border-rose-600/40 rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-rose-400 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" /> Suspend Player: {suspendTargetUser.username}
            </h3>
            <p className="text-xs text-[#B0ACB0] leading-relaxed">
              Suspension immediately halts all tournament activity and blocks both Email/Password and Google authentication.
            </p>

            <div>
              <label className="block text-[10px] uppercase font-bold text-[#B0ACB0] mb-1.5">
                Administrator Suspension Reason <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={3}
                value={suspendReasonInput}
                onChange={(e) => setSuspendReasonInput(e.target.value)}
                placeholder="e.g. Account suspended due to detected emulator scripts or abusive behavior..."
                className="w-full bg-[#141215] text-white text-xs p-3 rounded-xl border border-rose-900/60 focus:border-rose-500 focus:outline-none"
              />
              <p className="text-[11px] text-[#777278] mt-1">
                This reason is preserved in the database and visible to administrators.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                disabled={isProcessingStatus}
                onClick={() => {
                  setSuspendTargetUser(null);
                  setSuspendReasonInput('Account suspended by administrator');
                }}
                className="px-3.5 py-2 rounded-xl bg-[#141215] hover:bg-[#29252A] text-[#B0ACB0] text-xs font-bold transition"
              >
                Cancel
              </button>
              <button
                disabled={isProcessingStatus || !suspendReasonInput.trim()}
                onClick={handleConfirmSuspend}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-rose-950/60 disabled:opacity-50"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                {isProcessingStatus ? 'Suspending...' : 'Confirm Suspension'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dedicated Unsuspend Account Modal */}
      {unsuspendTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#0D0B0D] border border-emerald-600/40 rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-emerald-400 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" /> Restore Account: {unsuspendTargetUser.username}
            </h3>
            <p className="text-xs text-[#B0ACB0] leading-relaxed">
              Are you sure you want to unsuspend this player? Their account status will revert to <strong className="text-emerald-400">ACTIVE</strong>, and their Email/Password and Google authentication access will be restored immediately.
            </p>

            {unsuspendTargetUser.banReason && (
              <div className="p-2.5 rounded-xl bg-[#141215] border border-[#29252A] text-[11px] text-[#B0ACB0]">
                <strong>Previous Suspension Reason:</strong> {unsuspendTargetUser.banReason}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                disabled={isProcessingStatus}
                onClick={() => setUnsuspendTargetUser(null)}
                className="px-3.5 py-2 rounded-xl bg-[#141215] hover:bg-[#29252A] text-[#B0ACB0] text-xs font-bold transition"
              >
                Cancel
              </button>
              <button
                disabled={isProcessingStatus}
                onClick={handleConfirmUnsuspend}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-emerald-950/60 disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {isProcessingStatus ? 'Restoring...' : 'Confirm Unsuspend'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ban Reason Modal */}
      {showBanModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#0D0B0D] border border-[#350A12] rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-rose-400 flex items-center gap-2">
              <Ban className="w-5 h-5" /> Ban Player: {selectedUser.username}
            </h3>
            <p className="text-xs text-[#B0ACB0]">
              Specify reason for banning this player. Banned accounts cannot participate in tournaments or log in.
            </p>

            <div>
              <label className="block text-[10px] uppercase font-bold text-[#B0ACB0] mb-1">
                Violation Reason
              </label>
              <textarea
                rows={3}
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="e.g. Using hacks/aimbot scripts in BGMI Erangel match..."
                className="w-full bg-[#141215] text-white text-xs p-3 rounded-xl border border-[#350A12] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowBanModal(false);
                  setBanReason('');
                }}
                className="px-3 py-2 rounded-xl bg-[#0D0B0D] text-[#B0ACB0] text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyBan}
                disabled={!banReason.trim()}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold disabled:opacity-50"
              >
                Confirm Ban
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Adjust Modal */}
      {showWalletAdjustModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#0D0B0D] border border-[#29252A] rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-[#C9A34E] flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#C9A34E]" /> Wallet Adjust: {selectedUser.username}
            </h3>
            <div className="flex items-center gap-2 bg-[#141215] p-1 rounded-xl">
              <button
                onClick={() => setWalletType("main")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${walletType === "main" ? "bg-[#E21B36] text-white" : "text-[#B0ACB0]"}`}
              >
                Main Wallet
              </button>
              <button
                onClick={() => setWalletType("winning")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${walletType === "winning" ? "bg-[#C9A34E] text-black" : "text-[#B0ACB0]"}`}
              >
                Winning Balance
              </button>
            </div>

            <div className="flex items-center gap-2 bg-[#141215] p-1 rounded-xl">
              <button
                onClick={() => setWalletIsAddition(true)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                  walletIsAddition ? 'bg-[#C9A34E] text-black' : 'text-[#B0ACB0]'
                }`}
              >
                + Add Funds
              </button>
              <button
                onClick={() => setWalletIsAddition(false)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                  !walletIsAddition ? 'bg-rose-500 text-white' : 'text-[#B0ACB0]'
                }`}
              >
                - Deduct Funds
              </button>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-[#B0ACB0] mb-1">
                Amount (INR)
              </label>
              <input
                type="number"
                min="1"
                value={isNaN(walletAmount) ? 0 : walletAmount}
                onChange={(e) => setWalletAmount(isNaN(Number(e.target.value)) ? 0 : Number(e.target.value))}
                className="w-full bg-[#141215] text-white text-sm p-3 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-[#B0ACB0] mb-1">
                Reason / Note for Audit
              </label>
              <input
                type="text"
                value={walletNote}
                onChange={(e) => setWalletNote(e.target.value)}
                placeholder="Tournament kill reward correction"
                className="w-full bg-[#141215] text-white text-xs p-3 rounded-xl border border-[#29252A] focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowWalletAdjustModal(false)}
                className="px-3 py-2 rounded-xl bg-[#0D0B0D] text-[#B0ACB0] text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyWalletAdjustment}
                className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-black text-xs font-bold"
              >
                Apply Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Player Profile Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <form onSubmit={handleEditSubmit} className="w-full max-w-lg bg-[#0D0B0D] border border-[#29252A] rounded-3xl p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-[#29252A] pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-[#777278]" /> Edit Player Gaming Profile
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUserId(null);
                }}
                className="p-1 rounded-lg bg-[#1B181C] hover:bg-[#29252A] text-[#B0ACB0] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* BGMI Gaming Profile */}
              <div className="sm:col-span-1">
                <label className="block text-[10px] uppercase font-black tracking-wider text-[#B0ACB0] mb-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span> BGMI In-Game Name (IGN)
                </label>
                <div className="relative">
                  <Gamepad2 className="absolute left-3 top-3 w-4 h-4 text-[#777278]" />
                  <input
                    type="text"
                    value={editBgmiIgn}
                    onChange={(e) => setEditBgmiIgn(e.target.value)}
                    placeholder="e.g. BGMI_LEGEND"
                    className="w-full bg-[#141215] text-white text-xs pl-10 pr-3 py-2.5 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none font-medium"
                  />
                </div>
              </div>

              <div className="sm:col-span-1">
                <label className="block text-[10px] uppercase font-black tracking-wider text-[#B0ACB0] mb-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span> BGMI Character ID (UID)
                </label>
                <div className="relative">
                  <Gamepad2 className="absolute left-3 top-3 w-4 h-4 text-[#777278]" />
                  <input
                    type="text"
                    value={editBgmiUid}
                    onChange={(e) => setEditBgmiUid(e.target.value)}
                    placeholder="e.g. 5123456789"
                    className="w-full bg-[#141215] text-white text-xs pl-10 pr-3 py-2.5 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none font-medium"
                  />
                </div>
              </div>

              {/* Free Fire Gaming Profile */}
              <div className="sm:col-span-1">
                <label className="block text-[10px] uppercase font-black tracking-wider text-[#B0ACB0] mb-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0"></span> Free Fire In-Game Name (IGN)
                </label>
                <div className="relative">
                  <Gamepad2 className="absolute left-3 top-3 w-4 h-4 text-[#777278]" />
                  <input
                    type="text"
                    value={editFfIgn}
                    onChange={(e) => {
                      setEditFfIgn(e.target.value);
                      setEditInGameName(e.target.value);
                    }}
                    placeholder="e.g. FF_WARRIOR"
                    className="w-full bg-[#141215] text-white text-xs pl-10 pr-3 py-2.5 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none font-medium"
                  />
                </div>
              </div>

              <div className="sm:col-span-1">
                <label className="block text-[10px] uppercase font-black tracking-wider text-[#B0ACB0] mb-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0"></span> Free Fire UID
                </label>
                <div className="relative">
                  <Gamepad2 className="absolute left-3 top-3 w-4 h-4 text-[#777278]" />
                  <input
                    type="text"
                    value={editFfUid}
                    onChange={(e) => setEditFfUid(e.target.value)}
                    placeholder="e.g. 987654321"
                    className="w-full bg-[#141215] text-white text-xs pl-10 pr-3 py-2.5 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none font-medium"
                  />
                </div>
              </div>

              {/* Username */}
              <div className="sm:col-span-2">
                <label className="block text-[10px] uppercase font-black tracking-wider text-[#B0ACB0] mb-1">
                  Portal Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-[#777278]" />
                  <input
                    type="text"
                    required
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    placeholder="e.g. vipersniper99"
                    className="w-full bg-[#141215] text-white text-xs pl-10 pr-3 py-2.5 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-[10px] uppercase font-black tracking-wider text-[#B0ACB0] mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-[#777278]" />
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="e.g. viper.gaming@gmail.com"
                    className="w-full bg-[#141215] text-white text-xs pl-10 pr-3 py-2.5 rounded-xl border border-[#29252A] focus:border-[#C9A34E] focus:outline-none"
                  />
                </div>
              </div>

              {/* Phone Number (Disabled / Non-Editable) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] uppercase font-black tracking-wider text-[#B0ACB0]">
                    Phone Number
                  </label>
                  <span className="text-[9px] font-bold uppercase text-[#C9A34E] bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/60">
                    Permanent
                  </span>
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-[#777278] opacity-60" />
                  <input
                    type="tel"
                    disabled
                    value={editPhone}
                    placeholder="e.g. +91 9876543210"
                    className="w-full bg-[#14102B] text-[#B0ACB0]/70 text-xs pl-10 pr-3 py-2.5 rounded-xl border border-[#29252A]/60 cursor-not-allowed font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#29252A]">
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUserId(null);
                }}
                className="px-4 py-2 rounded-xl bg-[#0D0B0D] text-[#B0ACB0] text-xs font-bold transition hover:bg-[#141215]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#E21B36] hover:bg-[#FF3048] text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-black"
              >
                <CheckCircle2 className="w-4 h-4" /> Save Profile Details
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
};
