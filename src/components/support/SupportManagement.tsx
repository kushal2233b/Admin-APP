import React, { useState } from 'react';
import { UserCheck, Tag, Headphones, Shield, Settings2 } from 'lucide-react';
import { AppUser } from '../../types';
import { SupportStaffManagement } from './SupportStaffManagement';
import { SupportCategoryManagement } from './SupportCategoryManagement';

interface SupportManagementProps {
  initialSubTab?: 'staff' | 'categories';
  users?: AppUser[];
}

export const SupportManagement: React.FC<SupportManagementProps> = ({
  initialSubTab = 'staff',
  users = []
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'staff' | 'categories'>(initialSubTab);

  return (
    <div className="space-y-6" id="winx7-support-management-main">
      {/* Top Support Management Sub-Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-[#29252A] pb-3">
        <div className="flex items-center gap-2 bg-[#141215] p-1 rounded-2xl border border-[#29252A]">
          <button
            onClick={() => setActiveSubTab('staff')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${
              activeSubTab === 'staff'
                ? 'bg-gradient-to-r from-[#C9A34E] to-[#B38F3F] text-[#0D0B0D] shadow-lg shadow-[#C9A34E]/20'
                : 'text-[#777278] hover:text-[#F5F5F5] hover:bg-[#1B181C]'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Support Staff</span>
          </button>

          <button
            onClick={() => setActiveSubTab('categories')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition ${
              activeSubTab === 'categories'
                ? 'bg-gradient-to-r from-[#C9A34E] to-[#B38F3F] text-[#0D0B0D] shadow-lg shadow-[#C9A34E]/20'
                : 'text-[#777278] hover:text-[#F5F5F5] hover:bg-[#1B181C]'
            }`}
          >
            <Tag className="w-4 h-4" />
            <span>Support Categories</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-[#777278]">
          <Headphones className="w-4 h-4 text-[#C9A34E]" />
          <span>Support Web App Backend Configuration</span>
        </div>
      </div>

      {/* Render Active Sub-Tab */}
      {activeSubTab === 'staff' ? (
        <SupportStaffManagement users={users} />
      ) : (
        <SupportCategoryManagement />
      )}
    </div>
  );
};
