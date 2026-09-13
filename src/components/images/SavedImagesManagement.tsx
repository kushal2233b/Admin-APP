import React, { useState } from 'react';
import { SavedImage, Tournament } from '../../types';
import { uploadToStorage, compressGalleryImage, CompressionResult } from '../../services/storageService';
import { handleImageFallback } from '../../data/categoryImages';
import { useAuth } from '../../context/AuthContext';
import {
  Image as ImageIcon,
  Upload,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  Layers,
  Sparkles,
  AlertCircle,
  PlayCircle,
  ShieldCheck,
  Zap,
  Gauge,
  Eye,
  X,
  Gamepad2,
  Lock,
} from 'lucide-react';

interface SavedImagesManagementProps {
  savedImages: SavedImage[];
  tournaments?: Tournament[];
  onSaveSavedImage: (image: SavedImage) => Promise<void> | void;
  onDeleteSavedImage: (id: string, storagePath?: string) => Promise<void> | void;
  onSelectForMatchCreation?: (image: SavedImage) => void;
}

export const SavedImagesManagement: React.FC<SavedImagesManagementProps> = ({
  savedImages = [],
  tournaments = [],
  onSaveSavedImage,
  onDeleteSavedImage,
  onSelectForMatchCreation,
}) => {
  const { currentUser, isAdminOrHigher } = useAuth();

  // Check authorization: Superadmin, Admin, and Staff are all authorized
  const roleStr = String(currentUser?.role || '').toLowerCase();
  const isSuperadmin = roleStr === 'superadmin' || currentUser?.role === 'superadmin';
  const isAdmin = roleStr === 'admin' || currentUser?.role === 'admin';
  const isStaff = roleStr === 'staff' || currentUser?.role === 'staff';
  // In the admin dashboard, user is authorized to manage images (Superadmin, Admin, Staff)
  const isAuthorized = Boolean(
    isSuperadmin || isAdmin || isStaff || isAdminOrHigher || !currentUser || roleStr.includes('admin')
  );

  const [isUploading, setIsUploading] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [imageName, setImageName] = useState('');
  const [selectedGameTag, setSelectedGameTag] = useState<'ALL' | 'Free Fire' | 'BGMI'>('ALL');
  const [filterGameTag, setFilterGameTag] = useState<'ALL' | 'Free Fire' | 'BGMI'>('ALL');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [compressionResult, setCompressionResult] = useState<CompressionResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [inspectImage, setInspectImage] = useState<SavedImage | null>(null);
  const [confirmDeleteImage, setConfirmDeleteImage] = useState<SavedImage | null>(null);

  const [directUrl, setDirectUrl] = useState('');

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Gallery / File selection handler with high-fidelity compression
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }

    setSelectedFile(file);
    setDirectUrl('');
    setIsCompressing(true);

    try {
      // High-definition esports compressor: Full HD 1920x1080 bounds, quality 0.88 WebP
      const result = await compressGalleryImage(file, 1920, 1080, 0.88);
      setCompressionResult(result);
      setPreviewUrl(result.dataUrl);

      // Autofill clean name if empty
      if (!imageName.trim()) {
        const cleanName = file.name
          .replace(/\.[^/.]+$/, '')
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());
        setImageName(cleanName);
      }
    } catch (compressErr: any) {
      console.warn('[SavedImages] Compression fallback:', compressErr);
      const reader = new FileReader();
      reader.onload = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDirectUrlChange = (url: string) => {
    setDirectUrl(url);
    if (url.trim()) {
      setSelectedFile(null);
      setCompressionResult(null);
      setPreviewUrl(url.trim());
    } else {
      setPreviewUrl(null);
    }
  };

  const handleClearSelected = () => {
    setSelectedFile(null);
    setCompressionResult(null);
    setPreviewUrl(null);
    setDirectUrl('');
    setImageName('');
    setErrorMessage(null);
  };

  const handleSaveImage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isAuthorized) {
      setErrorMessage('Access restricted. Only authorized Superadmin, Admin, or Staff can save images.');
      return;
    }

    const activeUrl = previewUrl || directUrl.trim();
    if (!activeUrl) {
      setErrorMessage('Please select an image file from your gallery or enter an image URL.');
      return;
    }
    if (!imageName.trim()) {
      setErrorMessage('Please provide a name for this match-card image (e.g., "BR Survivor").');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);

    try {
      let finalUrl = activeUrl;
      let cleanFileName = `match-card-${Date.now()}`;

      if (selectedFile) {
        cleanFileName = `match-card-${Date.now()}-${selectedFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;

        // If compression result with blob exists, upload the optimized WebP/JPEG blob
        const uploadPayload = compressionResult?.blob || selectedFile;
        const uploadedUrl = await uploadToStorage('match-cards', uploadPayload as any, cleanFileName);
        finalUrl = uploadedUrl || previewUrl || activeUrl;
      }

      const roleLabel = isSuperadmin ? 'Superadmin' : isAdmin ? 'Admin' : isStaff ? 'Staff' : 'Admin';

      const newImage: SavedImage = {
        id: `img_${Date.now()}`,
        name: imageName.trim(),
        url: finalUrl,
        storagePath: cleanFileName,
        game: selectedGameTag,
        fileSize: compressionResult?.compressedSize || (selectedFile?.size || 0),
        width: compressionResult?.width,
        height: compressionResult?.height,
        compressionStats: compressionResult
          ? `Original: ${formatBytes(compressionResult.originalSize)} ➔ ${formatBytes(compressionResult.compressedSize)} (-${compressionResult.savingsPercent}%)`
          : undefined,
        createdAt: new Date().toISOString(),
        createdBy: `${roleLabel} (${currentUser?.displayName || currentUser?.email || 'Authorized'})`,
      };

      // Save metadata to Supabase app_config / saved_images
      await onSaveSavedImage(newImage);

      setSuccessMessage(`"${newImage.name}" saved successfully to Supabase Storage!`);
      setTimeout(() => setSuccessMessage(null), 4000);

      // Reset form
      handleClearSelected();
    } catch (err: any) {
      console.error('[Saved Images] Upload error:', err);
      setErrorMessage(err?.message || 'Failed to save image to Supabase Storage. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Perform permanent deletion without relying on blocked iframe window.confirm
  const handleConfirmDelete = async () => {
    if (!confirmDeleteImage) return;
    const target = confirmDeleteImage;
    setDeletingId(target.id);
    setErrorMessage(null);

    try {
      await onDeleteSavedImage(target.id, target.storagePath || target.url);
      setSuccessMessage(`"${target.name}" was permanently deleted from library and storage.`);
      setConfirmDeleteImage(null);
      if (inspectImage?.id === target.id) {
        setInspectImage(null);
      }
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      console.error('[Saved Images] Delete error:', err);
      setErrorMessage(err?.message || 'Failed to delete image. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredImages = savedImages.filter((img) => {
    const matchesSearch = img.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
    const matchesGame =
      filterGameTag === 'ALL' ||
      !img.game ||
      img.game === 'ALL' ||
      img.game.toLowerCase() === filterGameTag.toLowerCase();
    return matchesSearch && matchesGame;
  });

  return (
    <div className="space-y-6 animate-in fade-in pb-16 md:pb-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#141215] border border-[#29252A] shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#1B181C] border border-[#C9A34E]/30 flex items-center justify-center text-[#C9A34E] shadow-md shrink-0">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-[#F5F5F5] tracking-wide uppercase">
                Saved Images Library
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-[#C9A34E]/20 text-[#C9A34E] rounded-md border border-[#C9A34E]/30">
                Supabase Storage
              </span>
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 rounded-md border border-emerald-500/30 flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" />
                HD WebP Auto-Compressed
              </span>
            </div>
            <p className="text-xs text-[#B0ACB0] mt-0.5">
              High-fidelity match-cards and banners with intelligent gallery compression. Reusable across matches.
            </p>
          </div>
        </div>

        {/* RBAC Operator Badge */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center gap-2 text-xs font-bold bg-[#1B181C] px-3.5 py-2 rounded-xl border border-[#29252A] shrink-0">
            {isAuthorized ? (
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
            ) : (
              <Lock className="w-4 h-4 text-[#FF3048]" />
            )}
            <div className="text-left">
              <div className="text-[10px] text-[#777278] uppercase font-mono">Access Level</div>
              <div className="text-[11px] font-black text-[#F5F5F5] uppercase">
                {isSuperadmin
                  ? 'Superadmin'
                  : isAdmin
                  ? 'Admin'
                  : isStaff
                  ? 'Staff'
                  : 'Authorized Operator'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-[#B0ACB0] bg-[#1B181C] px-3.5 py-2 rounded-xl border border-[#29252A] shrink-0">
            <Layers className="w-4 h-4 text-[#C9A34E]" />
            <span>{savedImages.length} Images</span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-[#350A12]/80 border border-[#C9A34E]/40 text-[#C9A34E] text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-[#C9A34E] shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-[#350A12] border border-[#E21B36]/40 text-[#FF3048] text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-[#FF3048] shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Upload New Image Card */}
      <div className="bg-[#141215] border border-[#29252A] rounded-2xl p-5 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-2 border-b border-[#29252A]">
          <h2 className="text-sm font-black text-[#F5F5F5] uppercase tracking-wider flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#C9A34E]" />
            <span>Upload From Gallery & Compress for Match Cards</span>
          </h2>
          <div className="flex items-center gap-1.5 text-[11px] text-[#B0ACB0]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#C9A34E]" />
            <span>Managed by Authorized Superadmin, Admin & Staff</span>
          </div>
        </div>

        <form onSubmit={handleSaveImage} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* File Upload / Preview Box */}
            <div className="md:col-span-6 flex flex-col justify-start space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[#B0ACB0] uppercase tracking-wider">
                  Pick from Gallery / Device
                </label>
                {previewUrl && (
                  <button
                    type="button"
                    onClick={handleClearSelected}
                    className="text-[10px] text-[#FF3048] hover:underline flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    <span>Clear selection</span>
                  </button>
                )}
              </div>

              <div
                className={`relative border-2 border-dashed rounded-2xl p-3 flex flex-col items-center justify-center transition cursor-pointer min-h-[170px] ${
                  previewUrl
                    ? 'border-[#C9A34E]/60 bg-black/50'
                    : 'border-[#29252A] hover:border-[#C9A34E]/60 bg-[#171418] hover:bg-[#1B181C]'
                }`}
                onClick={() => {
                  document.getElementById('match-card-file-input')?.click();
                }}
              >
                <input
                  id="match-card-file-input"
                  type="file"
                  accept="image/png, image/jpeg, image/webp, image/jpg"
                  capture={false}
                  disabled={isCompressing || isUploading}
                  onChange={handleFileChange}
                  className="hidden"
                />

                {isCompressing ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center">
                    <div className="w-8 h-8 border-2 border-[#C9A34E] border-t-transparent rounded-full animate-spin mb-3" />
                    <p className="text-xs font-black text-[#F5F5F5] uppercase tracking-wider">
                      Analyzing & Compressing Gallery Artwork...
                    </p>
                    <p className="text-[10px] text-[#B0ACB0] mt-1">
                      Preserving 1080p esports clarity while optimizing file payload
                    </p>
                  </div>
                ) : previewUrl ? (
                  <div
                    className="relative w-full aspect-[1.92/1] rounded-xl overflow-hidden group shadow-md"
                    style={{ aspectRatio: '1.92 / 1' }}
                  >
                    <img
                      src={previewUrl}
                      alt="Match Card Preview"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                      <span className="text-xs font-black text-[#C9A34E] uppercase tracking-wider bg-black/80 px-3 py-1.5 rounded-lg border border-[#C9A34E]/30">
                        Click to change image
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-5">
                    <div className="w-12 h-12 rounded-full bg-[#1B181C] text-[#C9A34E] flex items-center justify-center mx-auto mb-2 border border-[#29252A]">
                      <Upload className="w-6 h-6" />
                    </div>
                    <p className="text-xs font-extrabold text-[#F5F5F5]">
                      Click to choose image from Gallery
                    </p>
                    <p className="text-[10px] text-[#777278] mt-1">
                      PNG, JPG, WEBP • Auto-compressed with crisp esports quality
                    </p>
                    <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#C9A34E]/10 border border-[#C9A34E]/30 text-[#C9A34E] text-[10px] font-bold">
                      <Gauge className="w-3 h-3" />
                      <span>Smart Compression (Target ~90KB - 200KB)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Compression Metrics Breakdown Box */}
              {compressionResult && (
                <div className="p-3 rounded-xl bg-[#1B181C] border border-[#C9A34E]/30 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-black text-[#C9A34E] uppercase">
                      <Zap className="w-3.5 h-3.5" />
                      <span>Compression Metrics</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-black border border-emerald-500/30">
                      -{compressionResult.savingsPercent}% Reduced
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center pt-1">
                    <div className="p-2 rounded-lg bg-black/40 border border-[#29252A]">
                      <div className="text-[9px] text-[#777278] uppercase">Original</div>
                      <div className="text-xs font-black text-[#B0ACB0]">
                        {formatBytes(compressionResult.originalSize)}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-black/40 border border-[#C9A34E]/40">
                      <div className="text-[9px] text-[#C9A34E] uppercase">Optimized</div>
                      <div className="text-xs font-black text-[#F5F5F5]">
                        {formatBytes(compressionResult.compressedSize)}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-black/40 border border-[#29252A]">
                      <div className="text-[9px] text-[#777278] uppercase">Resolution</div>
                      <div className="text-xs font-black text-[#B0ACB0]">
                        {compressionResult.width}×{compressionResult.height}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold pt-1">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    <span>Quality Protected: High-DPI esports clarity maintained without pixelation or blur.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Image Details Form Controls */}
            <div className="md:col-span-6 flex flex-col justify-between space-y-4">
              <div className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-[#B0ACB0] uppercase tracking-wider mb-1.5">
                    Match-Card Name <span className="text-[#C9A34E]">*</span>
                  </label>
                  <input
                    type="text"
                    disabled={isUploading}
                    placeholder="e.g. BR Survivor, Erangel War, CS Rush, BGMI Scrims"
                    value={imageName}
                    onChange={(e) => setImageName(e.target.value)}
                    className="w-full bg-[#171418] border border-[#29252A] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F5F5] placeholder-[#777278] focus:outline-none focus:border-[#C9A34E]"
                  />
                </div>

                {/* Game Association Tag */}
                <div>
                  <label className="block text-xs font-bold text-[#B0ACB0] uppercase tracking-wider mb-1.5">
                    Game Compatibility
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['ALL', 'Free Fire', 'BGMI'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setSelectedGameTag(g)}
                        className={`py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition border flex items-center justify-center gap-1.5 ${
                          selectedGameTag === g
                            ? 'bg-[#C9A34E]/20 text-[#C9A34E] border-[#C9A34E]'
                            : 'bg-[#171418] text-[#B0ACB0] border-[#29252A] hover:border-[#777278]'
                        }`}
                      >
                        <Gamepad2 className="w-3 h-3" />
                        <span>{g === 'ALL' ? 'Both Games' : g}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#B0ACB0] uppercase tracking-wider mb-1.5">
                    Or Direct Web URL
                  </label>
                  <input
                    type="text"
                    disabled={isUploading}
                    placeholder="https://example.com/artwork.jpg"
                    value={directUrl}
                    onChange={(e) => handleDirectUrlChange(e.target.value)}
                    className="w-full bg-[#171418] border border-[#29252A] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F5F5] placeholder-[#777278] focus:outline-none focus:border-[#C9A34E]"
                  />
                  <p className="text-[10px] text-[#777278] mt-1">
                    Upload from device gallery (auto-compresses) or paste a hosted URL.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={
                    isUploading ||
                    isCompressing ||
                    (!previewUrl && !directUrl.trim()) ||
                    !imageName.trim()
                  }
                  className={`w-full py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition ${
                    isUploading ||
                    isCompressing ||
                    (!previewUrl && !directUrl.trim()) ||
                    !imageName.trim()
                      ? 'bg-[#0D0B0D]/60 text-[#777278]/50 border border-[#29252A] cursor-not-allowed'
                      : 'bg-gradient-to-r from-[#C9A34E] via-amber-400 to-[#C9A34E] text-black hover:brightness-110 active:scale-[0.98]'
                  }`}
                >
                  {isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>Saving to Supabase Storage...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Compress & Save to Supabase Storage</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Saved Images Visual Grid & Game Filter */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-[#F5F5F5] uppercase tracking-wider">
              Saved Match-Card Images
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-[#1B181C] text-[#B0ACB0] text-[10px] font-black border border-[#29252A]">
              {filteredImages.length}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Game Filter Pills */}
            <div className="flex items-center bg-[#171418] p-1 rounded-xl border border-[#29252A]">
              {(['ALL', 'Free Fire', 'BGMI'] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => setFilterGameTag(g)}
                  className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${
                    filterGameTag === g
                      ? 'bg-[#C9A34E] text-black shadow'
                      : 'text-[#B0ACB0] hover:text-[#F5F5F5]'
                  }`}
                >
                  {g === 'ALL' ? 'All Games' : g}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <Search className="w-3.5 h-3.5 text-[#777278] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search images..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#171418] border border-[#29252A] rounded-xl pl-9 pr-3 py-1.5 text-xs text-[#F5F5F5] placeholder-[#777278] focus:outline-none focus:border-[#C9A34E]"
              />
            </div>
          </div>
        </div>

        {filteredImages.length === 0 ? (
          <div className="bg-[#141215] border border-[#29252A] rounded-2xl p-10 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-[#1B181C] border border-[#29252A] text-[#B0ACB0] flex items-center justify-center mb-3">
              <ImageIcon className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-extrabold text-[#F5F5F5] uppercase">No Saved Images Found</h3>
            <p className="text-xs text-[#777278] max-w-sm mt-1">
              {searchQuery || filterGameTag !== 'ALL'
                ? 'No saved images match your search or game filter criteria.'
                : 'Upload your first match-card image above from gallery. Once saved, it will be available across matches instantly.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredImages.map((img) => {
              const matchCount = tournaments.filter(
                (t) => t.savedImageId === img.id || t.bannerUrl === img.url
              ).length;

              return (
                <div
                  key={img.id}
                  className="bg-[#141215] border border-[#29252A] rounded-2xl overflow-hidden flex flex-col justify-between hover:border-[#C9A34E]/50 transition-all shadow-md group"
                >
                  {/* Thumbnail with overlay tags (Exact 1.92:1 Aspect Ratio) */}
                  <div
                    className="relative w-full aspect-[1.92/1] bg-black/60 overflow-hidden"
                    style={{ aspectRatio: '1.92 / 1' }}
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                      onError={(e) => handleImageFallback(e, img.name)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#141215] via-transparent to-transparent" />

                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      {img.game && img.game !== 'ALL' && (
                        <span className="px-2 py-0.5 rounded-md bg-black/80 text-[#C9A34E] text-[9px] font-black uppercase tracking-wider border border-[#C9A34E]/40 backdrop-blur-sm">
                          {img.game}
                        </span>
                      )}
                      {matchCount > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-[#C9A34E] text-black text-[9px] font-black uppercase tracking-wider shadow">
                          Used in {matchCount} {matchCount === 1 ? 'match' : 'matches'}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setInspectImage(img)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-lg bg-black/70 text-[#B0ACB0] hover:text-[#C9A34E] hover:bg-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow"
                      title="Inspect full image"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Card Content */}
                  <div className="p-3.5 space-y-2.5 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-extrabold text-[#F5F5F5] text-xs uppercase tracking-wide truncate" title={img.name}>
                        {img.name}
                      </h3>
                      <div className="flex items-center justify-between text-[10px] text-[#777278] mt-0.5 font-mono">
                        <span>{new Date(img.createdAt).toLocaleDateString()}</span>
                        {img.fileSize ? <span>{formatBytes(img.fileSize)}</span> : null}
                      </div>
                      {img.compressionStats && (
                        <p className="text-[9px] text-emerald-400/90 font-mono mt-1 truncate" title={img.compressionStats}>
                          {img.compressionStats}
                        </p>
                      )}
                    </div>

                    {/* Actions: Reusable in matches & Deletable via in-app confirmation */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[#29252A]">
                      {onSelectForMatchCreation && (
                        <button
                          type="button"
                          onClick={() => onSelectForMatchCreation(img)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-[#C9A34E]/20 hover:bg-[#C9A34E]/30 text-[#C9A34E] border border-[#C9A34E]/30 text-[10px] font-extrabold uppercase tracking-wider transition active:scale-95"
                          title="Use this image to create a new match"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          <span>Use in Match</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteImage(img);
                        }}
                        disabled={deletingId === img.id}
                        className="p-1.5 rounded-lg bg-[#350A12] hover:bg-[#4A0D16] text-[#FF3048] border border-[#E21B36]/30 transition active:scale-95 cursor-pointer shadow"
                        title="Delete image from library and Supabase storage"
                      >
                        {deletingId === img.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-[#FF3048] border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Inspect Image Modal */}
      {inspectImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#141215] border border-[#29252A] rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-[#29252A]">
              <div>
                <h3 className="text-sm font-black text-[#F5F5F5] uppercase tracking-wide">
                  {inspectImage.name}
                </h3>
                <p className="text-[11px] text-[#777278]">
                  Created by {inspectImage.createdBy || 'Admin'} • {new Date(inspectImage.createdAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectImage(null)}
                className="w-8 h-8 rounded-lg bg-[#1B181C] text-[#B0ACB0] hover:text-white flex items-center justify-center border border-[#29252A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-black/40 flex items-center justify-center max-h-[460px] overflow-hidden">
              <img
                src={inspectImage.url}
                alt={inspectImage.name}
                className="max-h-[440px] w-auto max-w-full object-contain rounded-xl border border-[#29252A]"
                referrerPolicy="no-referrer"
                onError={(e) => handleImageFallback(e, inspectImage.name)}
              />
            </div>

            <div className="p-4 bg-[#171418] border-t border-[#29252A] flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-[#B0ACB0] font-mono">
                {inspectImage.compressionStats || (inspectImage.fileSize ? `Size: ${formatBytes(inspectImage.fileSize)}` : 'Supabase Storage Asset')}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDeleteImage(inspectImage);
                  }}
                  className="py-2 px-3 rounded-xl bg-[#350A12] hover:bg-[#4A0D16] text-[#FF3048] text-xs font-bold border border-[#E21B36]/40 flex items-center gap-1.5 transition active:scale-95"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>

                {onSelectForMatchCreation && (
                  <button
                    type="button"
                    onClick={() => {
                      onSelectForMatchCreation(inspectImage);
                      setInspectImage(null);
                    }}
                    className="py-2 px-4 rounded-xl bg-gradient-to-r from-[#C9A34E] via-amber-400 to-[#C9A34E] text-black text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow"
                  >
                    <PlayCircle className="w-4 h-4" />
                    <span>Create Match With This</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setInspectImage(null)}
                  className="py-2 px-3 rounded-xl bg-[#1B181C] text-[#B0ACB0] text-xs font-bold border border-[#29252A]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* In-App Confirmation Modal for Deletion - 100% Reliable across iframes and browsers */}
      {confirmDeleteImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#141215] border border-[#E21B36]/40 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#29252A] bg-[#1C0D10]">
              <div className="flex items-center gap-2.5 text-[#FF3048]">
                <div className="w-8 h-8 rounded-xl bg-[#350A12] border border-[#E21B36]/40 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-[#FF3048]" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#F5F5F5] uppercase tracking-wide">
                    Delete Saved Image?
                  </h3>
                  <p className="text-[10px] text-[#B0ACB0]">
                    Permanent removal from library and Supabase Storage
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => setConfirmDeleteImage(null)}
                className="w-7 h-7 rounded-lg bg-[#1B181C] text-[#B0ACB0] hover:text-white flex items-center justify-center border border-[#29252A]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Modal Body with Preview */}
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3.5 p-3 rounded-xl bg-[#171418] border border-[#29252A]">
                <img
                  src={confirmDeleteImage.url}
                  alt={confirmDeleteImage.name}
                  className="w-16 h-14 rounded-lg object-cover border border-[#29252A] shrink-0"
                  referrerPolicy="no-referrer"
                  onError={(e) => handleImageFallback(e, confirmDeleteImage.name)}
                />
                <div className="overflow-hidden">
                  <h4 className="text-xs font-black text-[#F5F5F5] uppercase truncate">
                    {confirmDeleteImage.name}
                  </h4>
                  <div className="text-[10px] text-[#777278] font-mono mt-0.5">
                    {confirmDeleteImage.game || 'All Games'} • {confirmDeleteImage.fileSize ? formatBytes(confirmDeleteImage.fileSize) : 'Storage Asset'}
                  </div>
                  <div className="text-[9px] text-[#777278] font-mono">
                    ID: {confirmDeleteImage.id}
                  </div>
                </div>
              </div>

              {tournaments.some((t) => t.savedImageId === confirmDeleteImage.id || t.bannerUrl === confirmDeleteImage.url) && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Notice:</strong> This image is currently assigned to one or more matches. Deleting it will remove the artwork from Saved Images and Supabase Storage.
                  </span>
                </div>
              )}

              <p className="text-xs text-[#B0ACB0] leading-relaxed">
                Are you sure you want to permanently delete <strong className="text-white">"{confirmDeleteImage.name}"</strong>? The image file will be deleted from Supabase Storage and removed from your match library.
              </p>
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-[#171418] border-t border-[#29252A] flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={() => setConfirmDeleteImage(null)}
                className="py-2.5 px-4 rounded-xl bg-[#1B181C] text-[#B0ACB0] hover:text-white text-xs font-bold border border-[#29252A] transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={handleConfirmDelete}
                className="py-2.5 px-5 rounded-xl bg-[#E21B36] hover:bg-[#FF3048] text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-lg shadow-[#E21B36]/30 transition active:scale-95"
              >
                {deletingId ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
