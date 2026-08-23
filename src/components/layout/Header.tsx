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
      case 'wallet': return 'Wallet & Payments';
      case 'banners': return 'Match Thumbnails';
      case 'support': return 'Support Desk';
      case 'reports': return 'Analytics & Reports';
      case 'staff': return 'Staff & Access';
      case 'settings': return 'System Settings';
      default: return 'WinX7 Admin';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-[#120F24]/90 backdrop-blur-md border-b border-purple-900/40 px-3 sm:px-4 py-1.5 transition-all">
      <div className="flex items-center justify-between gap-2 max-w-7xl mx-auto">
        {/* Left: Mobile menu toggle & Brand Title */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMobileMenu}
            className="md:hidden p-1.5 rounded-xl text-purple-200 hover:text-white bg-purple-950/50 hover:bg-purple-900/60 border border-purple-800/30 transition active:scale-95"
            aria-label="Toggle navigation menu"
          >
            <Menu className="w-4 h-4 text-amber-400" />
          </button>

          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-br from-purple-600 via-indigo-600 to-amber-500 p-[1px] shadow-sm">
              <div className="w-full h-full bg-[#0F0D1A] rounded-[10px] flex items-center justify-center">
                <Gamepad2 className="w-4 h-4 text-amber-400 animate-pulse" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 border border-[#120F24]"></span>
              </span>
            </div>

            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-sm tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-purple-200 to-amber-400">
                  WinX7
                </span>
                <span className="px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                  Admin
                </span>
              </div>
              <h1 className="text-xs text-purple-300/80 font-medium hidden sm:block">
                {getTitle()}
              </h1>
            </div>
          </div>
        </div>

        {/* Center: Quick Search Bar (Tablet/Desktop) */}
        <div className="hidden lg:flex items-center flex-1 max-w-xs mx-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-purple-400" />
            <input
              type="text"
              placeholder="Search user, match ID, transaction..."
              onClick={() => setActiveTab('users')}
              className="w-full bg-[#181433] text-purple-100 text-xs pl-9 pr-3 py-2 rounded-xl border border-purple-800/40 focus:border-amber-400 focus:outline-none transition"
            />
          </div>
        </div>

        {/* Right: Actions, Pending Alert & User Dropdown */}
        <div className="flex items-center gap-2">
          {/* Quick Pending Deposit / Withdrawal Badge */}
          {pendingCount > 0 && (
            <button
              onClick={() => setActiveTab('wallet')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-purple-900/40 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition text-xs font-semibold animate-pulse active:scale-95"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>{pendingCount} Pending</span>
            </button>
          )}

          {/* Quick System Status Indicator */}
          {isOnline && isDbOnline ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/30 text-emerald-400 text-[11px] font-medium">
              <Globe className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span>Live Server</span>
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/40 border border-amber-800/30 text-amber-400 text-[11px] font-medium animate-pulse">
              <Globe className="w-3 h-3 text-amber-400 animate-spin" />
              <span>Offline Cache Mode</span>
            </div>
          )}

          {/* Manual Data Refresh Button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title={`Re-sync live data from server (${lastRefreshedText})`}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition text-xs font-bold active:scale-95 ${
                isRefreshing
                  ? 'bg-indigo-950/80 text-indigo-300 border-indigo-700/50 cursor-wait'
                  : 'bg-[#1A1638] hover:bg-purple-900/50 text-purple-200 hover:text-white border-purple-800/40'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{isRefreshing ? 'Refreshing...' : 'Refresh Data'}</span>
            </button>
          )}

          {/* User Profile Menu */}
          <div className="relative">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2 p-1.5 rounded-xl bg-[#1A1638] border border-purple-800/40 hover:bg-purple-900/40 transition active:scale-95"
            >
              <img
                src={currentUser?.avatarUrl || 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?w=150&auto=format&fit=crop&q=80'}
                alt="Avatar"
                className="w-7 h-7 rounded-lg object-cover ring-1 ring-amber-400/50"
              />
              <div className="hidden sm:block text-left pr-1">
                <p className="text-xs font-bold text-purple-100 truncate max-w-[100px]">
                  {currentUser?.displayName || 'Admin'}
                </p>
                <p className="text-[10px] text-amber-400 uppercase font-semibold">
                  {currentUser?.role || 'Admin'}
                </p>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-purple-400" />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-[#181433] border border-purple-700/50 rounded-2xl shadow-2xl p-2 z-50">
                <div className="p-2 border-b border-purple-800/40 mb-1">
                  <p className="text-xs font-bold text-amber-300 truncate">
                    {currentUser?.displayName}
                  </p>
                  <p className="text-[11px] text-purple-300 truncate">
                    {currentUser?.email}
                  </p>
                  <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full uppercase">
                    Role: {currentUser?.role}
                  </span>
                </div>

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    setActiveTab('staff');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-purple-200 hover:bg-purple-900/40 hover:text-amber-300 rounded-xl transition text-left"
                >
                  <ShieldAlert className="w-4 h-4 text-purple-400" />
                  <span>My Admin Profile</span>
                </button>

                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    setActiveTab('settings');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-purple-200 hover:bg-purple-900/40 hover:text-amber-300 rounded-xl transition text-left"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Database Settings</span>
                </button>

                <div className="pt-1 mt-1 border-t border-purple-800/40">
                  <button
                    onClick={() => {
                      setShowProfileMenu(false);
                      logout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-950/40 rounded-xl transition text-left font-semibold"
                  >
                    <LogOut className="w-4 h-4" />
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
