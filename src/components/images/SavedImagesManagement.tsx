import React, { useState } from 'react';
import { SavedImage, Tournament } from '../../types';
import { uploadToStorage } from '../../services/storageService';
import { handleImageFallback } from '../../data/categoryImages';
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
} from 'lucide-react';

interface SavedImagesManagementProps {
  savedImages: SavedImage[];
  tournaments?: Tournament[];
  onSaveSavedImage: (image: SavedImage) => Promise<void> | void;
  onDeleteSavedImage: (id: string) => Promise<void> | void;
  onSelectForMatchCreation?: (image: SavedImage) => void;
}

export const SavedImagesManagement: React.FC<SavedImagesManagementProps> = ({
  savedImages = [],
  tournaments = [],
  onSaveSavedImage,
  onDeleteSavedImage,
  onSelectForMatchCreation,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [imageName, setImageName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [directUrl, setDirectUrl] = useState('');

  // File handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }

    setSelectedFile(file);
    setDirectUrl('');
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);

    // If name is empty, autofill with cleaned file name
    if (!imageName.trim()) {
      const cleanName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      setImageName(cleanName);
    }
  };

  const handleDirectUrlChange = (url: string) => {
    setDirectUrl(url);
    if (url.trim()) {
      setSelectedFile(null);
      setPreviewUrl(url.trim());
    } else {
      setPreviewUrl(null);
    }
  };

  const handleSaveImage = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeUrl = previewUrl || directUrl.trim();
    if (!activeUrl) {
      setErrorMessage('Please select an image file or enter an image URL.');
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
        const uploadedUrl = await uploadToStorage('match-cards', selectedFile, cleanFileName);
        finalUrl = uploadedUrl || previewUrl || activeUrl;
      }

      const newImage: SavedImage = {
        id: `img_${Date.now()}`,
        name: imageName.trim(),
        url: finalUrl,
        storagePath: cleanFileName,
        createdAt: new Date().toISOString(),
        createdBy: 'Admin',
      };

      // 2. Save metadata to Supabase app_config / saved_images
      await onSaveSavedImage(newImage);

      setSuccessMessage(`"${newImage.name}" saved successfully to Saved Images library!`);
      setTimeout(() => setSuccessMessage(null), 3500);

      // Reset form
      setSelectedFile(null);
      setPreviewUrl(null);
      setDirectUrl('');
      setImageName('');
    } catch (err: any) {
      console.error('[Saved Images] Upload error:', err);
      setErrorMessage(err?.message || 'Failed to save image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const isUsed = tournaments.some((t) => t.savedImageId === id || t.bannerUrl?.includes(id));
    const confirmMsg = isUsed
      ? `"${name}" is currently associated with active matches. Are you sure you want to delete it from Saved Images?`
      : `Are you sure you want to delete "${name}" from Saved Images?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setDeletingId(id);
      await onDeleteSavedImage(id);
      setSuccessMessage(`"${name}" deleted from library.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to delete image.');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredImages = savedImages.filter((img) =>
    img.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  return (
    <div className="space-y-6 animate-in fade-in pb-16 md:pb-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-[#0F0D24] border border-purple-900/40 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-purple-600/30 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-md shrink-0">
            <ImageIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-black text-white tracking-wide uppercase">
                Saved Images Library
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 rounded-md border border-amber-500/40">
                Supabase Storage
              </span>
            </div>
            <p className="text-xs text-purple-300/80 mt-0.5">
              Upload and manage reusable match-card images. Reusable across any number of matches.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-purple-200 bg-[#161233] px-3.5 py-2 rounded-xl border border-purple-800/40 shrink-0 self-start sm:self-auto">
          <Layers className="w-4 h-4 text-amber-400" />
          <span>{savedImages.length} Reusable Images</span>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-2 shadow-lg animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Upload New Image Card */}
      <div className="bg-[#120E2E] border border-purple-900/40 rounded-2xl p-5 shadow-lg">
        <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 mb-4 pb-2 border-b border-purple-900/30">
          <Plus className="w-4 h-4 text-amber-400" />
          <span>Upload & Save Match-Card Image</span>
        </h2>

        <form onSubmit={handleSaveImage} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* File Upload / Preview Box */}
            <div className="md:col-span-6 flex flex-col justify-center">
              <label className="block text-xs font-bold text-purple-200 uppercase tracking-wider mb-1.5">
                Select Image File
              </label>

              <div
                className={`relative border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center transition cursor-pointer min-h-[160px] ${
                  previewUrl
                    ? 'border-amber-500/50 bg-black/40'
                    : 'border-purple-800/60 hover:border-amber-400/60 bg-[#0A081D]/60 hover:bg-[#0A081D]'
                }`}
                onClick={() => document.getElementById('match-card-file-input')?.click()}
              >
                <input
                  id="match-card-file-input"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {previewUrl ? (
                  <div className="relative w-full h-36 rounded-xl overflow-hidden group">
                    <img
                      src={previewUrl}
                      alt="Match Card Preview"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                      <span className="text-xs font-black text-amber-300 uppercase tracking-wider bg-black/80 px-3 py-1.5 rounded-lg border border-amber-500/40">
                        Click to change image
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-4">
                    <div className="w-10 h-10 rounded-full bg-purple-900/40 text-amber-400 flex items-center justify-center mx-auto mb-2 border border-purple-800/50">
                      <Upload className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-extrabold text-white">Click or drag & drop image here</p>
                    <p className="text-[10px] text-purple-300/70 mt-1">PNG, JPG, WEBP • Recommended 16:9 ratio</p>
                  </div>
                )}
              </div>
            </div>

            {/* Image Details */}
            <div className="md:col-span-6 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-purple-200 uppercase tracking-wider mb-1.5">
                    Image Simple Name <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. BR Survivor, BR Elites, Clash Squad, Lone Wolf"
                    value={imageName}
                    onChange={(e) => setImageName(e.target.value)}
                    className="w-full bg-[#0A081D] border border-purple-800/60 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-purple-400/40 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-purple-200 uppercase tracking-wider mb-1.5">
                    Or Paste Direct Image Link (URL)
                  </label>
                  <input
                    type="text"
                    placeholder="https://example.com/match-artwork.jpg"
                    value={directUrl}
                    onChange={(e) => handleDirectUrlChange(e.target.value)}
                    className="w-full bg-[#0A081D] border border-purple-800/60 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-purple-400/40 focus:outline-none focus:border-amber-400"
                  />
                  <p className="text-[10px] text-purple-300/60 mt-1">
                    Upload an image file or paste a web URL directly.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isUploading || (!previewUrl && !directUrl.trim()) || !imageName.trim()}
                  className={`w-full py-3 px-4 rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition ${
                    isUploading || (!previewUrl && !directUrl.trim()) || !imageName.trim()
                      ? 'bg-purple-950/60 text-purple-400/50 border border-purple-900/40 cursor-not-allowed'
                      : 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-black hover:brightness-110 active:scale-[0.98]'
                  }`}
                >
                  {isUploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>Uploading to Supabase Storage...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Save to Library</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Saved Images Visual Grid */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-white uppercase tracking-wider">
              Saved Match-Card Images
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-200 text-[10px] font-black">
              {filteredImages.length}
            </span>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-purple-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search saved images..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0F0D24] border border-purple-900/50 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-purple-400/50 focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>

        {filteredImages.length === 0 ? (
          <div className="bg-[#120E2E] border border-purple-900/30 rounded-2xl p-10 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-purple-900/30 border border-purple-800/40 text-purple-300 flex items-center justify-center mb-3">
              <ImageIcon className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-extrabold text-white uppercase">No Saved Images Found</h3>
            <p className="text-xs text-purple-300/70 max-w-sm mt-1">
              {searchQuery
                ? 'No saved images match your search query.'
                : 'Upload your first match-card image above. Once saved, it will be available instantly in the Create Match form.'}
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
                  className="bg-[#120E2E] border border-purple-900/40 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-purple-700/60 transition-all shadow-md group"
                >
                  {/* Thumbnail */}
                  <div className="relative w-full h-36 bg-black/60 overflow-hidden">
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                      onError={(e) => handleImageFallback(e, img.name)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#120E2E] via-transparent to-transparent" />
                    
                    {matchCount > 0 && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500/90 text-black text-[9px] font-black uppercase tracking-wider shadow">
                        Used in {matchCount} {matchCount === 1 ? 'match' : 'matches'}
                      </span>
                    )}
                  </div>

                  {/* Card Content */}
                  <div className="p-3.5 space-y-3 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-extrabold text-white text-xs uppercase tracking-wide truncate">
                        {img.name}
                      </h3>
                      <p className="text-[10px] text-purple-300/60 mt-0.5">
                        Saved {new Date(img.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 pt-2 border-t border-purple-900/30">
                      {onSelectForMatchCreation && (
                        <button
                          onClick={() => onSelectForMatchCreation(img)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-extrabold uppercase tracking-wider transition active:scale-95"
                          title="Use this image to create a new match"
                        >
                          <PlayCircle className="w-3 h-3" />
                          <span>Use in Match</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDelete(img.id, img.name)}
                        disabled={deletingId === img.id}
                        className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-400 border border-rose-800/40 transition active:scale-95"
                        title="Delete image from library"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
