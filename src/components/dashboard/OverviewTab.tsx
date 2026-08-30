import React from 'react';
import {
  AppUser,
  Tournament,
  WalletTransaction
} from '../../types';
import { resolveParticipantDetails, getMatchBannerImage } from '../tournaments/TournamentManagement';
import { resolveUserDisplayName } from '../../services/supabaseService';
import {
  Users,
  Trophy,
  ArrowDownRight,
  ArrowUpRight,
  Flame,
  CheckCircle2,
  PlusCircle,
  Bell,
  TrendingUp,
  UserCheck,
  Clock,
  Ticket,
  Calendar,
  Gamepad2,
  MapPin,
  Activity
} from 'lucide-react';

interface OverviewTabProps {
  users: AppUser[];
  tournaments: Tournament[];
  transactions: WalletTransaction[];
  setActiveTab: (tab: string) => void;
  onOpenCreateMatch: () => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  users,
  tournaments,
  transactions,
  setActiveTab,
  onOpenCreateMatch
}) => {
  // Calculated Essential Metrics
  const safeUsers = users || [];
  const safeTournaments = tournaments || [];
  const safeTransactions = transactions || [];

  const totalUsersCount = safeUsers.length;
  const activeUsersCount = safeUsers.filter((u) => u && u.status === 'active').length;

  const liveMatches = safeTournaments.filter((t) => t && (t.status || 'upcoming').toLowerCase() === 'live');
  const upcomingMatches = safeTournaments.filter((t) => t && (t.status || 'upcoming').toLowerCase() === 'upcoming');
  const completedMatches = safeTournaments.filter((t) => {
    const status = (t.status || 'upcoming').toLowerCase();
    return status === 'finished' || status === 'completed';
  });

  const pendingDeposits = safeTransactions.filter((t) => t && t.type === 'deposit' && t.status === 'pending');
  const pendingWithdrawals = safeTransactions.filter((t) => t && t.type === 'withdrawal' && t.status === 'pending');

  const pendingDepositsSum = pendingDeposits.reduce((acc, t) => acc + (t?.amount || 0), 0);
  const pendingWithdrawalsSum = pendingWithdrawals.reduce((acc, t) => acc + (t?.amount || 0), 0);

  const totalApprovedDeposits = safeTransactions
    .filter((t) => t && t.type === 'deposit' && t.status === 'approved')
    .reduce((acc, t) => acc + (t?.amount || 0), 0);

  const totalApprovedWithdrawals = safeTransactions
    .filter((t) => t && t.type === 'withdrawal' && t.status === 'approved')
    .reduce((acc, t) => acc + (t?.amount || 0), 0);

  const totalRevenue = Math.max(0, totalApprovedDeposits - totalApprovedWithdrawals);

  // Recent Activity Data
  const recentDeposits = safeTransactions
    .filter((t) => t && t.type === 'deposit')
    .slice(0, 5);

  const recentWithdrawals = safeTransactions
    .filter((t) => t && t.type === 'withdrawal')
    .slice(0, 5);

  // Flatten match registrations across tournaments
  const recentRegistrations = safeTournaments.flatMap((t) =>
    t ? (t.participants || []).map((p) => {
      const { email, inGameId, inGameName, username } = resolveUserDisplayName(p, safeUsers);
      return {
        tournamentTitle: t.title || 'Untitled Match',
        game: t.game || 'Free Fire',
        entryFee: t.entryFee || 0,
        username,
        inGameName: inGameName !== 'N/A' ? inGameName : username,
        inGameId
      };
    }) : []
  ).slice(0, 5);

  return (
    <div className="space-y-6 animate-in fade-in pb-16 md:pb-6">
      {/* Quick Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-purple-900/80 via-indigo-950/80 to-purple-950 border border-purple-800/50 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-400 text-black rounded-md">
              Overview
            </span>
            <span className="text-xs text-purple-300 font-semibold">Live Gaming Platform</span>
          </div>
          <h2 className="text-xl font-black text-white mt-1">
            WinX7 Dashboard
          </h2>
          <p className="text-xs text-purple-300/80">
            Simplified admin metrics & recent activity feeds
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={onOpenCreateMatch}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-extrabold text-xs bg-gradient-to-r from-amber-400 to-amber-500 text-black hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/20 transition active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Match</span>
          </button>

          <button
            onClick={() => setActiveTab('announcements')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl font-semibold text-xs bg-purple-900/60 hover:bg-purple-800/80 border border-purple-700/50 text-purple-200 transition active:scale-95"
          >
            <Bell className="w-4 h-4 text-amber-300" />
            <span>Announce</span>
          </button>
        </div>
      </div>

      {/* 8 Essential Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3.5">
        
        {/* 1. Total Users */}
        <div
          onClick={() => setActiveTab('users')}
          className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40 hover:border-amber-400/50 transition cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-300 uppercase">Total Users</span>
            <div className="p-2 rounded-xl bg-purple-900/50 text-amber-400 group-hover:scale-110 transition">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-white">{totalUsersCount}</p>
            <p className="text-[10px] text-purple-400 mt-0.5">Registered Players</p>
          </div>
        </div>

        {/* 2. Active Users */}
        <div
          onClick={() => setActiveTab('users')}
          className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40 hover:border-amber-400/50 transition cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-300 uppercase">Active Users</span>
            <div className="p-2 rounded-xl bg-emerald-950 text-emerald-400 group-hover:scale-110 transition">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-emerald-400">{activeUsersCount}</p>
            <p className="text-[10px] text-emerald-300/80 mt-0.5">Active Account Status</p>
          </div>
        </div>

        {/* 3. Pending Deposits */}
        <div
          onClick={() => setActiveTab('deposits')}
          className="p-4 rounded-2xl bg-[#15112E] border border-amber-500/30 hover:border-amber-400 transition cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-300 uppercase">Pending Deposits</span>
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 group-hover:scale-110 transition">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-amber-300">{pendingDeposits.length}</p>
            <p className="text-[10px] text-amber-200/80 mt-0.5">₹{pendingDepositsSum} Total Amount</p>
          </div>
        </div>

        {/* 4. Pending Withdrawals */}
        <div
          onClick={() => setActiveTab('withdrawals')}
          className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40 hover:border-amber-400/50 transition cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-300 uppercase">Pending Withdrawals</span>
            <div className="p-2 rounded-xl bg-indigo-900/50 text-indigo-300 group-hover:scale-110 transition">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-white">{pendingWithdrawals.length}</p>
            <p className="text-[10px] text-purple-300/80 mt-0.5">₹{pendingWithdrawalsSum} Payout Sum</p>
          </div>
        </div>

        {/* 5. Live Matches */}
        <div
          onClick={() => setActiveTab('matches')}
          className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40 hover:border-amber-400/50 transition cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-300 uppercase">Live Matches</span>
            <div className="p-2 rounded-xl bg-purple-900/50 text-rose-400 group-hover:scale-110 transition">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-rose-400">{liveMatches.length}</p>
            <p className="text-[10px] text-purple-300/80 mt-0.5">Matches In-Progress</p>
          </div>
        </div>

        {/* 6. Upcoming Matches */}
        <div
          onClick={() => setActiveTab('matches')}
          className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40 hover:border-amber-400/50 transition cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-300 uppercase">Upcoming</span>
            <div className="p-2 rounded-xl bg-purple-900/50 text-amber-400 group-hover:scale-110 transition">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-amber-400">{upcomingMatches.length}</p>
            <p className="text-[10px] text-purple-300/80 mt-0.5">Scheduled Lobbies</p>
          </div>
        </div>

        {/* 7. Completed Matches */}
        <div
          onClick={() => setActiveTab('matches')}
          className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40 hover:border-amber-400/50 transition cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-300 uppercase">Completed</span>
            <div className="p-2 rounded-xl bg-purple-900/50 text-emerald-400 group-hover:scale-110 transition">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-emerald-400">{completedMatches.length}</p>
            <p className="text-[10px] text-purple-300/80 mt-0.5">Results Released</p>
          </div>
        </div>

        {/* 8. Total Revenue */}
        <div
          onClick={() => setActiveTab('wallet')}
          className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40 hover:border-amber-400/50 transition cursor-pointer group flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-purple-300 uppercase">Total Revenue</span>
            <div className="p-2 rounded-xl bg-emerald-950 text-emerald-400 group-hover:scale-110 transition">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-emerald-400">₹{(totalRevenue ?? 0).toLocaleString('en-IN')}</p>
            <p className="text-[10px] text-emerald-300/80 mt-0.5">Net Platform Revenue</p>
          </div>
        </div>

      </div>

      {/* 3 Recent Activity Lists Below Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Recent Deposits */}
        <div className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-purple-800/40">
            <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
              <ArrowDownRight className="w-4 h-4 text-emerald-400" /> Recent Deposits
            </h3>
            <button
              onClick={() => setActiveTab('deposits')}
              className="text-[11px] text-amber-400 font-bold hover:underline"
            >
              View All
            </button>
          </div>

          <div className="space-y-2">
            {recentDeposits.length === 0 ? (
              <p className="text-xs text-purple-400 text-center py-6">No recent deposits recorded.</p>
            ) : (
              recentDeposits.map((tx) => {
                const userDisplay = resolveUserDisplayName(tx, safeUsers);
                return (
                  <div
                    key={tx.id}
                    onClick={() => setActiveTab('deposits')}
                    className="p-3 rounded-xl bg-[#1A1538] border border-purple-800/30 flex items-center justify-between hover:border-amber-400/40 transition cursor-pointer"
                  >
                    <div>
                      <p className="text-xs font-extrabold text-white">
                        {userDisplay.username}
                        {userDisplay.inGameName && userDisplay.inGameName !== 'N/A' && userDisplay.inGameName !== userDisplay.username ? (
                          <span className="text-[11px] text-purple-300 font-normal ml-1">({userDisplay.inGameName})</span>
                        ) : null}
                      </p>
                      <p className="text-[10px] text-purple-300">
                        Method: {tx.paymentMethod} • Ref: {tx.referenceId}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-extrabold text-emerald-400 text-sm">+₹{tx.amount}</span>
                      <span
                        className={`block text-[9px] font-bold uppercase ${
                          tx.status === 'approved'
                            ? 'text-emerald-400'
                            : tx.status === 'pending'
                            ? 'text-amber-300'
                            : 'text-rose-400'
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
        </div>

        {/* Recent Withdrawals */}
        <div className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-purple-800/40">
            <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-amber-400" /> Recent Withdrawals
            </h3>
            <button
              onClick={() => setActiveTab('withdrawals')}
              className="text-[11px] text-amber-400 font-bold hover:underline"
            >
              View All
            </button>
          </div>

          <div className="space-y-2">
            {recentWithdrawals.length === 0 ? (
              <p className="text-xs text-purple-400 text-center py-6">No recent withdrawals recorded.</p>
            ) : (
              recentWithdrawals.map((tx) => {
                const userDisplay = resolveUserDisplayName(tx, safeUsers);
                return (
                  <div
                    key={tx.id}
                    onClick={() => setActiveTab('withdrawals')}
                    className="p-3 rounded-xl bg-[#1A1538] border border-purple-800/30 flex items-center justify-between hover:border-amber-400/40 transition cursor-pointer"
                  >
                    <div>
                      <p className="text-xs font-extrabold text-white">
                        {userDisplay.username}
                        {userDisplay.inGameName && userDisplay.inGameName !== 'N/A' && userDisplay.inGameName !== userDisplay.username ? (
                          <span className="text-[11px] text-purple-300 font-normal ml-1">({userDisplay.inGameName})</span>
                        ) : null}
                      </p>
                      <p className="text-[10px] text-purple-300">
                        Req ID: {tx.withdrawalRequestId || tx.referenceId || tx.id} • UPI: {tx.upiId || 'Not Provided'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-extrabold text-white text-sm">-₹{tx.amount}</span>
                      <span
                        className={`block text-[9px] font-bold uppercase ${
                          tx.status === 'approved'
                            ? 'text-emerald-400'
                            : tx.status === 'pending'
                            ? 'text-amber-300'
                            : 'text-rose-400'
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
        </div>

        {/* Recent Match Registrations */}
        <div className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-purple-800/40">
            <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-purple-400" /> Match Registrations
            </h3>
            <button
              onClick={() => setActiveTab('matches')}
              className="text-[11px] text-amber-400 font-bold hover:underline"
            >
              View Matches
            </button>
          </div>

          <div className="space-y-2">
            {recentRegistrations.length === 0 ? (
              <p className="text-xs text-purple-400 text-center py-6">No match registrations yet.</p>
            ) : (
              recentRegistrations.map((reg, idx) => (
                <div
                  key={idx}
                  onClick={() => setActiveTab('matches')}
                  className="p-3 rounded-xl bg-[#1A1538] border border-purple-800/30 flex items-center justify-between hover:border-amber-400/40 transition cursor-pointer"
                >
                  <div>
                    <p className="text-xs font-extrabold text-white">
                      {reg.username}
                      {reg.inGameName && reg.inGameName !== 'N/A' && reg.inGameName !== reg.username ? (
                        <span className="text-[11px] text-purple-300 font-normal ml-1">({reg.inGameName})</span>
                      ) : null}
                    </p>
                    <p className="text-[10px] text-purple-300 truncate max-w-[180px]">
                      {reg.tournamentTitle}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 text-[9px] font-extrabold bg-purple-900 text-amber-300 rounded">
                      Fee: ₹{reg.entryFee}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
