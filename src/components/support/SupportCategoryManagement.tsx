import React, { useState, useEffect, useMemo } from 'react';
import {
  Tag,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  X,
  PowerOff,
  Power,
  Layers,
  FileText,
  AlertCircle,
  HelpCircle,
  FolderPlus
} from 'lucide-react';
import { SupportCategoryItem } from '../../types';
import {
  fetchSupportCategoriesFromSupabase,
  createSupportCategoryInSupabase,
  updateSupportCategoryInSupabase,
  deleteSupportCategoryInSupabase,
  subscribeToSupportCategories
} from '../../services/supabaseService';

export const SupportCategoryManagement: React.FC = () => {
  const [categories, setCategories] = useState<SupportCategoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED'>('ALL');

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<SupportCategoryItem | null>(null);
  const [categoryName, setCategoryName] = useState<string>('');
  const [categoryDescription, setCategoryDescription] = useState<string>('');
  const [categoryIsActive, setCategoryIsActive] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete / Safe Disable Warning State
  const [deletingCategory, setDeletingCategory] = useState<SupportCategoryItem | null>(null);
  const [isReferencedWarning, setIsReferencedWarning] = useState<boolean>(false);
  const [referencedMessage, setReferencedMessage] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Toast
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadCategories = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const data = await fetchSupportCategoriesFromSupabase();
      setCategories(data);
    } catch (err: any) {
      console.error('[Support Categories Load Error]:', err);
      showToast('Failed to load support categories', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadCategories();
    const unsubscribe = subscribeToSupportCategories((updatedList) => {
      if (Array.isArray(updatedList) && updatedList.length > 0) {
        setCategories(updatedList);
      }
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      const matchesSearch =
        cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (cat.description && cat.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && cat.isActive) ||
        (statusFilter === 'DISABLED' && !cat.isActive);

      return matchesSearch && matchesStatus;
    });
  }, [categories, searchQuery, statusFilter]);

  const handleOpenCreateModal = () => {
    setEditingCategory(null);
    setCategoryName('');
    setCategoryDescription('');
    setCategoryIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cat: SupportCategoryItem) => {
    setEditingCategory(cat);
    setCategoryName(cat.name);
    setCategoryDescription(cat.description || '');
    setCategoryIsActive(cat.isActive);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = categoryName.trim();
    if (!cleanName) {
      setFormError('Category name is required.');
      return;
    }

    // Duplicate check
    const duplicate = categories.find(
      (c) =>
        c.name.toLowerCase().trim() === cleanName.toLowerCase() &&
        (!editingCategory || c.id !== editingCategory.id)
    );
    if (duplicate) {
      setFormError(`A category named "${cleanName}" already exists.`);
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      if (editingCategory) {
        // Update
        const res = await updateSupportCategoryInSupabase(editingCategory.id, {
          name: cleanName,
          description: categoryDescription.trim(),
          isActive: categoryIsActive
        });

        if (res.success) {
          showToast(`Category "${cleanName}" updated successfully!`, 'success');
          setIsModalOpen(false);
          await loadCategories(true);
        } else {
          setFormError(res.message || 'Failed to update category.');
        }
      } else {
        // Create
        const res = await createSupportCategoryInSupabase({
          name: cleanName,
          description: categoryDescription.trim(),
          isActive: categoryIsActive,
          displayOrder: categories.length + 1
        });

        if (res.success) {
          showToast(`Category "${cleanName}" created successfully!`, 'success');
          setIsModalOpen(false);
          await loadCategories(true);
        } else {
          setFormError(res.message || 'Failed to create category.');
        }
      }
    } catch (err: any) {
      setFormError(err?.message || 'Error occurred while saving category.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick toggle Active/Disabled
  const handleToggleCategoryStatus = async (cat: SupportCategoryItem) => {
    try {
      const nextState = !cat.isActive;
      const res = await updateSupportCategoryInSupabase(cat.id, {
        isActive: nextState
      });

      if (res.success) {
        showToast(
          `Category "${cat.name}" is now ${nextState ? 'ACTIVE' : 'DISABLED'}.`,
          'success'
        );
        await loadCategories(true);
      } else {
        showToast(res.message || 'Failed to toggle category state.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error toggling status', 'error');
    }
  };

  // Delete with safety check
  const handleDeleteCategoryClick = (cat: SupportCategoryItem) => {
    setDeletingCategory(cat);
    setIsReferencedWarning(false);
    setReferencedMessage('');
  };

  const handleExecuteDelete = async () => {
    if (!deletingCategory) return;
    setIsDeleting(true);

    try {
      const res = await deleteSupportCategoryInSupabase(deletingCategory.id);
      if (res.success) {
        showToast(`Category "${deletingCategory.name}" deleted successfully.`, 'success');
        setDeletingCategory(null);
        await loadCategories(true);
      } else if (res.isReferenced) {
        // Category is referenced by existing support conversations
        setIsReferencedWarning(true);
        setReferencedMessage(res.message || 'Category is referenced by existing support data.');
      } else {
        showToast(res.message || 'Failed to delete category.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error deleting category', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDisableInsteadOfDelete = async () => {
    if (!deletingCategory) return;
    setIsDeleting(true);
    try {
      const res = await updateSupportCategoryInSupabase(deletingCategory.id, { isActive: false });
      if (res.success) {
        showToast(`Category "${deletingCategory.name}" disabled safely to preserve historical records.`, 'success');
        setDeletingCategory(null);
        setIsReferencedWarning(false);
        await loadCategories(true);
      } else {
        showToast(res.message || 'Failed to disable category.', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error disabling category', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6" id="winx7-support-category-management">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-xs font-bold transition-all animate-in fade-in slide-in-from-top-4 ${
            toastMessage.type === 'success'
              ? 'bg-[#151216] border-[#C9A34E] text-[#C9A34E]'
              : 'bg-[#2A0808] border-[#E21B36] text-[#FF9B9B]'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#C9A34E] shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-[#E21B36] shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header & Overview Card */}
      <div className="bg-[#141215] border border-[#29252A] rounded-2xl p-5 sm:p-6 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#C9A34E]/20 to-[#E21B36]/20 border border-[#C9A34E]/30 flex items-center justify-center text-[#C9A34E] shrink-0 shadow-inner">
            <Tag className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-[#F5F5F5] uppercase tracking-wide">
                Support Categories
              </h2>
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-[#350A12] text-[#C9A34E] rounded-md border border-[#C9A34E]/30">
                Shared Backend
              </span>
            </div>
            <p className="text-xs text-[#B0ACB0] mt-0.5">
              Manage the dynamic support categories available to players in the User App and support agents in the Support Web App.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadCategories(true)}
            disabled={refreshing || loading}
            className="p-2.5 rounded-xl bg-[#1B181C] hover:bg-[#252126] border border-[#29252A] text-[#B0ACB0] hover:text-[#F5F5F5] transition disabled:opacity-50"
            title="Refresh Categories"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#C9A34E]' : ''}`} />
          </button>
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#C9A34E] to-[#B38F3F] text-[#0D0B0D] font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-[#C9A34E]/20 hover:brightness-110 active:scale-95 transition"
          >
            <Plus className="w-4 h-4" />
            <span>+ Create Category</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#141215] border border-[#29252A] p-3 rounded-2xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#777278] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories by name or description..."
            className="w-full bg-[#1B181C] text-[#F5F5F5] text-xs pl-10 pr-4 py-2.5 rounded-xl border border-[#29252A] placeholder-[#777278] focus:outline-none focus:border-[#C9A34E]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777278] hover:text-[#F5F5F5]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 bg-[#1B181C] p-1 rounded-xl border border-[#29252A]">
          {(['ALL', 'ACTIVE', 'DISABLED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${
                statusFilter === st
                  ? 'bg-[#C9A34E] text-[#0D0B0D] shadow-md'
                  : 'text-[#777278] hover:text-[#F5F5F5]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Categories Grid / List */}
      <div className="bg-[#141215] border border-[#29252A] rounded-2xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="py-16 text-center text-[#777278] space-y-3">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#C9A34E]" />
            <p className="text-xs uppercase font-extrabold tracking-wider">Loading Support Categories...</p>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="py-16 text-center text-[#777278] space-y-3">
            <Tag className="w-10 h-10 mx-auto text-[#29252A]" />
            <p className="text-sm font-bold text-[#F5F5F5]">No Support Categories Found</p>
            <p className="text-xs text-[#777278] max-w-sm mx-auto">
              {searchQuery
                ? 'No categories match your search filters.'
                : 'Click "+ Create Category" above to add dynamic support categories.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#29252A]">
            {filteredCategories.map((cat) => (
              <div
                key={cat.id}
                className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[#181519] transition"
              >
                {/* Category Info */}
                <div className="space-y-1.5 max-w-xl">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-extrabold text-sm sm:text-base text-[#F5F5F5]">{cat.name}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                        cat.isActive
                          ? 'bg-emerald-950/50 text-emerald-400 border-emerald-500/30'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                      }`}
                    >
                      {cat.isActive ? 'ACTIVE' : 'DISABLED'}
                    </span>
                  </div>

                  {cat.description ? (
                    <p className="text-xs text-[#B0ACB0] leading-relaxed">{cat.description}</p>
                  ) : (
                    <p className="text-xs text-[#777278] italic">No description provided</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end md:self-center">
                  <button
                    onClick={() => handleToggleCategoryStatus(cat)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                      cat.isActive
                        ? 'bg-[#1B181C] hover:bg-[#252126] border-[#29252A] text-[#B0ACB0] hover:text-[#F5F5F5]'
                        : 'bg-emerald-950/40 hover:bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                    }`}
                    title={cat.isActive ? 'Disable Category' : 'Enable Category'}
                  >
                    {cat.isActive ? (
                      <>
                        <PowerOff className="w-3.5 h-3.5 text-[#777278]" />
                        <span>Disable</span>
                      </>
                    ) : (
                      <>
                        <Power className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Enable</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleOpenEditModal(cat)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1B181C] hover:bg-[#252126] border border-[#29252A] text-[#B0ACB0] hover:text-[#F5F5F5] text-xs font-bold transition"
                    title="Edit Category"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => handleDeleteCategoryClick(cat)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1B181C] hover:bg-[#2A0808] border border-[#29252A] hover:border-[#E21B36]/50 text-[#777278] hover:text-[#E21B36] text-xs font-bold transition"
                    title="Delete Category"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE OR EDIT CATEGORY */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#141215] border border-[#29252A] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 sm:p-5 border-b border-[#29252A] flex items-center justify-between bg-gradient-to-r from-[#350A12]/40 to-transparent">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#1B181C] border border-[#29252A] flex items-center justify-center text-[#C9A34E]">
                  {editingCategory ? <Edit2 className="w-4 h-4" /> : <FolderPlus className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="font-black text-sm uppercase text-[#F5F5F5]">
                    {editingCategory ? 'Edit Category' : 'Create Category'}
                  </h3>
                  <p className="text-[10px] text-[#777278]">Support request categorization</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#777278] hover:text-[#F5F5F5] p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-[#2A0808] border border-[#E21B36]/50 text-[#FF9B9B] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-[#E21B36]" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#B0ACB0] mb-1.5">
                  Category Name <span className="text-[#E21B36]">*</span>
                </label>
                <input
                  type="text"
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  placeholder="e.g. Deposit, Withdrawal, Tournament / Match..."
                  className="w-full bg-[#171418] text-[#F5F5F5] text-xs p-3 rounded-xl border border-[#29252A] placeholder-[#777278] focus:outline-none focus:border-[#C9A34E]"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#B0ACB0] mb-1.5">
                  Category Description (Optional)
                </label>
                <textarea
                  rows={3}
                  value={categoryDescription}
                  onChange={(e) => setCategoryDescription(e.target.value)}
                  placeholder="Explain what player inquiries fall under this category..."
                  className="w-full bg-[#171418] text-[#F5F5F5] text-xs p-3 rounded-xl border border-[#29252A] placeholder-[#777278] focus:outline-none focus:border-[#C9A34E] leading-relaxed custom-scrollbar"
                />
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#1B181C] border border-[#29252A]">
                <div>
                  <p className="text-xs font-bold text-[#F5F5F5]">Active / Enabled</p>
                  <p className="text-[10px] text-[#777278]">Enabled categories are visible to users in live support</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCategoryIsActive(!categoryIsActive)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${
                    categoryIsActive ? 'bg-[#C9A34E]' : 'bg-[#29252A]'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-[#0D0B0D] absolute top-1 transition-transform ${
                      categoryIsActive ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#29252A]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-[#1B181C] text-[#B0ACB0] text-xs font-bold hover:text-[#F5F5F5]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-[#C9A34E] to-[#B38F3F] text-[#0D0B0D] text-xs font-black uppercase tracking-wider shadow-lg shadow-[#C9A34E]/20 hover:brightness-110 active:scale-95 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{editingCategory ? 'Update Category' : 'Create Category'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DELETE CONFIRMATION & SAFETY CHECK */}
      {/* ========================================================================= */}
      {deletingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#141215] border border-[#29252A] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  isReferencedWarning
                    ? 'bg-amber-950/40 border-amber-500/40 text-amber-400'
                    : 'bg-red-950/40 border-red-500/40 text-red-400'
                }`}
              >
                {isReferencedWarning ? <AlertTriangle className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-black text-[#F5F5F5] uppercase">
                  {isReferencedWarning ? 'Referenced Category' : 'Delete Category?'}
                </h3>
                <p className="text-xs text-[#777278]">Category: {deletingCategory.name}</p>
              </div>
            </div>

            {isReferencedWarning ? (
              <div className="space-y-3">
                <p className="text-xs text-amber-300 leading-relaxed bg-amber-950/30 p-3 rounded-xl border border-amber-500/30">
                  {referencedMessage ||
                    `This category "${deletingCategory.name}" is referenced by existing support conversations and cannot be hard-deleted without corrupting historical records.`}
                </p>
                <p className="text-[11px] text-[#B0ACB0]">
                  We recommend disabling this category instead. It will be hidden from new support requests while keeping all existing conversations intact.
                </p>
              </div>
            ) : (
              <p className="text-xs text-[#B0ACB0] leading-relaxed">
                Are you sure you want to permanently delete category <span className="font-bold text-[#F5F5F5]">"{deletingCategory.name}"</span>? This action cannot be undone if no historical conversations reference it.
              </p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => {
                  setDeletingCategory(null);
                  setIsReferencedWarning(false);
                }}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl bg-[#1B181C] text-[#B0ACB0] text-xs font-bold hover:text-[#F5F5F5] disabled:opacity-50"
              >
                Cancel
              </button>

              {isReferencedWarning ? (
                <button
                  onClick={handleDisableInsteadOfDelete}
                  disabled={isDeleting}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-[#0D0B0D] text-xs font-black uppercase tracking-wider transition disabled:opacity-50 flex items-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Disabling...</span>
                    </>
                  ) : (
                    <span>Disable Category Instead</span>
                  )}
                </button>
              ) : (
                <button
                  onClick={handleExecuteDelete}
                  disabled={isDeleting}
                  className="px-5 py-2 rounded-xl bg-[#E21B36] hover:bg-red-500 text-white text-xs font-black uppercase tracking-wider transition disabled:opacity-50 flex items-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Delete Category</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
