import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  Trophy,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  Bell,
  Image,
  Ticket,
  Settings,
  LogOut,
  X,
  ShieldCheck,
  Gamepad2,
  Headphones,
  UserCheck
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  closeSidebar: () => void;
  pendingDepositsCount?: number;
  pendingWithdrawalsCount?: number;
  pendingResultRequestsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpen,
  closeSidebar,
  pendingDepositsCount = 0,
  pendingWithdrawalsCount = 0,
  pendingResultRequestsCount = 0
}) => {
  const { logout, currentUser, isSuperAdmin } = useAuth();

  const isStaff = currentUser?.role === 'staff';

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'matches', label: 'Matches', icon: Gamepad2, badge: 'Live' },
    { id: 'result-requests', label: 'Result Requests', icon: Trophy, pendingBadge: pendingResultRequestsCount },
    { id: 'saved-images', label: 'Saved Images', icon: Image },
    { id: 'deposits', label: 'Deposits', icon: ArrowDownCircle, pendingBadge: pendingDepositsCount },
    { id: 'withdrawals', label: 'Withdrawals', icon: ArrowUpCircle, pendingBadge: pendingWithdrawalsCount },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'coupons', label: 'Coupons', icon: Ticket },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'support', label: 'Support Desk', icon: Headphones },
    { id: 'staff', label: 'Staff Management', icon: UserCheck, superadminOnly: true }
  ];

  const handleSelect = (id: string) => {
    setActiveTab(id);
    closeSidebar();
  };

  return (
    <>
      {/* Mobile Drawer Overlay Background */}
      {isOpen && (
        <div
          onClick={closeSidebar}
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm md:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen w-64 bg-[#0F0D1A] border-r border-purple-900/40 flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top Branding Section */}
        <div className="p-4 border-b border-purple-900/40 flex items-center justify-between bg-gradient-to-r from-purple-950/60 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 via-purple-600 to-indigo-600 p-0.5 shadow-lg shadow-purple-950">
              <div className="w-full h-full bg-[#0F0D1A] rounded-[14px] flex items-center justify-center">
                <Gamepad2 className="w-6 h-6 text-amber-400" />
              </div>
            </div>
            <div>
              <h2 className="font-extrabold text-lg tracking-tight text-white flex items-center gap-1">
                WIN<span className="text-amber-400">X7</span>
              </h2>
              <p className="text-[10px] uppercase tracking-wider text-purple-400 font-semibold">
                Esports Admin Portal
              </p>
            </div>
          </div>

          <button
            onClick={closeSidebar}
            className="md:hidden p-1.5 rounded-lg text-purple-400 hover:text-white bg-purple-950/60"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Admin Profile Chip */}
        <div className="px-4 py-3 bg-[#141029] border-b border-purple-900/30 flex items-center justify-between">
          <div className="flex items-center gap-2.5 truncate">
            <div className="w-8 h-8 rounded-full bg-purple-900 border border-amber-400/40 overflow-hidden flex-shrink-0">
              <img
                src={currentUser?.avatarUrl || 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80'}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-purple-100 truncate">
                {currentUser?.displayName || 'Admin'}
              </p>
              <p className="text-[10px] text-amber-400 font-semibold uppercase flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-amber-400 inline" />
                {currentUser?.role}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Items List */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-purple-400/70">
            Main Management
          </p>

          {navItems.map((item) => {
            if (item.superadminOnly && !isSuperAdmin) return null;
            if (isStaff && item.id !== 'matches') return null;

            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-xs transition-all duration-200 group ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-900/90 via-purple-800/60 to-indigo-900/80 text-amber-300 font-bold border border-amber-500/40 shadow-lg shadow-purple-950/80'
                    : 'text-purple-300/80 hover:text-purple-100 hover:bg-purple-900/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                      isActive ? 'text-amber-400' : 'text-purple-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.pendingBadge && item.pendingBadge > 0 ? (
                  <span className="px-2 py-0.5 text-[10px] font-black bg-gradient-to-r from-amber-500 to-amber-600 text-black rounded-full animate-pulse shadow-md">
                    {item.pendingBadge}
                  </span>
                ) : item.badge ? (
                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-purple-950 text-amber-400 border border-purple-800/40 rounded">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Footer Logout & Version */}
        <div className="p-3 border-t border-purple-900/40 bg-[#120F24]">
          <button
            onClick={() => {
              closeSidebar();
              logout();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:text-rose-100 bg-rose-950/30 hover:bg-rose-900/50 border border-rose-900/40 transition active:scale-95"
          >
            <LogOut className="w-4 h-4 text-rose-400" />
            <span>Logout Portal</span>
          </button>
          <div className="mt-2 text-center text-[10px] text-purple-400/60">
            WinX7 Admin v2.5.0 • Live Gaming Platform
          </div>
        </div>
      </aside>
    </>
  );
};
