import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { SupportCategory } from '../../types';
import {
  fetchSupportCategoriesFromSupabase,
  createSupportCategoryInSupabase,
  updateSupportCategoryInSupabase,
  deleteSupportCategoryFromSupabase
} from '../../services/supabaseService';
import {
  Plus,
  Edit2,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Info,
  Save,
  X
} from 'lucide-react';

export const SupportCategoriesManagement: React.FC = () => {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

  const [categories, setCategories] = useState<SupportCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states for Create/Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<SupportCategory | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  // Safety verification for Deletion
  const [categoryToDelete, setCategoryToDelete] = useState<SupportCategory | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSupportCategoriesFromSupabase();
      setCategories(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch support categories from database.');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    if (!isAdmin) {
      setError('Only Admins/Superadmins are authorized to manage support categories.');
      return;
    }
    setEditingCategory(null);
    setFormName('');
    setFormDescription('');
    setFormIsActive(true);
    setIsModalOpen(true);
  };

  const openEditModal = (cat: SupportCategory) => {
    if (!isAdmin) {
      setError('Only Admins/Superadmins are authorized to manage support categories.');
      return;
    }
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormDescription(cat.description || '');
    setFormIsActive(cat.isActive);
    setIsModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setError('Access Denied: Only Admins/Superadmins can perform this action.');
      return;
    }

    const trimmedName = formName.trim().toUpperCase();
    if (!trimmedName) {
      setError('Category name cannot be empty.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (editingCategory) {
        // Edit existing category in the database
        await updateSupportCategoryInSupabase(editingCategory.id, {
          name: trimmedName,
          description: formDescription.trim(),
          isActive: formIsActive
        });
        setSuccess(`Category "${trimmedName}" updated successfully.`);
      } else {
        // Create new category in the database
        await createSupportCategoryInSupabase({
          name: trimmedName,
          description: formDescription.trim() || undefined,
          isActive: formIsActive,
          displayOrder: categories.length
        });
        setSuccess(`Category "${trimmedName}" created successfully.`);
      }

      const refreshed = await fetchSupportCategoriesFromSupabase();
      setCategories(refreshed);
      setIsModalOpen(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save category in database.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (cat: SupportCategory) => {
    if (!isAdmin) {
      setError('Access Denied: Only Admins/Superadmins can perform this action.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await updateSupportCategoryInSupabase(cat.id, {
        isActive: !cat.isActive
      });

      const refreshed = await fetchSupportCategoriesFromSupabase();
      setCategories(refreshed);
      setSuccess(`Category status for "${cat.name}" updated.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update category status.');
    } finally {
      setLoading(false);
    }
  };

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    if (!isAdmin) {
      setError('Access Denied: Only Admins/Superadmins can perform this action.');
      return;
    }

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    setLoading(true);
    setError(null);
    try {
      const current = categories[index];
      const target = categories[targetIndex];

      // Swap display orders in DB
      await updateSupportCategoryInSupabase(current.id, { displayOrder: target.displayOrder });
      await updateSupportCategoryInSupabase(target.id, { displayOrder: current.displayOrder });

      const refreshed = await fetchSupportCategoriesFromSupabase();
      setCategories(refreshed);
      setSuccess('Category display order updated successfully.');
      setTimeout(() => setSuccess(null), 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to save reordered display index.');
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteCategory = (cat: SupportCategory) => {
    if (!isAdmin) {
      setError('Access Denied: Only Admins/Superadmins can perform this action.');
      return;
    }
    setCategoryToDelete(cat);
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete || !isAdmin) return;

    setLoading(true);
    setError(null);
    try {
      await deleteSupportCategoryFromSupabase(categoryToDelete.id);
      
      const refreshed = await fetchSupportCategoriesFromSupabase();
      setCategories(refreshed);
      setSuccess(`Category "${categoryToDelete.name}" was permanently deleted.`);
      setCategoryToDelete(null);
      setTimeout(() => setSuccess(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to delete category.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-4 bg-[#080708] h-full overflow-y-auto" id="support-categories-management">
      
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#29252A] pb-3">
        <div>
          <h2 className="text-base font-black text-white tracking-widest uppercase flex items-center gap-2">
            📁 SUPPORT CATEGORIES DIRECTORY
          </h2>
          <p className="text-xs text-[#B0ACB0] mt-0.5">
            Database-driven list of active customer support categories for players.
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={openCreateModal}
            className="px-3.5 py-1.5 text-xs font-black bg-[#E21B36] hover:bg-[#FF3048] text-white rounded uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Add Category
          </button>
        )}
      </div>

      {/* RLS / Permission Indicator */}
      {!isAdmin && (
        <div className="p-2.5 bg-[#350A12] border border-[#E21B36]/30 rounded text-xs text-[#FF3048] flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>RLS Access Active:</strong> You are currently logged in with read-only permissions. Only Admin and Superadmin staff roles are authorized to manage or modify support categories.</span>
        </div>
      )}

      {/* Feedback Messages */}
      {error && (
        <div className="p-3 bg-[#350A12] border border-[#E21B36]/40 text-[#FF3048] text-xs font-bold rounded flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[#FF3048] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-3 bg-[#1B181C] border border-[#C9A34E]/40 text-[#C9A34E] text-xs font-bold rounded flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-[#C9A34E]" />
          <span>{success}</span>
        </div>
      )}

      {/* Safety Historical Disclaimer */}
      <div className="p-3 bg-[#141215] border border-[#29252A] rounded-lg text-[11px] text-[#B0ACB0] flex gap-2">
        <Info className="w-4 h-4 text-[#C9A34E] shrink-0 mt-0.5" />
        <div>
          <strong className="text-[#F5F5F5] uppercase tracking-wider">Historical Request Integrity:</strong> Support conversations store their assigned category as a persistent string value rather than a hard reference. Editing, renaming, or deleting a category here will never break or modify historical chats, ensuring continuous data integrity for existing logs.
        </div>
      </div>

      {/* Categories Grid/List */}
      {loading && categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-[#777278]">
          <RefreshCw className="w-6 h-6 text-[#C9A34E] animate-spin" />
          <p className="text-xs uppercase tracking-widest font-black">Connecting to database...</p>
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-20 text-xs text-[#777278] border border-dashed border-[#29252A] rounded-lg">
          No categories found. Click Add Category to create your first dynamic database-driven category.
        </div>
      ) : (
        <div className="border border-[#29252A] bg-[#0D0B0D] rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#141215] border-b border-[#29252A] text-[#777278] font-black tracking-widest uppercase text-[10px]">
                <th className="py-3 px-4">Display Order</th>
                <th className="py-3 px-4">Category Name</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-center">Status</th>
                {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#29252A]">
              {categories.map((cat, idx) => (
                <tr key={cat.id} className="hover:bg-[#141215]/50 transition-colors">
                  <td className="py-3 px-4 font-bold text-[#777278] w-28">
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-center text-[#F5F5F5]">#{idx + 1}</span>
                      {isAdmin && (
                        <div className="flex flex-col gap-0.5">
                          <button
                            onClick={() => handleReorder(idx, 'up')}
                            disabled={idx === 0}
                            className="p-0.5 text-[#777278] hover:text-[#C9A34E] disabled:opacity-20 cursor-pointer"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleReorder(idx, 'down')}
                            disabled={idx === categories.length - 1}
                            className="p-0.5 text-[#777278] hover:text-[#C9A34E] disabled:opacity-20 cursor-pointer"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-extrabold text-[#F5F5F5] tracking-wide text-xs">
                    <span className="bg-[#350A12] border border-[#E21B36]/20 px-2 py-0.5 rounded text-[#FF3048]">
                      {cat.name}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[#B0ACB0] italic text-[11px] max-w-xs truncate">
                    {cat.description || 'No description provided.'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => isAdmin && handleToggleActive(cat)}
                      disabled={!isAdmin}
                      className={`px-2.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                        cat.isActive
                          ? 'bg-[#1B181C] border-[#C9A34E]/30 text-[#C9A34E] hover:bg-[#1B181C]'
                          : 'bg-[#141215] border-[#29252A] text-[#777278]'
                      } ${isAdmin ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    >
                      {cat.isActive ? '● ENABLED' : '○ DISABLED'}
                    </button>
                  </td>
                  {isAdmin && (
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(cat)}
                          className="p-1.5 bg-[#141215] border border-[#29252A] rounded text-[#B0ACB0] hover:text-[#C9A34E] hover:border-[#C9A34E]/30 transition-all cursor-pointer"
                          title="Edit Category Name / Details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => confirmDeleteCategory(cat)}
                          className="p-1.5 bg-[#350A12] border border-[#E21B36]/20 rounded text-[#FF3048] hover:text-white hover:bg-[#E21B36] transition-all cursor-pointer"
                          title="Delete Category"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141215] border border-[#29252A] w-full max-w-md rounded-lg overflow-hidden shadow-2xl">
            <div className="p-4 bg-[#0D0B0D] border-b border-[#29252A] flex justify-between items-center">
              <h3 className="text-xs font-black tracking-widest text-[#C9A34E] uppercase">
                {editingCategory ? '📁 EDIT SUPPORT CATEGORY' : '📁 CREATE SUPPORT CATEGORY'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#777278] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="p-4 space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-[#C9A34E] tracking-widest">
                  Category Name (Will be auto-capitalized)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. RESULT REFUND"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-[#171418] border border-[#29252A] rounded p-2 text-xs text-[#F5F5F5] uppercase tracking-wide focus:outline-none focus:border-[#C9A34E]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-[#C9A34E] tracking-widest">
                  Description
                </label>
                <textarea
                  placeholder="Provide a brief explanation of queries suitable for this category..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-[#171418] border border-[#29252A] rounded p-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#C9A34E] resize-none"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 bg-[#0D0B0D] border border-[#29252A] rounded">
                <div>
                  <h4 className="text-[10px] font-bold text-white uppercase">Enable Category</h4>
                  <p className="text-[9px] text-[#777278] mt-0.5">Toggle to immediately enable or hide category from user selection.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormIsActive(!formIsActive)}
                  className={`px-3 py-1 text-[10px] font-black uppercase rounded tracking-wider border ${
                    formIsActive
                      ? 'bg-[#1B181C] border-[#C9A34E]/30 text-[#C9A34E]'
                      : 'bg-[#141215] border-[#29252A] text-[#777278]'
                  }`}
                >
                  {formIsActive ? 'Active' : 'Disabled'}
                </button>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-[#29252A]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-bold text-[#B0ACB0] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-black bg-[#E21B36] hover:bg-[#FF3048] text-white rounded uppercase tracking-widest flex items-center gap-1 transition-all cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" /> Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Safety Deletion Modal */}
      {categoryToDelete && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141215] border border-[#E21B36]/30 w-full max-w-sm rounded-lg overflow-hidden shadow-2xl">
            <div className="p-4 bg-[#350A12] border-b border-[#E21B36]/20 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-[#FF3048]" />
              <h3 className="text-xs font-black tracking-widest text-[#FF3048] uppercase">
                DELETE SUPPORT CATEGORY
              </h3>
            </div>

            <div className="p-4 space-y-3">
              <p className="text-xs text-[#F5F5F5]">
                Are you absolutely sure you want to delete the category <strong className="text-[#FF3048]">"{categoryToDelete.name}"</strong>?
              </p>
              <div className="p-2.5 bg-[#0D0B0D] border border-[#29252A] rounded text-[10px] text-[#B0ACB0] leading-relaxed">
                ⚠️ <strong>Note on Integrity:</strong> Deleting this will prevent players from choosing it for new requests. Historical tickets marked with this category will remain completely intact and visible to staff.
              </div>
            </div>

            <div className="p-3 bg-[#0D0B0D] border-t border-[#29252A] flex justify-end gap-2">
              <button
                onClick={() => setCategoryToDelete(null)}
                className="px-3 py-1.5 text-xs font-bold text-[#B0ACB0] hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCategory}
                className="px-4 py-1.5 text-xs font-black bg-[#E21B36] hover:bg-[#FF3048] text-white rounded uppercase tracking-widest transition-all cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
