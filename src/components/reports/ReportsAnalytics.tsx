import React, { useState } from 'react';
import { AppUser, Tournament, WalletTransaction } from '../../types';
import { BarChart3, Download } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line
} from 'recharts';

interface ReportsAnalyticsProps {
  users?: AppUser[];
  tournaments?: Tournament[];
  transactions?: WalletTransaction[];
}

export const ReportsAnalytics: React.FC<ReportsAnalyticsProps> = ({
  users = [],
  tournaments = [],
  transactions = []
}) => {
  const [timeRange, setTimeRange] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  const safeUsers = users || [];
  const safeTournaments = tournaments || [];
  const safeTransactions = transactions || [];

  const approvedDeposits = safeTransactions
    .filter((t) => t && t.type === 'deposit' && t.status === 'approved')
    .reduce((acc, t) => acc + (t?.amount || 0), 0);

  const approvedWithdrawals = safeTransactions
    .filter((t) => t && t.type === 'withdrawal' && t.status === 'approved')
    .reduce((acc, t) => acc + (t?.amount || 0), 0);

  const totalNetProfit = Math.max(0, approvedDeposits - approvedWithdrawals);

  const totalParticipants = safeTournaments.reduce((acc, t) => acc + ((t?.participants || []).length), 0);

  const totalWithdrawalRequests = safeTransactions.filter((t) => t && t.type === 'withdrawal').length;
  const approvedWithdrawalRequests = safeTransactions.filter((t) => t && t.type === 'withdrawal' && t.status === 'approved').length;
  const payoutRate = totalWithdrawalRequests > 0
    ? ((approvedWithdrawalRequests / totalWithdrawalRequests) * 100).toFixed(1)
    : '100.0';

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weeklyData = daysOfWeek.map((day) => {
    return {
      day,
      revenue: totalNetProfit,
      users: safeUsers.length,
      matches: safeTournaments.length
    };
  });

  const handleExportCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,Day,Revenue,Users,Matches\n' +
      weeklyData.map((d) => `${d.day},${d.revenue},${d.users},${d.matches}`).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `winx7_esports_report_${timeRange}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 animate-in fade-in pb-16 md:pb-6">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#15112E] border border-purple-800/40">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-400" /> Financial & Platform Analytics
          </h2>
          <p className="text-xs text-purple-300/80">
            Real-time financial metrics, tournament revenue logs, and player growth records
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#1A1538] p-1 rounded-xl border border-purple-800/50">
            {(['daily', 'weekly', 'monthly'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1 text-[11px] font-bold uppercase rounded-lg transition ${
                  timeRange === r ? 'bg-amber-400 text-black shadow-md' : 'text-purple-300 hover:text-white'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-900 hover:bg-purple-800 text-amber-300 border border-purple-700/50 text-xs font-bold transition active:scale-95"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40">
          <p className="text-[10px] text-purple-300 uppercase font-bold">Total Platform Net Profit</p>
          <p className="text-xl font-black text-emerald-400 mt-1">₹{(totalNetProfit ?? 0).toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-purple-300/80 font-semibold mt-0.5">Approved Deposits - Withdrawals</p>
        </div>

        <div className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40">
          <p className="text-[10px] text-purple-300 uppercase font-bold">Active Match Registrations</p>
          <p className="text-xl font-black text-amber-300 mt-1">{totalParticipants} Registrations</p>
          <p className="text-[10px] text-amber-300/80 font-semibold mt-0.5">{tournaments.length} Esports Matches</p>
        </div>

        <div className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40">
          <p className="text-[10px] text-purple-300 uppercase font-bold">Successful Payout Rate</p>
          <p className="text-xl font-black text-purple-100 mt-1">{payoutRate}% Approved</p>
          <p className="text-[10px] text-purple-300/80 font-semibold mt-0.5">{approvedWithdrawalRequests} Payouts Processed</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Revenue Bar Chart */}
        <div className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40">
          <h3 className="text-sm font-bold text-white mb-2">Revenue vs Tournament Fees</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#251E45" />
                <XAxis dataKey="day" stroke="#8B5CF6" fontSize={11} />
                <YAxis stroke="#8B5CF6" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#1A1538', borderColor: '#6D28D9', borderRadius: '12px', color: '#FFF' }} />
                <Bar dataKey="revenue" name="Revenue (₹)" fill="#F59E0B" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* User Growth Line Chart */}
        <div className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40">
          <h3 className="text-sm font-bold text-white mb-2">Player Growth</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#251E45" />
                <XAxis dataKey="day" stroke="#8B5CF6" fontSize={11} />
                <YAxis stroke="#8B5CF6" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#1A1538', borderColor: '#6D28D9', borderRadius: '12px', color: '#FFF' }} />
                <Line type="monotone" dataKey="users" name="Active Players" stroke="#10B981" strokeWidth={3} dot={{ fill: '#10B981' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

    </div>
  );
};

