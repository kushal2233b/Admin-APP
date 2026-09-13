import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../services/supabase';
import {
  Bell,
  Search,
  LogOut,
  ShieldAlert,
  Gamepad2,
  Menu,
  ChevronDown,
  Sparkles,
  Zap,
  Globe,
  RefreshCw
} from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  toggleMobileMenu: () => void;
  pendingCount: number;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastRefreshedText?: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  toggleMobileMenu,
  pendingCount,
  onRefresh,
  isRefreshing = false,
  lastRefreshedText = 'Just now'
}) => {
  const { currentUser, logout, isSuperAdmin } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? window.navigator.onLine : true);
  const [isDbOnline, setIsDbOnline] = useState(true);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const checkDbOnline = async () => {
      try {
        const { error } = await supabase.from('app_config').select('id').limit(1);
        setIsDbOnline(!error || error.code !== 'PGRST301');
      } catch (err) {
        setIsDbOnline(false);
      }
    };

    const handleOnline = () => {
      setIsOnline(true);
      checkDbOnline();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setIsDbOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Perform diagnostic check
    checkDbOnline();

    // Periodic check every 25 seconds
    const intervalId = setInterval(checkDbOnline, 25000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalId);
    };
  }, []);

  const getTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Dashboard';
      case 'users': return 'User Management';
      case 'tournaments': return 'Tournaments';
      case 'result-requests': return 'Result Requests Verification';
      case 'wallet': return 'Wallet & Payments';
      case 'banners': return 'Match Thumbnails';
      case 'reports': return 'Analytics & Reports';
      case 'support-management': return 'Support Management';
      case 'staff': return 'Staff Management';
      case 'settings': return 'System Settings';
      default: return 'WinX7 Admin';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-[#0D0B0D]/95 backdrop-blur-md border-b border-[#29252A] px-3 sm:px-4 py-1.5 transition-all" id="winx7-header">
      <div className="flex items-center justify-between gap-2 max-w-7xl mx-auto">
        {/* Left: Mobile menu toggle & Brand Title */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMobileMenu}
            className="md:hidden p-1.5 rounded-lg text-[#B0ACB0] hover:text-white bg-[#171418] hover:bg-[#141215] border border-[#29252A] transition cursor-pointer active:scale-95"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-4 h-4 text-[#C9A34E]" />
          </button>

          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-[#C9A34E] via-[#E21B36] to-[#4A0D16] p-[1px] shadow-sm">
              <div className="w-full h-full bg-[#080708] rounded-[6px] flex items-center justify-center">
                <Gamepad2 className="w-4 h-4 text-[#C9A34E]" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C9A34E] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#C9A34E] border border-[#0D0B0D]"></span>
              </span>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#C9A34E] via-white to-[#C9A34E]">
                  WinX7
                </span>
                <span className="px-1.5 py-[1px] text-[8px] font-black uppercase tracking-widest bg-[#350A12] text-[#FF3048] border border-[#E21B36]/20 rounded-full">
                  Admin
                </span>
              </div>
              <h1 className="text-[10px] text-[#777278] font-bold uppercase tracking-wider hidden sm:block mt-0.5">
                {getTitle()}
              </h1>
            </div>
          </div>
        </div>

        {/* Center: Quick Search Bar (Tablet/Desktop) */}
        <div className="hidden lg:flex items-center flex-1 max-w-xs mx-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-[#777278]" />
            <input
              type="text"
              placeholder="Search user, match ID, transaction..."
              onClick={() => setActiveTab('users')}
              className="w-full bg-[#171418] text-[#F5F5F5] text-xs pl-9 pr-3 py-2 rounded-lg border border-[#29252A] focus:border-[#C9A34E] focus:outline-none transition uppercase tracking-wider font-bold placeholder-[#777278]"
            />
          </div>
        </div>

        {/* Right: Actions, Pending Alert & User Dropdown */}
        <div className="flex items-center gap-2">
          {/* Quick Pending Deposit / Withdrawal Badge */}
          {pendingCount > 0 && (
            <button
              onClick={() => setActiveTab('wallet')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-[#350A12] to-[#141215] border border-[#E21B36]/30 text-[#FF3048] hover:bg-[#4A0D16]/50 transition text-[10px] font-black uppercase tracking-wider animate-pulse cursor-pointer active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 text-[#FF3048]" />
              <span>{pendingCount} Pending</span>
            </button>
          )}

          {/* Quick System Status Indicator */}
          {isOnline && isDbOnline ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#141215] border border-[#29252A] text-[#C9A34E] text-[10px] font-black uppercase tracking-wider">
              <Globe className="w-3 h-3 text-[#C9A34E]" />
              <span>Live Server</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#350A12] border border-[#E21B36]/30 text-[#FF3048] text-[10px] font-black uppercase tracking-wider animate-pulse">
              <Globe className="w-3 h-3 text-[#FF3048] animate-spin" />
              <span>Offline Cache</span>
            </div>
          )}

          {/* Manual Data Refresh Button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title={`Re-sync live data from server (${lastRefreshedText})`}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition text-[10px] font-black uppercase tracking-wider cursor-pointer active:scale-95 ${
                isRefreshing
                  ? 'bg-[#141215] text-[#777278] border-[#29252A] cursor-wait'
                  : 'bg-[#141215] hover:bg-[#1B181C] text-[#B0ACB0] hover:text-white border-[#29252A]'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#C9A34E] ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          )}

          {/* User Profile Menu */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 p-1 rounded-lg bg-[#141215] border border-[#29252A] hover:bg-[#1B181C] transition cursor-pointer active:scale-95"
            >
              <img
                src={currentUser?.avatarUrl || 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80'}
                alt="Avatar"
                className="w-7 h-7 rounded-md object-cover border border-[#C9A34E]/40"
              />
              <div className="hidden sm:block text-left pr-1">
                <p className="text-[10px] font-black text-[#F5F5F5] truncate max-w-[100px]">
                  {currentUser?.displayName || 'Admin'}
                </p>
                <p className="text-[9px] text-[#C9A34E] uppercase font-black tracking-wider">
                  {currentUser?.role || 'Admin'}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-[#777278]" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-[#1B181C] border border-[#29252A] rounded-lg shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-1">
                <div className="p-2 border-b border-[#29252A] mb-1">
                  <p className="text-xs font-black text-[#C9A34E] truncate">
                    {currentUser?.displayName}
                  </p>
                  <p className="text-[10px] text-[#B0ACB0] truncate">
                    {currentUser?.email}
                  </p>
                  <span className="inline-block mt-1.5 text-[8px] font-black px-2 py-0.5 bg-[#350A12] text-[#FF3048] border border-[#E21B36]/10 rounded uppercase tracking-widest">
                    Role: {currentUser?.role}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    setActiveTab('staff');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#B0ACB0] hover:bg-[#141215] hover:text-[#C9A34E] rounded transition text-left font-bold uppercase tracking-wider cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-[#777278]" />
                  <span>My Admin Profile</span>
                </button>

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    setActiveTab('settings');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#B0ACB0] hover:bg-[#141215] hover:text-[#C9A34E] rounded transition text-left font-bold uppercase tracking-wider cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#C9A34E]" />
                  <span>System Settings</span>
                </button>

                <div className="pt-1 mt-1 border-t border-[#29252A]">
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#FF3048] hover:bg-[#350A12] rounded transition text-left font-black uppercase tracking-widest cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
