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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#0D0B0D] border border-[#29252A]">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#C9A34E]" /> Financial & Platform Analytics
          </h2>
          <p className="text-xs text-[#B0ACB0]/80">
            Real-time financial metrics, tournament revenue logs, and player growth records
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-[#141215] p-1 rounded-xl border border-[#29252A]">
            {(['daily', 'weekly', 'monthly'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-3 py-1 text-[11px] font-bold uppercase rounded-lg transition ${
                  timeRange === r ? 'bg-amber-400 text-black shadow-md' : 'text-[#B0ACB0] hover:text-white'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1B181C] hover:bg-[#C9A34E] text-[#C9A34E] hover:text-black border border-[#C9A34E]/30 text-xs font-bold transition active:scale-95 shadow-md cursor-pointer"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-[#0D0B0D] border border-[#29252A]">
          <p className="text-[10px] text-[#B0ACB0] uppercase font-bold">Total Platform Net Profit</p>
          <p className="text-xl font-black text-[#C9A34E] mt-1">₹{(totalNetProfit ?? 0).toLocaleString('en-IN')}</p>
          <p className="text-[10px] text-[#B0ACB0]/80 font-semibold mt-0.5">Approved Deposits - Withdrawals</p>
        </div>

        <div className="p-4 rounded-2xl bg-[#0D0B0D] border border-[#29252A]">
          <p className="text-[10px] text-[#B0ACB0] uppercase font-bold">Active Match Registrations</p>
          <p className="text-xl font-black text-[#C9A34E] mt-1">{totalParticipants} Registrations</p>
          <p className="text-[10px] text-[#C9A34E]/80 font-semibold mt-0.5">{tournaments.length} Esports Matches</p>
        </div>

        <div className="p-4 rounded-2xl bg-[#0D0B0D] border border-[#29252A]">
          <p className="text-[10px] text-[#B0ACB0] uppercase font-bold">Successful Payout Rate</p>
          <p className="text-xl font-black text-[#F5F5F5] mt-1">{payoutRate}% Approved</p>
          <p className="text-[10px] text-[#B0ACB0]/80 font-semibold mt-0.5">{approvedWithdrawalRequests} Payouts Processed</p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Revenue Bar Chart */}
        <div className="p-4 rounded-2xl bg-[#0D0B0D] border border-[#29252A]">
          <h3 className="text-sm font-bold text-white mb-2">Revenue vs Tournament Fees</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#29252A" />
                <XAxis dataKey="day" stroke="#777278" fontSize={11} />
                <YAxis stroke="#777278" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#141215', borderColor: '#29252A', borderRadius: '12px', color: '#FFF' }} />
                <Bar dataKey="revenue" name="Revenue (₹)" fill="#C9A34E" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* User Growth Line Chart */}
        <div className="p-4 rounded-2xl bg-[#0D0B0D] border border-[#29252A]">
          <h3 className="text-sm font-bold text-white mb-2">Player Growth</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#29252A" />
                <XAxis dataKey="day" stroke="#777278" fontSize={11} />
                <YAxis stroke="#777278" fontSize={11} />
                <Tooltip contentStyle={{ backgroundColor: '#141215', borderColor: '#29252A', borderRadius: '12px', color: '#FFF' }} />
                <Line type="monotone" dataKey="users" name="Active Players" stroke="#E21B36" strokeWidth={3} dot={{ fill: '#E21B36' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

    </div>
  );
};

