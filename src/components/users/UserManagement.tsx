import React, { useState, useEffect } from 'react';
import { AppUser, UserStatus, WalletTransaction, Tournament, AvatarPreset } from '../../types';
import {
  getCachedPresetAvatars,
  resolvePresetAvatarUrl,
  fetchPresetAvatars,
  DEFAULT_PRESET_AVATARS,
} from '../../services/supabaseService';
import {
  Search,
  Filter,
  User,
  Shield,
  ShieldAlert,
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
  onEditUser: (userId: string, profileData: { username: string; email: string; phone: string; inGameName: string; inGameId: string; avatar_id?: string; avatarId?: string; avatarUrl?: string }) => void;
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'blocked' | 'banned'>('all');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const selectedUser = (users || []).find((u) => u && (u.id === selectedUserId || u.uid === selectedUserId)) || null;

  // Modals state
  const [showBanModal, setShowBanModal] = useState(false);
  const [banReason, setBanReason] = useState('');
  
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
  const [editInGameId, setEditInGameId] = useState('');
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
      const inGameId = u.inGameId || '';
      const inGameName = (u.inGameName || '').toLowerCase();

      const matchesSearch = !q ||
        username.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        inGameId.toLowerCase().includes(q) ||
        inGameName.includes(q);

      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
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
        inGameName: editInGameName,
        inGameId: editInGameId,
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#15112E] border border-purple-800/40">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <User className="w-5 h-5 text-amber-400" /> Player Directory & Wallet Desk
          </h2>
          <p className="text-xs text-purple-300/80">
            Manage player accounts, in-game IDs, bans, and wallet adjustments
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 text-xs font-bold bg-purple-950 text-amber-300 border border-purple-800/50 rounded-xl">
            Total: {(users || []).length} Players
          </span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Search Field */}
        <div className="sm:col-span-2 relative">
          <Search className="absolute left-3.5 top-3 w-4 h-4 text-purple-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Username, Email, Phone, In-Game ID (5489...), or IGN..."
            className="w-full bg-[#1A1538] text-white text-xs pl-10 pr-4 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-purple-400 hover:text-white text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1 bg-[#1A1538] p-1 rounded-xl border border-purple-800/50 overflow-x-auto">
          {(['all', 'active', 'blocked', 'banned'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-bold uppercase transition ${
                statusFilter === st
                  ? 'bg-amber-400 text-black shadow-md'
                  : 'text-purple-300/80 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Searchable Players Table */}
      <div className="bg-[#15112E] rounded-2xl border border-purple-800/40 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-purple-200">
            <thead className="bg-[#1A1538] text-purple-300 font-bold uppercase text-[10px] tracking-wider border-b border-purple-800/40">
              <tr>
                <th className="px-4 py-3">Player Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">UID / IGN</th>
                <th className="px-4 py-3">Balances (Main / Winning)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-900/30">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-purple-400">
                    No players matched your search.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-purple-900/20 transition">
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
                    <td className="px-4 py-3 text-purple-300 font-mono">
                      {user.phone ? user.phone : <span className="text-purple-500">N/A</span>}
                    </td>

                    {/* Email */}
                    <td className="px-4 py-3 text-purple-300 truncate max-w-[150px]">
                      {user.email ? user.email : <span className="text-purple-500">N/A</span>}
                    </td>

                    {/* UID */}
                    <td className="px-4 py-3">
                      <div className="font-mono text-amber-300 font-bold">
                        {user.inGameId ? user.inGameId : <span className="text-purple-500 font-normal">N/A</span>}
                      </div>
                      <div className="text-[10px] text-purple-400">
                        {user.inGameName ? user.inGameName : <span className="text-purple-500 font-normal">N/A</span>}
                      </div>
                    </td>

                    {/* Wallet Balance */}
                    <td className="px-4 py-3">
                      <div className="font-extrabold text-emerald-400 text-sm">
                        ₹{(user.walletBalance ?? 0).toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-amber-300 font-bold">
                        Winnings: ₹{(user.unclaimedWinnings ?? 0).toLocaleString('en-IN')}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`px-2.5 py-0.5 text-[9px] font-black uppercase rounded-md border ${
                          (user.status || 'active') === 'active'
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : (user.status || 'active') === 'blocked'
                            ? 'bg-amber-950 text-amber-300 border-amber-800'
                            : 'bg-rose-950 text-rose-400 border-rose-800'
                        }`}
                      >
                        {user.status || 'active'}
                      </span>
                    </td>

                    {/* Actions: View, Edit, Suspend */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* View Button */}
                        <button
                          onClick={() => setSelectedUserId(user.id || user.uid || null)}
                          className="px-2.5 py-1 rounded-lg bg-purple-900/60 hover:bg-purple-800 text-amber-300 border border-purple-700/50 text-[11px] font-bold transition flex items-center gap-1"
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
                            setEditInGameId(user.inGameId || '');
                            setEditAvatarId(curAvatarId);
                            setEditAvatarUrl(resolvePresetAvatarUrl(curAvatarId, user.avatarUrl));
                            setShowEditModal(true);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/50 text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <Edit3 className="w-3 h-3 text-indigo-300" />
                          <span>Edit</span>
                        </button>

                        {/* Suspend / Unsuspend Button */}
                        <button
                          onClick={() => {
                            if ((user.status || 'active') === 'active') {
                              onUpdateUserStatus(user.id, 'blocked', 'Account suspended by admin');
                            } else {
                              onUpdateUserStatus(user.id, 'active');
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 ${
                            (user.status || 'active') === 'active'
                              ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/60'
                              : 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60'
                          }`}
                        >
                          <ShieldAlert className="w-3 h-3" />
                          <span>{(user.status || 'active') === 'active' ? 'Suspend' : 'Unsuspend'}</span>
                        </button>
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
          <div className="flex items-center justify-between px-4 py-3 bg-[#1A1538] border-t border-purple-800/50 text-xs text-purple-300">
            <div>
              Showing <span className="font-bold text-white">{(currentPage - 1) * pageSize + 1}</span> to{' '}
              <span className="font-bold text-white">{Math.min(currentPage * pageSize, filteredUsers.length)}</span> of{' '}
              <span className="font-bold text-white">{filteredUsers.length}</span> players
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded-lg bg-purple-900/60 border border-purple-700/50 hover:bg-purple-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition"
              >
                Previous
              </button>

              <span className="font-bold text-amber-300 px-2">
                Page {currentPage} of {totalPages}
              </span>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 rounded-lg bg-purple-900/60 border border-purple-700/50 hover:bg-purple-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition"
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
          <div className="w-full max-w-2xl bg-[#130F29] border border-purple-800/80 rounded-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-purple-800/50">
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
                    <span className="text-xs px-2 py-0.5 rounded-md bg-purple-900 text-amber-300 font-bold border border-purple-700">
                      {selectedUser.status}
                    </span>
                  </h3>
                  <p className="text-xs text-purple-300/80">
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
                    setEditInGameId(selectedUser.inGameId || '');
                    setShowEditModal(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-indigo-900/60 hover:bg-indigo-800 text-indigo-200 border border-indigo-700/50 text-xs font-bold transition flex items-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5 text-indigo-300" />
                  <span>Edit Profile</span>
                </button>

                <button
                  onClick={() => setSelectedUserId(null)}
                  className="p-2 rounded-xl bg-purple-900/40 hover:bg-purple-800 text-purple-300 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Sub Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-purple-800/40 pb-2">
              <button
                onClick={() => setActiveUserDetailTab('profile')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeUserDetailTab === 'profile'
                    ? 'bg-amber-400 text-black shadow-md'
                    : 'text-purple-300 hover:text-white bg-purple-950/40'
                }`}
              >
                Profile & Wallet
              </button>
              <button
                onClick={() => setActiveUserDetailTab('matches')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeUserDetailTab === 'matches'
                    ? 'bg-amber-400 text-black shadow-md'
                    : 'text-purple-300 hover:text-white bg-purple-950/40'
                }`}
              >
                Matches ({userMatches.length})
              </button>
              <button
                onClick={() => setActiveUserDetailTab('transactions')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeUserDetailTab === 'transactions'
                    ? 'bg-amber-400 text-black shadow-md'
                    : 'text-purple-300 hover:text-white bg-purple-950/40'
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
                  <div className="p-3 rounded-xl bg-[#1A1538] border border-purple-800/40">
                    <p className="text-[10px] text-purple-400 uppercase font-bold">In-Game Name</p>
                    <p className="text-sm font-black text-amber-300 mt-0.5">
                      {selectedUser.inGameName ? selectedUser.inGameName : <span className="text-purple-500 font-normal">N/A</span>}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#1A1538] border border-purple-800/40">
                    <p className="text-[10px] text-purple-400 uppercase font-bold">In-Game ID</p>
                    <p className="text-sm font-black text-purple-100 mt-0.5">
                      {selectedUser.inGameId ? selectedUser.inGameId : <span className="text-purple-500 font-normal">N/A</span>}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#1A1538] border border-purple-800/40 col-span-2 sm:col-span-1">
                    <p className="text-[10px] text-purple-400 uppercase font-bold">Main Wallet</p>
                    <p className="text-sm font-black text-emerald-400 mt-0.5">₹{selectedUser.walletBalance}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#1A1538] border border-purple-800/40 col-span-2 sm:col-span-1">
                    <p className="text-[10px] text-purple-400 uppercase font-bold">Winning Balance</p>
                    <p className="text-sm font-black text-amber-300 mt-0.5">₹{selectedUser.unclaimedWinnings}</p>
                  </div>
                </div>

                {/* Account Details */}
                <div className="p-3.5 rounded-xl bg-[#1A1538] border border-purple-800/40 space-y-2 text-xs">
                  <div className="flex justify-between text-purple-200">
                    <span className="text-purple-400">Email Address:</span>
                    <span className="font-semibold">
                      {selectedUser.email ? selectedUser.email : <span className="text-purple-500 font-normal">N/A</span>}
                    </span>
                  </div>
                  <div className="flex justify-between text-purple-200">
                    <span className="text-purple-400">Phone Number:</span>
                    <span className="font-semibold">
                      {selectedUser.phone ? selectedUser.phone : <span className="text-purple-500 font-normal">N/A</span>}
                    </span>
                  </div>
                  <div className="flex justify-between text-purple-200">
                    <span className="text-purple-400">Total Deposits:</span>
                    <span className="font-semibold text-emerald-400">₹{selectedUser.totalDeposits}</span>
                  </div>
                  <div className="flex justify-between text-purple-200">
                    <span className="text-purple-400">Total Withdrawals:</span>
                    <span className="font-semibold text-rose-300">₹{selectedUser.totalWithdrawals}</span>
                  </div>
                  <div className="flex justify-between text-purple-200">
                    <span className="text-purple-400">Kills Record:</span>
                    <span className="font-semibold text-amber-300">{selectedUser.totalKills} Total Kills</span>
                  </div>
                </div>

                {/* Quick Wallet Adjust Action */}
                <div className="p-3.5 rounded-xl bg-purple-950/60 border border-purple-700/50 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-amber-300">Admin Wallet Adjustment</p>
                    <p className="text-[10px] text-purple-300">Add or deduct funds directly from user wallet</p>
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
                  <p className="text-xs text-purple-400 text-center py-6">No tournament matches played yet.</p>
                ) : (
                  userMatches.map((m) => (
                    <div key={m.id} className="p-3 rounded-xl bg-[#1A1538] border border-purple-800/40 text-xs flex justify-between items-center">
                      <div>
                        <p className="font-bold text-white">{m.title}</p>
                        <p className="text-[10px] text-purple-300">{m.game} • {m.matchType} • Entry: ₹{m.entryFee}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-900 text-amber-300">
                        {m.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeUserDetailTab === 'transactions' && (
              <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                {userTransactions.length === 0 ? (
                  <p className="text-xs text-purple-400 text-center py-6">No transaction records found.</p>
                ) : (
                  userTransactions.map((tx) => {
                    const isCredit = tx.type !== 'withdrawal' && tx.type !== 'entry_fee';
                    return (
                      <div
                        key={tx.id}
                        className="p-2.5 rounded-xl bg-[#130F29]/80 border border-purple-800/20 hover:border-purple-600/40 transition flex items-center justify-between gap-3 text-xs"
                      >
                        {/* Left Section: Icon & Metadata */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                              isCredit
                                ? 'bg-emerald-500/10 text-emerald-400'
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
                              <span className="text-[9px] px-1 py-0.2 rounded bg-purple-900/50 text-purple-300 font-medium">
                                {tx.paymentMethod || 'Wallet'}
                              </span>
                            </div>
                            <p className="text-[10px] text-purple-400 truncate flex items-center gap-1 mt-0.5 font-mono">
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
                              isCredit ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {isCredit ? '+' : '-'}₹{(tx.amount || 0).toLocaleString('en-IN')}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-black uppercase rounded-md tracking-wider border ${
                              tx.status === 'pending'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : tx.status === 'approved'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
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
            <div className="pt-3 border-t border-purple-800/50 flex justify-between gap-2">
              <button
                onClick={() => {
                  onDeleteUser(selectedUser.id);
                  setSelectedUserId(null);
                }}
                className="px-3 py-2 rounded-xl bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/60 text-xs font-bold flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete User
              </button>

              <button
                onClick={() => setSelectedUserId(null)}
                className="px-4 py-2 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-purple-200 text-xs font-bold"
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Ban Reason Modal */}
      {showBanModal && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#130F29] border border-rose-800/80 rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-rose-400 flex items-center gap-2">
              <Ban className="w-5 h-5" /> Ban Player: {selectedUser.username}
            </h3>
            <p className="text-xs text-purple-200">
              Specify reason for banning this player. Banned accounts cannot participate in tournaments or log in.
            </p>

            <div>
              <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                Violation Reason
              </label>
              <textarea
                rows={3}
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="e.g. Using hacks/aimbot scripts in BGMI Erangel match..."
                className="w-full bg-[#1A1538] text-white text-xs p-3 rounded-xl border border-rose-800/50 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setShowBanModal(false);
                  setBanReason('');
                }}
                className="px-3 py-2 rounded-xl bg-purple-950 text-purple-300 text-xs font-bold"
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
          <div className="w-full max-w-md bg-[#130F29] border border-purple-800/80 rounded-3xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-amber-300 flex items-center gap-2">
              <Wallet className="w-5 h-5 text-amber-400" /> Wallet Adjust: {selectedUser.username}
            </h3>
            <div className="flex items-center gap-2 bg-[#1A1538] p-1 rounded-xl">
              <button
                onClick={() => setWalletType("main")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${walletType === "main" ? "bg-purple-600 text-white" : "text-purple-300"}`}
              >
                Main Wallet
              </button>
              <button
                onClick={() => setWalletType("winning")}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${walletType === "winning" ? "bg-amber-500 text-black" : "text-purple-300"}`}
              >
                Winning Balance
              </button>
            </div>

            <div className="flex items-center gap-2 bg-[#1A1538] p-1 rounded-xl">
              <button
                onClick={() => setWalletIsAddition(true)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                  walletIsAddition ? 'bg-emerald-500 text-black' : 'text-purple-300'
                }`}
              >
                + Add Funds
              </button>
              <button
                onClick={() => setWalletIsAddition(false)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
                  !walletIsAddition ? 'bg-rose-500 text-white' : 'text-purple-300'
                }`}
              >
                - Deduct Funds
              </button>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                Amount (INR)
              </label>
              <input
                type="number"
                min="1"
                value={isNaN(walletAmount) ? 0 : walletAmount}
                onChange={(e) => setWalletAmount(isNaN(Number(e.target.value)) ? 0 : Number(e.target.value))}
                className="w-full bg-[#1A1538] text-white text-sm p-3 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                Reason / Note for Audit
              </label>
              <input
                type="text"
                value={walletNote}
                onChange={(e) => setWalletNote(e.target.value)}
                placeholder="Tournament kill reward correction"
                className="w-full bg-[#1A1538] text-white text-xs p-3 rounded-xl border border-purple-800/50 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowWalletAdjustModal(false)}
                className="px-3 py-2 rounded-xl bg-purple-950 text-purple-300 text-xs font-bold"
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
          <form onSubmit={handleEditSubmit} className="w-full max-w-lg bg-[#130F29] border border-purple-800/80 rounded-3xl p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center border-b border-purple-800/40 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-400" /> Edit Player Gaming Profile
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUserId(null);
                }}
                className="p-1 rounded-lg bg-purple-900/40 hover:bg-purple-800 text-purple-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* In-Game Name (IGN) */}
              <div>
                <label className="block text-[10px] uppercase font-black tracking-wider text-purple-300 mb-1">
                  In-Game Name (IGN)
                </label>
                <div className="relative">
                  <Gamepad2 className="absolute left-3 top-3 w-4 h-4 text-purple-400" />
                  <input
                    type="text"
                    required
                    value={editInGameName}
                    onChange={(e) => setEditInGameName(e.target.value)}
                    placeholder="e.g. VIPER•SNIPER"
                    className="w-full bg-[#1A1538] text-white text-xs pl-10 pr-3 py-2.5 rounded-xl border border-purple-800/50 focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* In-Game ID (UID) */}
              <div>
                <label className="block text-[10px] uppercase font-black tracking-wider text-purple-300 mb-1">
                  In-Game ID (UID)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-purple-400 text-xs font-bold font-mono">ID</span>
                  <input
                    type="text"
                    required
                    value={editInGameId}
                    onChange={(e) => setEditInGameId(e.target.value)}
                    placeholder="e.g. 5489623101"
                    className="w-full bg-[#1A1538] text-white text-xs pl-10 pr-3 py-2.5 rounded-xl border border-purple-800/50 focus:border-indigo-400 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* Username */}
              <div className="sm:col-span-2">
                <label className="block text-[10px] uppercase font-black tracking-wider text-purple-300 mb-1">
                  Portal Username
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-purple-400" />
                  <input
                    type="text"
                    required
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    placeholder="e.g. vipersniper99"
                    className="w-full bg-[#1A1538] text-white text-xs pl-10 pr-3 py-2.5 rounded-xl border border-purple-800/50 focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-[10px] uppercase font-black tracking-wider text-purple-300 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-purple-400" />
                  <input
                    type="email"
                    required
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="e.g. viper.gaming@gmail.com"
                    className="w-full bg-[#1A1538] text-white text-xs pl-10 pr-3 py-2.5 rounded-xl border border-purple-800/50 focus:border-indigo-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Phone Number (Disabled / Non-Editable) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[10px] uppercase font-black tracking-wider text-purple-300">
                    Phone Number
                  </label>
                  <span className="text-[9px] font-bold uppercase text-amber-300 bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-800/60">
                    Permanent
                  </span>
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-purple-400 opacity-60" />
                  <input
                    type="tel"
                    disabled
                    value={editPhone}
                    placeholder="e.g. +91 9876543210"
                    className="w-full bg-[#14102B] text-purple-300/70 text-xs pl-10 pr-3 py-2.5 rounded-xl border border-purple-900/60 cursor-not-allowed font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-purple-800/40">
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false);
                  setEditingUserId(null);
                }}
                className="px-4 py-2 rounded-xl bg-purple-950 text-purple-300 text-xs font-bold transition hover:bg-purple-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-lg shadow-indigo-950/50"
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
