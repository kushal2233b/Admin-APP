import React from 'react';
import {
  LayoutDashboard,
  Trophy,
  Users,
  Wallet,
  Menu,
  Zap
} from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  openMobileDrawer: () => void;
  pendingCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  openMobileDrawer,
  pendingCount
}) => {
  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'tournaments', label: 'Matches', icon: Trophy },
    { id: 'users', label: 'Users', icon: Users },
    {
      id: 'wallet',
      label: 'Wallet',
      icon: Wallet,
      badge: pendingCount > 0 ? pendingCount : null
    },
    { id: 'menu', label: 'Menu', icon: Menu, isMenu: true }
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#120F24]/95 backdrop-blur-xl border-t border-purple-900/50 px-2 py-1.5 shadow-2xl">
      <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.isMenu) {
                  openMobileDrawer();
                } else {
                  setActiveTab(item.id);
                }
              }}
              className={`relative flex flex-col items-center justify-center py-1 px-1 text-[9px] rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-gradient-to-b from-purple-900/80 to-purple-950 text-amber-300 font-bold border border-amber-500/30 shadow-lg shadow-purple-950'
                  : 'text-purple-300/80 hover:text-purple-100 hover:bg-purple-950/40'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-4 h-4 transition-transform ${
                    isActive ? 'scale-110 text-amber-400' : ''
                  }`}
                />
                {item.badge && (
                  <span className="absolute -top-1.5 -right-2 bg-gradient-to-r from-amber-500 to-amber-600 text-black text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce shadow-md">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[9px] mt-1 font-medium tracking-tight truncate max-w-full">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
