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
  UserCheck,
  Headphones
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
    { id: 'notifications', label: 'Custom Notifications', icon: Bell },
    { id: 'coupons', label: 'Coupons', icon: Ticket },
    { id: 'support-management', label: 'Support Management', icon: Headphones },
    { id: 'settings', label: 'Settings', icon: Settings },
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
          className="fixed inset-0 z-40 bg-black/90 backdrop-blur-sm md:hidden transition-opacity"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:sticky top-0 left-0 z-50 h-screen w-64 bg-[#0D0B0D] border-r border-[#29252A] flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        id="winx7-sidebar"
      >
        {/* Top Branding Section */}
        <div className="p-4 border-b border-[#29252A] flex items-center justify-between bg-gradient-to-r from-[#350A12]/30 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#C9A34E] via-[#E21B36] to-[#4A0D16] p-0.5 shadow-lg shadow-black">
              <div className="w-full h-full bg-[#0D0B0D] rounded-[10px] flex items-center justify-center">
                <Gamepad2 className="w-5 h-5 text-[#C9A34E]" />
              </div>
            </div>
            <div>
              <h2 className="font-extrabold text-lg tracking-wider text-white flex items-center gap-1">
                WIN<span className="text-[#C9A34E]">X7</span>
              </h2>
              <p className="text-[9px] uppercase tracking-widest text-[#777278] font-bold">
                Esports Admin Portal
              </p>
            </div>
          </div>

          <button
            onClick={closeSidebar}
            className="md:hidden p-1.5 rounded-lg text-[#777278] hover:text-white bg-[#171418] border border-[#29252A]"
            aria-label="Close sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Admin Profile Chip */}
        <div className="px-4 py-3 bg-[#141215] border-b border-[#29252A] flex items-center justify-between">
          <div className="flex items-center gap-2.5 truncate">
            <div className="w-8 h-8 rounded-full bg-[#171418] border border-[#C9A34E]/30 overflow-hidden flex-shrink-0">
              <img
                src={currentUser?.avatarUrl || 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80'}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="truncate">
              <p className="text-xs font-black text-[#F5F5F5] truncate">
                {currentUser?.displayName || 'Admin'}
              </p>
              <p className="text-[9px] text-[#C9A34E] font-black uppercase flex items-center gap-1 tracking-wider">
                <ShieldCheck className="w-3 h-3 text-[#C9A34E] inline" />
                {currentUser?.role}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Items List */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar">
          <p className="px-3 py-1 text-[9px] font-black uppercase tracking-widest text-[#777278]">
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
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg font-bold text-xs transition-all duration-200 group cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-[#4A0D16] to-[#350A12] text-[#C9A34E] border border-[#C9A34E]/30 shadow-md shadow-black'
                    : 'text-[#B0ACB0] hover:text-[#F5F5F5] hover:bg-[#141215]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                      isActive ? 'text-[#C9A34E]' : 'text-[#777278]'
                    }`}
                  />
                  <span className="tracking-wide">{item.label}</span>
                </div>

                {item.pendingBadge && item.pendingBadge > 0 ? (
                  <span className="px-2 py-0.5 text-[9px] font-black bg-gradient-to-r from-[#C9A34E] to-[#8C6A24] text-black rounded-full animate-pulse shadow">
                    {item.pendingBadge}
                  </span>
                ) : item.badge ? (
                  <span className="px-1.5 py-0.5 text-[8px] font-black bg-[#350A12] text-[#FF3048] border border-[#E21B36]/20 rounded uppercase tracking-wider">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {/* Footer Logout & Version */}
        <div className="p-3 border-t border-[#29252A] bg-[#0D0B0D]">
          <button
            onClick={() => {
              closeSidebar();
              logout();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-black text-[#FF3048] hover:text-white bg-[#350A12]/40 hover:bg-[#E21B36] border border-[#E21B36]/10 hover:border-transparent transition cursor-pointer active:scale-95 uppercase tracking-wider"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout Portal</span>
          </button>
          <div className="mt-2.5 text-center text-[9px] font-bold text-[#777278] tracking-wider uppercase">
            WinX7 Admin v2.5.0 • SECURE
          </div>
        </div>
      </aside>
    </>
  );
};
