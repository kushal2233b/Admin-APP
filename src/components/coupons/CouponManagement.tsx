import React, { useState, useEffect } from 'react';
import { Coupon } from '../../types';
import {
  fetchCouponsFromSupabase,
  adminCreateCouponInSupabase,
  adminUpdateCouponInSupabase,
  adminDeleteCouponFromSupabase,
  handleCouponError
} from '../../services/supabaseService';
import {
  Ticket,
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Edit3,
  AlertCircle,
  Power,
  ShieldAlert,
  X,
  Calendar,
  Sparkles,
  Info
} from 'lucide-react';

interface CouponManagementProps {
  coupons?: Coupon[];
  onSaveCoupon?: (coupon: Coupon) => void;
  onDeleteCoupon?: (couponId: string) => void;
}

export const CouponManagement: React.FC<CouponManagementProps> = ({
  coupons: initialCoupons = [],
  onSaveCoupon,
  onDeleteCoupon
}) => {
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  // Confirmation Modal State
  const [deletingCoupon, setDeletingCoupon] = useState<Coupon | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [rewardAmount, setRewardAmount] = useState<number | ''>('');
  const [minDepositAmount, setMinDepositAmount] = useState<number | ''>('');
  const [maxUses, setMaxUses] = useState<number | ''>('');
  const [startsAt, setStartsAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Load coupons from admin_list_coupons RPC
  const loadCoupons = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchCouponsFromSupabase();
      setCoupons(data);
      setAuthError(false);
    } catch (err: any) {
      const msg = handleCouponError(err);
      setError(msg);
      if (msg.includes('not authorized')) {
        setAuthError(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCoupons();
  }, []);

  const toDatetimeLocal = (isoStr?: string | null) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '';
      const pad = (n: number) => (n < 10 ? '0' + n : n);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return '';
    }
  };

  const handleOpenCreate = () => {
    setEditingCoupon(null);
    setCode('');
    setDescription('');
    setRewardAmount(20);
    setMinDepositAmount(50);
    setMaxUses(100);
    setStartsAt(toDatetimeLocal(new Date().toISOString()));
    setExpiresAt('');
    setIsActive(true);
    setError(null);
    setShowModal(true);
  };

  const handleOpenEdit = (c: Coupon) => {
    setEditingCoupon(c);
    setCode(c.code);
    setDescription(c.description || '');
    setRewardAmount(c.rewardAmount || c.discountValue || 0);
    setMinDepositAmount(c.minDepositAmount ?? c.minDeposit ?? 0);
    setMaxUses(c.maxUses ?? c.usageLimit ?? '');
    setStartsAt(toDatetimeLocal(c.startsAt));
    setExpiresAt(toDatetimeLocal(c.expiresAt || c.expiryDate));
    setIsActive(c.isActive);
    setError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setSuccessMessage(null);

    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      setError('Coupon code is required.');
      return;
    }

    const numericReward = Number(rewardAmount);
    if (isNaN(numericReward) || numericReward <= 0) {
      setError('Reward amount must be greater than zero.');
      return;
    }

    const numericMinDeposit = Number(minDepositAmount);
    if (isNaN(numericMinDeposit) || numericMinDeposit < 0) {
      setError('Minimum lifetime deposit cannot be negative.');
      return;
    }

    let numericMaxUses: number | null = null;
    if (maxUses !== '' && maxUses !== null && maxUses !== undefined) {
      numericMaxUses = Number(maxUses);
      if (isNaN(numericMaxUses) || numericMaxUses <= 0) {
        setError('Maximum uses must be greater than zero.');
        return;
      }
    }

    let parsedStartsAt: string | null = null;
    if (startsAt) {
      parsedStartsAt = new Date(startsAt).toISOString();
    } else {
      parsedStartsAt = new Date().toISOString();
    }

    let parsedExpiresAt: string | null = null;
    if (expiresAt) {
      const expDate = new Date(expiresAt);
      const startDate = new Date(parsedStartsAt);
      if (expDate.getTime() <= startDate.getTime()) {
        setError('Expiry must be after the start time.');
        return;
      }
      parsedExpiresAt = expDate.toISOString();
    }

    setIsSubmitting(true);

    try {
      if (editingCoupon) {
        // Edit Coupon RPC
        const updated = await adminUpdateCouponInSupabase({
          couponId: editingCoupon.id,
          code: trimmedCode,
          description: description.trim(),
          rewardAmount: numericReward,
          minDepositAmount: numericMinDeposit,
          maxUses: numericMaxUses,
          startsAt: parsedStartsAt,
          expiresAt: parsedExpiresAt,
          isActive
        });

        if (onSaveCoupon) onSaveCoupon(updated);
        setSuccessMessage(`Coupon "${trimmedCode}" updated successfully.`);
      } else {
        // Create Coupon RPC
        const created = await adminCreateCouponInSupabase({
          code: trimmedCode,
          description: description.trim(),
          rewardAmount: numericReward,
          minDepositAmount: numericMinDeposit,
          maxUses: numericMaxUses,
          startsAt: parsedStartsAt,
          expiresAt: parsedExpiresAt
        });

        if (onSaveCoupon) onSaveCoupon(created);
        setSuccessMessage(`Coupon "${trimmedCode}" created successfully.`);
      }

      setShowModal(false);
      await loadCoupons();
    } catch (err: any) {
      const msg = handleCouponError(err);
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (c: Coupon) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    const newActiveState = !c.isActive;

    try {
      const updated = await adminUpdateCouponInSupabase({
        couponId: c.id,
        code: c.code,
        description: c.description || '',
        rewardAmount: c.rewardAmount || c.discountValue || 0,
        minDepositAmount: c.minDepositAmount ?? c.minDeposit ?? 0,
        maxUses: c.maxUses ?? c.usageLimit ?? null,
        startsAt: c.startsAt,
        expiresAt: c.expiresAt || c.expiryDate,
        isActive: newActiveState
      });

      if (onSaveCoupon) onSaveCoupon(updated);
      setSuccessMessage(`Coupon "${c.code}" ${newActiveState ? 'activated' : 'deactivated'}.`);
      await loadCoupons();
    } catch (err: any) {
      const msg = handleCouponError(err);
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingCoupon || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await adminDeleteCouponFromSupabase(deletingCoupon.id);
      if (onDeleteCoupon) onDeleteCoupon(deletingCoupon.id);
      setSuccessMessage(`Coupon "${deletingCoupon.code}" deleted successfully.`);
      setDeletingCoupon(null);
      await loadCoupons();
    } catch (err: any) {
      const msg = handleCouponError(err);
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCoupons = coupons.filter((c) => {
    if (!c) return false;
    const matchesSearch =
      (c.code || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.description || '').toLowerCase().includes(search.toLowerCase());
    if (filterStatus === 'active') return matchesSearch && c.isActive;
    if (filterStatus === 'inactive') return matchesSearch && !c.isActive;
    return matchesSearch;
  });

  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return 'No Expiry';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return 'No Expiry';
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'No Expiry';
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in pb-16 md:pb-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-purple-900/90 via-indigo-950/90 to-purple-950 border border-purple-800/50 shadow-2xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-400 text-black rounded-md flex items-center gap-1 shadow-sm">
              <Sparkles className="w-3 h-3" /> Promotions
            </span>
            <span className="text-xs text-purple-300 font-semibold">Secure Database RPC System</span>
          </div>
          <h2 className="text-xl font-black text-white mt-1.5 flex items-center gap-2">
            <Ticket className="w-6 h-6 text-amber-400" /> Coupon & Promo Code Manager
          </h2>
          <p className="text-xs text-purple-300/80 mt-0.5">
            Manage deposit promo codes, reward bonuses, and set minimum lifetime approved deposit limits
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={loadCoupons}
            disabled={isLoading || authError}
            className="p-2.5 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700/50 hover:border-amber-400/50 transition disabled:opacity-50"
            title="Refresh Coupon List"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
          </button>

          <button
            onClick={handleOpenCreate}
            disabled={authError}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-black font-extrabold text-xs hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/20 transition active:scale-95 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Create Coupon</span>
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {authError && (
        <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center gap-3 shadow-lg">
          <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0" />
          <div>
            <strong className="block font-bold text-rose-300">Authorization Error</strong>
            You are not authorized to manage coupons. Please contact a superadmin.
          </div>
        </div>
      )}

      {error && !authError && (
        <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs flex items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white text-xs">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-200 text-xs flex items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-white text-xs">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-purple-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search coupon code or description..."
            className="w-full pl-9 pr-4 py-2 bg-[#15112E] text-white text-xs rounded-xl border border-purple-800/40 focus:border-amber-400 focus:outline-none transition placeholder-purple-400/60"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center p-1 bg-[#15112E] rounded-xl border border-purple-800/40">
          {(['all', 'active', 'inactive'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg uppercase transition ${
                filterStatus === st
                  ? 'bg-purple-900 text-amber-300 border border-purple-700/60 shadow-sm'
                  : 'text-purple-300/80 hover:text-white'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Coupons Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading && coupons.length === 0 ? (
          <div className="col-span-full p-12 rounded-2xl bg-[#15112E] border border-purple-800/40 text-center text-purple-300 text-xs">
            <RefreshCw className="w-6 h-6 text-amber-400 animate-spin mx-auto mb-2" />
            Loading coupon database...
          </div>
        ) : filteredCoupons.length === 0 ? (
          <div className="col-span-full p-12 rounded-2xl bg-[#15112E] border border-purple-800/40 text-center text-purple-300 text-xs space-y-2">
            <Ticket className="w-10 h-10 text-purple-500/60 mx-auto" />
            <p className="font-bold text-white text-sm">No coupons found</p>
            <p className="text-purple-300/80 text-xs">
              {search ? 'Try adjusting your search query' : 'Click "Create Coupon" above to add your first promo code.'}
            </p>
          </div>
        ) : (
          filteredCoupons.map((c) => (
            <div
              key={c.id}
              className={`p-4.5 rounded-2xl bg-[#15112E] border transition flex flex-col justify-between space-y-4 shadow-xl ${
                c.isActive ? 'border-purple-800/60 hover:border-amber-400/60' : 'border-purple-950/80 opacity-70'
              }`}
            >
              <div className="space-y-3">
                {/* Header Row */}
                <div className="flex items-center justify-between pb-2.5 border-b border-purple-800/40 gap-2">
                  <span className="font-mono text-base font-black tracking-wider text-amber-300 bg-purple-950/80 px-3 py-1 rounded-xl border border-purple-800/60 shadow-inner">
                    {c.code}
                  </span>
                  <button
                    onClick={() => handleToggleActive(c)}
                    disabled={isSubmitting}
                    className={`px-2.5 py-1 text-[10px] font-extrabold rounded-lg uppercase border transition flex items-center gap-1 ${
                      c.isActive
                        ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800 hover:bg-emerald-900'
                        : 'bg-rose-950/80 text-rose-400 border-rose-800 hover:bg-rose-900'
                    }`}
                  >
                    <Power className="w-3 h-3" />
                    <span>{c.isActive ? 'Active' : 'Inactive'}</span>
                  </button>
                </div>

                {/* Description */}
                {c.description && (
                  <p className="text-xs text-purple-200/90 italic bg-purple-950/40 p-2 rounded-lg border border-purple-900/30">
                    "{c.description}"
                  </p>
                )}

                {/* Requirements & Rewards */}
                <div className="space-y-2 text-xs bg-[#1A1538]/60 p-3 rounded-xl border border-purple-800/30">
                  <div className="flex items-center justify-between">
                    <span className="text-purple-300 font-semibold">Reward Amount:</span>
                    <strong className="text-amber-300 font-black text-sm">₹{c.rewardAmount || c.discountValue || 0} Bonus</strong>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-purple-800/30">
                    <span className="text-purple-300 font-semibold flex items-center gap-1">
                      <Info className="w-3 h-3 text-purple-400" />
                      Eligible Deposit History:
                    </span>
                    <strong className="text-emerald-400 font-extrabold">₹{c.minDepositAmount ?? c.minDeposit ?? 0}+</strong>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-purple-800/30 text-[11px]">
                    <span className="text-purple-400">Usage Count:</span>
                    <strong className="text-purple-200">
                      {c.usedCount ?? c.timesUsed ?? 0} / {c.maxUses ?? c.usageLimit ? `${c.maxUses ?? c.usageLimit} uses` : 'Unlimited'}
                    </strong>
                  </div>
                </div>

                {/* Dates */}
                <div className="space-y-1 text-[10px] text-purple-300/80">
                  <div className="flex items-center justify-between">
                    <span>Starts:</span>
                    <span className="font-mono text-purple-200">{formatDate(c.startsAt)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Expires:</span>
                    <span className="font-mono text-purple-200">{formatDate(c.expiresAt || c.expiryDate)}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2.5 border-t border-purple-800/40">
                <button
                  onClick={() => handleOpenEdit(c)}
                  disabled={isSubmitting}
                  className="flex-1 py-1.5 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-purple-200 text-xs font-bold flex items-center justify-center gap-1.5 transition border border-purple-700/40"
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Edit</span>
                </button>

                <button
                  onClick={() => setDeletingCoupon(c)}
                  disabled={isSubmitting}
                  className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-400 border border-rose-800/40 transition"
                  title="Delete Coupon"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingCoupon && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-sm w-full bg-[#15112E] p-5 rounded-2xl border border-rose-800/60 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertCircle className="w-6 h-6 flex-shrink-0" />
              <h3 className="font-extrabold text-base text-white">Delete this coupon?</h3>
            </div>

            <p className="text-xs text-purple-200 leading-relaxed">
              Are you sure you want to delete coupon <strong className="text-amber-300 font-mono">{deletingCoupon.code}</strong>? This operation cannot be undone.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingCoupon(null)}
                disabled={isSubmitting}
                className="flex-1 py-2.5 bg-purple-950 hover:bg-purple-900 text-purple-300 text-xs font-bold rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isSubmitting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl transition shadow-lg shadow-rose-600/30 flex items-center justify-center gap-1"
              >
                {isSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Modal Form */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#15112E] p-5 rounded-2xl border border-purple-800/60 shadow-2xl space-y-4 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-purple-800/40">
              <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                <Ticket className="w-5 h-5 text-amber-400" />
                {editingCoupon ? 'Edit Coupon' : 'Create New Coupon'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                disabled={isSubmitting}
                className="text-purple-400 hover:text-white text-xs font-bold"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Code */}
              <div>
                <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                  Coupon Code <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. BONUS50, BONUS100"
                  className="w-full bg-[#1A1538] text-white text-xs px-3.5 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none uppercase font-mono font-bold tracking-wider"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. ₹20 bonus on ₹50+ deposit history"
                  className="w-full bg-[#1A1538] text-white text-xs px-3.5 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Reward & Min Deposit */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                    Reward Amount (₹) <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={rewardAmount !== '' ? rewardAmount : ''}
                    onChange={(e) => setRewardAmount(e.target.value !== '' ? Number(e.target.value) : '')}
                    placeholder="20"
                    className="w-full bg-[#1A1538] text-white text-xs px-3.5 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none font-bold text-amber-300"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                    Min. Lifetime Deposit (₹) <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={minDepositAmount !== '' ? minDepositAmount : ''}
                    onChange={(e) => setMinDepositAmount(e.target.value !== '' ? Number(e.target.value) : '')}
                    placeholder="50"
                    className="w-full bg-[#1A1538] text-white text-xs px-3.5 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none font-bold text-emerald-400"
                  />
                  <span className="text-[9px] text-purple-400 mt-0.5 block">Lifetime approved deposits requirement</span>
                </div>
              </div>

              {/* Max Uses */}
              <div>
                <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                  Maximum Uses (Optional)
                </label>
                <input
                  type="number"
                  min={1}
                  value={maxUses !== '' ? maxUses : ''}
                  onChange={(e) => setMaxUses(e.target.value !== '' ? Number(e.target.value) : '')}
                  placeholder="Leave empty for unlimited"
                  className="w-full bg-[#1A1538] text-white text-xs px-3.5 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
                />
              </div>

              {/* Start & Expiry */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                    Start Date/Time
                  </label>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full bg-[#1A1538] text-white text-xs px-3 py-2 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                    Expiry Date/Time
                  </label>
                  <input
                    type="datetime-local"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full bg-[#1A1538] text-white text-xs px-3 py-2 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Active Toggle */}
              {editingCoupon && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="editCouponActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
                  />
                  <label htmlFor="editCouponActive" className="text-xs text-white font-bold cursor-pointer">
                    Coupon is active
                  </label>
                </div>
              )}

              {/* Error in modal */}
              {error && (
                <div className="p-3 rounded-xl bg-rose-950/90 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-purple-950 hover:bg-purple-900 text-purple-300 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-black text-xs font-black rounded-xl transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingCoupon ? 'Update Coupon' : 'Create Coupon'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
