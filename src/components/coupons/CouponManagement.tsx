import React, { useState } from 'react';
import { Coupon } from '../../types';
import { Ticket, Plus, Trash2, CheckCircle, Clock, Percent, DollarSign, Calendar, Search, Edit2 } from 'lucide-react';

interface CouponManagementProps {
  coupons: Coupon[];
  onSaveCoupon: (coupon: Coupon) => void;
  onDeleteCoupon: (couponId: string) => void;
}

export const CouponManagement: React.FC<CouponManagementProps> = ({
  coupons,
  onSaveCoupon,
  onDeleteCoupon
}) => {
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  // Form State
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('fixed');
  const [discountValue, setDiscountValue] = useState<number | ''>('');
  const [minDeposit, setMinDeposit] = useState<number | ''>('');
  const [usageLimit, setUsageLimit] = useState<number | ''>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [isActive, setIsActive] = useState<boolean>(true);

  const handleOpenCreate = () => {
    setEditingCoupon(null);
    setCode('');
    setDiscountType('fixed');
    setDiscountValue(50);
    setMinDeposit(100);
    setUsageLimit(500);
    setExpiryDate('2026-12-31');
    setIsActive(true);
    setShowModal(true);
  };

  const handleOpenEdit = (c: Coupon) => {
    setEditingCoupon(c);
    setCode(c.code);
    setDiscountType(c.discountType);
    setDiscountValue(c.discountValue);
    setMinDeposit(c.minDeposit);
    setUsageLimit(c.usageLimit);
    setExpiryDate(c.expiryDate ? c.expiryDate.split('T')[0] : '2026-12-31');
    setIsActive(c.isActive);
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) return;

    const isDuplicate = (coupons || []).some(
      (c) => c && c.code && c.code.toUpperCase() === trimmedCode && (!editingCoupon || c.id !== editingCoupon.id)
    );
    if (isDuplicate) {
      alert(`A coupon with code "${trimmedCode}" already exists. Please choose a different code.`);
      return;
    }

    const couponData: Coupon = {
      id: editingCoupon ? editingCoupon.id : `cpn-${Date.now()}`,
      code: code.trim().toUpperCase(),
      discountType,
      discountValue: Number(discountValue),
      minDeposit: Number(minDeposit),
      usageLimit: Number(usageLimit),
      timesUsed: editingCoupon ? editingCoupon.timesUsed : 0,
      expiryDate,
      isActive,
      createdAt: editingCoupon ? editingCoupon.createdAt : new Date().toISOString()
    };

    onSaveCoupon(couponData);
    setShowModal(false);
  };

  const handleToggleActive = (c: Coupon) => {
    onSaveCoupon({
      ...c,
      isActive: !c.isActive
    });
  };

  const filteredCoupons = (coupons || []).filter((c) =>
    c && (c.code || '').toLowerCase().includes((search || '').toLowerCase())
  );

  return (
    <div className="space-y-5 animate-in fade-in pb-16 md:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-gradient-to-r from-purple-900/80 via-indigo-950/80 to-purple-950 border border-purple-800/50 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-400 text-black rounded-md">
              Promotions
            </span>
            <span className="text-xs text-purple-300 font-semibold">Deposit Coupon Codes</span>
          </div>
          <h2 className="text-lg font-black text-white mt-1 flex items-center gap-2">
            <Ticket className="w-5 h-5 text-amber-400" /> Coupon & Promo Code Manager
          </h2>
          <p className="text-xs text-purple-300/80">
            Create deposit bonus codes, discount vouchers, and track redemption limits
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-black font-extrabold text-xs hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/20 transition active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Create Coupon</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-purple-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search coupon code (e.g. WELCOME100)..."
            className="w-full pl-9 pr-4 py-2 bg-[#15112E] text-white text-xs rounded-xl border border-purple-800/40 focus:border-amber-400 focus:outline-none transition"
          />
        </div>
      </div>

      {/* Coupons Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCoupons.length === 0 ? (
          <div className="col-span-full p-8 rounded-2xl bg-[#15112E] border border-purple-800/40 text-center text-purple-300 text-xs">
            <Ticket className="w-8 h-8 text-purple-400 mx-auto mb-2 opacity-60" />
            No coupons created yet. Click "Create Coupon" to add your first promo code.
          </div>
        ) : (
          filteredCoupons.map((c) => (
            <div
              key={c.id}
              className={`p-4 rounded-2xl bg-[#15112E] border transition flex flex-col justify-between space-y-3 ${
                c.isActive ? 'border-purple-800/50 hover:border-amber-400/60' : 'border-purple-950 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-purple-800/40">
                  <span className="font-mono text-base font-black tracking-wider text-amber-300 bg-purple-950 px-2.5 py-1 rounded-lg border border-purple-800/60">
                    {c.code}
                  </span>
                  <button
                    onClick={() => handleToggleActive(c)}
                    className={`px-2.5 py-0.5 text-[10px] font-bold rounded-md uppercase border transition ${
                      c.isActive
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                        : 'bg-rose-950 text-rose-400 border-rose-800'
                    }`}
                  >
                    {c.isActive ? 'Active' : 'Disabled'}
                  </button>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-purple-200">
                  <p className="flex items-center justify-between">
                    <span className="text-purple-400">Reward:</span>
                    <strong className="text-white">
                      {c.discountType === 'percentage' ? `${c.discountValue}% Bonus` : `₹${c.discountValue} Extra Cash`}
                    </strong>
                  </p>

                  <p className="flex items-center justify-between">
                    <span className="text-purple-400">Min. Deposit:</span>
                    <strong className="text-white">₹{c.minDeposit}</strong>
                  </p>

                  <p className="flex items-center justify-between">
                    <span className="text-purple-400">Usage Progress:</span>
                    <strong className="text-amber-300">{c.timesUsed} / {c.usageLimit} uses</strong>
                  </p>

                  <p className="flex items-center justify-between text-[11px]">
                    <span className="text-purple-400">Expires:</span>
                    <span className="text-purple-300 flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3 text-purple-400" />
                      {c.expiryDate}
                    </span>
                  </p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center gap-2 pt-2 border-t border-purple-800/40">
                <button
                  onClick={() => handleOpenEdit(c)}
                  className="flex-1 py-1.5 rounded-xl bg-purple-900/60 hover:bg-purple-800 text-purple-200 text-xs font-bold flex items-center justify-center gap-1 transition"
                >
                  <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Edit</span>
                </button>

                <button
                  onClick={() => onDeleteCoupon(c.id)}
                  className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-rose-400 transition"
                  title="Delete Coupon"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Form */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#15112E] p-5 rounded-2xl border border-purple-800/60 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-purple-800/40">
              <h3 className="font-extrabold text-base text-white flex items-center gap-2">
                <Ticket className="w-5 h-5 text-amber-400" />
                {editingCoupon ? 'Edit Coupon Code' : 'Create New Coupon'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-purple-400 hover:text-white text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                  Coupon Code
                </label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="e.g. WELCOME100, WINX7BONUS"
                  className="w-full bg-[#1A1538] text-white text-xs px-3 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none uppercase font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                    Bonus Type
                  </label>
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as any)}
                    className="w-full bg-[#1A1538] text-white text-xs px-3 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
                  >
                    <option value="fixed">Fixed Cash Bonus (₹)</option>
                    <option value="percentage">Percentage Bonus (%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                    Value ({discountType === 'fixed' ? '₹' : '%'})
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={discountValue !== "" && !isNaN(Number(discountValue)) ? discountValue : ""}
                    onChange={(e) => setDiscountValue(e.target.value && !isNaN(Number(e.target.value)) ? Number(e.target.value) : "")}
                    className="w-full bg-[#1A1538] text-white text-xs px-3 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                    Min. Deposit Amount (₹)
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={minDeposit !== "" && !isNaN(Number(minDeposit)) ? minDeposit : ""}
                    onChange={(e) => setMinDeposit(e.target.value && !isNaN(Number(e.target.value)) ? Number(e.target.value) : "")}
                    className="w-full bg-[#1A1538] text-white text-xs px-3 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                    Max Usage Limit
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={usageLimit !== "" && !isNaN(Number(usageLimit)) ? usageLimit : ""}
                    onChange={(e) => setUsageLimit(e.target.value && !isNaN(Number(e.target.value)) ? Number(e.target.value) : "")}
                    className="w-full bg-[#1A1538] text-white text-xs px-3 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-purple-300 uppercase mb-1">
                  Expiry Date
                </label>
                <input
                  type="date"
                  required
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full bg-[#1A1538] text-white text-xs px-3 py-2.5 rounded-xl border border-purple-800/50 focus:border-amber-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="couponActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 accent-amber-400"
                />
                <label htmlFor="couponActive" className="text-xs text-white font-bold cursor-pointer">
                  Enable coupon code immediately
                </label>
              </div>

              <div className="flex items-center gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 bg-purple-950 hover:bg-purple-900 text-purple-300 text-xs font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 text-black text-xs font-black rounded-xl transition shadow-lg shadow-amber-500/20"
                >
                  Save Coupon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
