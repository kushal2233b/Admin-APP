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
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0D0B0D]/95 backdrop-blur-xl border-t border-[#29252A] px-2 py-1.5 shadow-2xl" id="winx7-bottomnav">
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
              className={`relative flex flex-col items-center justify-center py-1.5 px-1 text-[9px] rounded-lg transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-b from-[#4A0D16] to-[#350A12] text-[#C9A34E] font-black border border-[#C9A34E]/30 shadow-lg'
                  : 'text-[#B0ACB0] hover:text-[#F5F5F5]'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-4 h-4 transition-transform ${
                    isActive ? 'scale-110 text-[#C9A34E]' : 'text-[#777278]'
                  }`}
                />
                {item.badge && (
                  <span className="absolute -top-1.5 -right-2 bg-[#E21B36] text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-bounce shadow-md">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[9px] mt-1 font-bold tracking-wider uppercase truncate max-w-full">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
