import React, { useState } from 'react';
import { AdminUser, AdminRole } from '../../types';
import { UserCheck, Plus, ShieldCheck, Trash2, Edit3, CheckCircle2, X } from 'lucide-react';

interface StaffManagementProps {
  staffList: AdminUser[];
  onAddStaff: (staff: Omit<AdminUser, 'uid' | 'createdAt'> & { password?: string }) => Promise<void> | void;
  onUpdateStaffStatus: (uid: string, status: 'active' | 'inactive') => void;
  onDeleteStaff: (uid: string) => void;
}

export const StaffManagement: React.FC<StaffManagementProps> = ({
  staffList,
  onAddStaff,
  onUpdateStaffStatus,
  onDeleteStaff
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminRole>('staff');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!email || !displayName || !password) return;

    setIsSubmitting(true);
    try {
      await onAddStaff({
        email,
        displayName,
        role,
        status: 'active',
        permissions: role === 'superadmin' ? ['all'] : role === 'admin' ? ['tournaments', 'wallet', 'users', 'notifications'] : ['tournaments', 'matches'],
        password,
        avatarUrl: avatarUrl || undefined
      });

      setShowAddModal(false);
      setEmail('');
      setDisplayName('');
      setPassword('');
      setAvatarUrl('');
      setRole('staff');
      setFormError(null);
    } catch (err: any) {
      console.error('Error adding staff:', err);
      setFormError(err?.message || 'Failed to provision staff account');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in pb-16 md:pb-6">
      
      {/* Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[#15112E] border border-purple-800/40">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-amber-400" /> Staff & Access Permission Desk
          </h2>
          <p className="text-xs text-purple-300/80">
            Provision admin accounts, assign roles (Superadmin, Admin, Staff), and enforce access rules
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-extrabold text-xs shadow-lg transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Provision New Staff</span>
        </button>
      </div>

      {/* Staff List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(staffList || []).length === 0 ? (
          <div className="col-span-full p-8 rounded-2xl bg-[#15112E] border border-purple-800/40 text-center text-purple-300 text-xs">
            <UserCheck className="w-8 h-8 text-purple-400 mx-auto mb-2 opacity-60" />
            No additional staff accounts found. Click "Provision New Staff" to create staff records.
          </div>
        ) : (
          (staffList || []).map((st, idx) => {
            const itemUid = st.uid || st.id || `staff-${idx}`;
            return (
              <div
                key={itemUid}
                className="p-4 rounded-2xl bg-[#15112E] border border-purple-800/40 hover:border-purple-600 transition flex flex-col justify-between space-y-3"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={st.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                    alt={st.displayName || 'Staff'}
                    className="w-12 h-12 rounded-2xl object-cover ring-2 ring-purple-600/50"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-bold text-sm text-white truncate">{st.displayName || 'Staff Member'}</h3>
                      <span className="px-2 py-0.5 text-[9px] font-black uppercase rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {st.role || 'staff'}
                      </span>
                    </div>
                    <p className="text-xs text-purple-300/80 truncate mt-0.5">{st.email || 'No email'}</p>
                    <p className="text-[10px] text-purple-400 font-mono mt-0.5">UID: {itemUid}</p>
                  </div>
                </div>

                <div className="pt-3 border-t border-purple-800/40 flex items-center justify-between">
                  <button
                    onClick={() => onUpdateStaffStatus(itemUid, st.status === 'active' ? 'inactive' : 'active')}
                    className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded-lg border transition ${
                      st.status === 'active'
                        ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                        : 'bg-rose-950/80 text-rose-400 border-rose-800'
                    }`}
                  >
                    Status: {st.status || 'active'}
                  </button>

                  <button
                    onClick={() => onDeleteStaff(itemUid)}
                    className="p-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-400 border border-rose-800/40 transition"
                    title="Remove Staff"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md bg-[#130F29] border border-purple-800/80 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-purple-800/50">
              <h3 className="text-base font-black text-amber-300 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-amber-400" /> Add Staff Account
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-xl bg-purple-900/40 text-purple-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs font-bold">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                  Full Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Aarav Tournament Staff"
                  className="w-full bg-[#1A1538] text-white text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@winx7.gg"
                  className="w-full bg-[#1A1538] text-white text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                  Login Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full bg-[#1A1538] text-white text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none focus:border-amber-400"
                />
                <p className="text-[10px] text-purple-400/80 mt-1">
                  The staff or admin member will use this email & password to log in.
                </p>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-purple-300 mb-1">
                  Account Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as AdminRole)}
                  className="w-full bg-[#1A1538] text-white text-xs p-2.5 rounded-xl border border-purple-800/50 focus:outline-none focus:border-amber-400"
                >
                  <option value="staff">Tournament Staff (ONLY Matches Management)</option>
                  <option value="admin">Admin (Tournaments, Wallet & Users)</option>
                  <option value="superadmin">Superadmin (Full Control & Staff Provisioning)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-purple-800/50">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 rounded-xl bg-purple-950 text-purple-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-black text-xs font-black transition flex items-center gap-1.5"
                >
                  {isSubmitting ? 'Provisioning...' : 'Provision Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
