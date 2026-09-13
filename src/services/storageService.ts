import { supabase } from './supabase';

export interface CompressionResult {
  dataUrl: string;
  blob: Blob;
  originalSize: number;
  compressedSize: number;
  savingsPercent: number;
  width: number;
  height: number;
  format: string;
}

/**
 * High-fidelity esports artwork & gallery image compressor.
 * Compresses large camera/gallery photos (e.g. 3MB-10MB) down to lightweight WebP (~80KB-220KB)
 * while preserving high-definition crispness, color vibrancy, typography, and contrast.
 */
export async function compressGalleryImage(
  input: File | Blob | string,
  maxWidth = 1920,
  maxHeight = 1080,
  initialQuality = 0.88
): Promise<CompressionResult> {
  return new Promise((resolve, reject) => {
    let originalSize = 0;
    if (typeof input !== 'string') {
      originalSize = input.size;
    } else if (input.startsWith('data:')) {
      originalSize = Math.round((input.length * 3) / 4);
    }

    const img = new Image();

    const process = () => {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (!width || !height) {
        width = 1280;
        height = 720;
      }

      // Preserve aspect ratio within maxWidth/maxHeight bounds
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable for image compression'));
        return;
      }

      // Crisp bicubic smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      let format = 'image/webp';
      let currentQuality = initialQuality;
      let dataUrl = canvas.toDataURL(format, currentQuality);

      // If browser doesn't support WebP export, fallback to high-quality JPEG
      if (!dataUrl.startsWith('data:image/webp')) {
        format = 'image/jpeg';
        dataUrl = canvas.toDataURL(format, currentQuality);
      }

      let approxSize = Math.round((dataUrl.length * 3) / 4);

      // Adaptive gentle compression: only reduce if size exceeds 320KB, never drop below 0.74
      while (approxSize > 320000 && currentQuality > 0.74) {
        currentQuality -= 0.04;
        dataUrl = canvas.toDataURL(format, currentQuality);
        approxSize = Math.round((dataUrl.length * 3) / 4);
      }

      // Convert dataUrl to binary Blob for efficient Supabase upload
      const parts = dataUrl.split(';base64,');
      const contentType = parts[0].split(':')[1] || format;
      const raw = window.atob(parts[1]);
      const uInt8Array = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
      }
      const blob = new Blob([uInt8Array], { type: contentType });
      const finalSize = blob.size;
      const effectiveOriginal = originalSize > 0 ? originalSize : finalSize * 3;
      const savingsPercent = Math.max(0, Math.round(((effectiveOriginal - finalSize) / effectiveOriginal) * 100));

      resolve({
        dataUrl,
        blob,
        originalSize: effectiveOriginal,
        compressedSize: finalSize,
        savingsPercent,
        width,
        height,
        format: contentType,
      });
    };

    img.onload = process;
    img.onerror = () => {
      // Fallback
      if (typeof input === 'string') {
        resolve({
          dataUrl: input,
          blob: new Blob([]),
          originalSize: 0,
          compressedSize: 0,
          savingsPercent: 0,
          width: 0,
          height: 0,
          format: 'image/jpeg',
        });
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const res = (e.target?.result as string) || '';
          resolve({
            dataUrl: res,
            blob: input as Blob,
            originalSize: input.size,
            compressedSize: input.size,
            savingsPercent: 0,
            width: 0,
            height: 0,
            format: input.type || 'image/jpeg',
          });
        };
        reader.readAsDataURL(input);
      }
    };

    if (typeof input === 'string') {
      img.crossOrigin = 'anonymous';
      img.src = input;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = (e.target?.result as string) || '';
      };
      reader.readAsDataURL(input);
    }
  });
}

/**
 * Compresses an image file or DataURL string using HTML5 Canvas.
 * Returns a high-definition, lightweight DataURL (JPEG/WEBP) usually around 60KB - 180KB.
 */
export async function compressImageFile(
  input: File | string,
  maxWidth = 1920,
  maxHeight = 1080,
  initialQuality = 0.86
): Promise<string> {
  // If it's already an http/https URL, return it directly
  if (typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'))) {
    return input;
  }

  try {
    const result = await compressGalleryImage(input, maxWidth, maxHeight, initialQuality);
    return result.dataUrl;
  } catch (err) {
    console.warn('[compressImageFile] fallback notice:', err);
    if (typeof input === 'string') return input;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(input);
    });
  }
}

/**
 * Uploads a file to Supabase Storage bucket or returns compressed inline DataURL
 * @param folder Bucket or folder prefix (e.g. 'banners', 'avatars', 'uploads')
 * @param file File or data URL string
 * @param fileName Optional filename
 */
export async function uploadToStorage(
  folder: string,
  file: File | string,
  fileName?: string
): Promise<string> {
  const timeName = fileName || `${folder}-${Date.now()}.png`;

  console.log('[DEBUG Storage Upload Attempt]', { folder, fileName: timeName });

  // 1. Compress image client-side to ensure lightweight payload
  let compressedDataUrl = '';
  try {
    compressedDataUrl = await compressImageFile(file, 1200, 1200, 0.82);
  } catch (compressErr) {
    console.warn('[Storage Service] Compression notice:', compressErr);
  }

  if (compressedDataUrl && (compressedDataUrl.startsWith('http://') || compressedDataUrl.startsWith('https://'))) {
    console.log('[DEBUG Storage] Image is already hosted URL:', compressedDataUrl);
    return compressedDataUrl;
  }

  // 2. Try Supabase Storage upload
  if (supabase) {
    try {
      let uploadBody: Blob | File | null = null;
      let contentType = 'image/jpeg';

      if (typeof file !== 'string') {
        uploadBody = file;
        contentType = file.type || 'image/jpeg';
      } else if (compressedDataUrl && compressedDataUrl.startsWith('data:')) {
        const parts = compressedDataUrl.split(';base64,');
        contentType = parts[0].split(':')[1] || 'image/jpeg';
        const raw = window.atob(parts[1]);
        const uInt8Array = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; ++i) {
          uInt8Array[i] = raw.charCodeAt(i);
        }
        uploadBody = new Blob([uInt8Array], { type: contentType });
      }

      if (uploadBody) {
        // Priority buckets: winx7-media, tournaments, match-cards, uploads, public
        const candidateBuckets = [
          folder,
          'winx7-media',
          'tournaments',
          'match-cards',
          'uploads',
          'public'
        ].filter((b, idx, arr) => b && arr.indexOf(b) === idx);

        for (const bucketName of candidateBuckets) {
          try {
            const path = folder && folder !== bucketName ? `${folder}/${timeName}` : timeName;
            const { data, error } = await supabase.storage
              .from(bucketName)
              .upload(path, uploadBody, {
                contentType,
                cacheControl: '3600',
                upsert: true,
              });

            if (!error && data?.path) {
              const { data: publicUrlData } = supabase.storage
                .from(bucketName)
                .getPublicUrl(data.path);

              if (publicUrlData?.publicUrl) {
                console.log('[DEBUG Storage Upload Success]', {
                  bucket: bucketName,
                  path: data.path,
                  publicUrl: publicUrlData.publicUrl,
                });
                return publicUrlData.publicUrl;
              }
            } else if (error) {
              console.warn(`[DEBUG Storage Upload Note] Bucket '${bucketName}':`, error.message);
            }
          } catch (bucketErr: any) {
            console.warn(`[DEBUG Storage Bucket '${bucketName}' Exception]:`, bucketErr?.message || bucketErr);
          }
        }
      }
    } catch (err: any) {
      console.warn('[Supabase Storage] Upload attempt notice:', err?.message || err);
    }
  }

  // 3. Fallback to compressed DataURL if direct storage bucket is unavailable
  if (compressedDataUrl) {
    console.log('[DEBUG Storage] Falling back to compressed DataURL');
    return compressedDataUrl;
  }
  if (typeof file === 'string') return file;

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve((e.target?.result as string) || '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

// Alias for backwards compatibility
export const uploadToFirebaseStorage = uploadToStorage;

/**
 * Deletes a file from Supabase Storage by public URL or storage path
 */
export async function deleteFromStorage(
  urlOrPath: string,
  preferredBucket = 'match-cards'
): Promise<boolean> {
  if (!urlOrPath || !supabase) return false;

  try {
    let bucketName = preferredBucket;
    let filePath = urlOrPath;

    // If it's a full Supabase storage URL:
    // e.g. https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path...>
    if (urlOrPath.includes('/storage/v1/object/public/')) {
      const parts = urlOrPath.split('/storage/v1/object/public/')[1];
      if (parts) {
        const slashIdx = parts.indexOf('/');
        if (slashIdx > 0) {
          bucketName = parts.substring(0, slashIdx);
          filePath = parts.substring(slashIdx + 1);
        }
      }
    } else if (urlOrPath.startsWith('http')) {
      // Not a Supabase storage path
      return false;
    }

    // Attempt deletion from identified bucket
    const { error } = await supabase.storage.from(bucketName).remove([filePath]);
    if (error) {
      console.warn(`[deleteFromStorage] Bucket '${bucketName}' removal notice:`, error.message);
      // Try fallback buckets just in case
      const fallbacks = ['match-cards', 'banners', 'tournaments', 'winx7-media', 'uploads'].filter(b => b !== bucketName);
      for (const fb of fallbacks) {
        try {
          await supabase.storage.from(fb).remove([filePath]);
        } catch {
          // ignore
        }
      }
    }
    return true;
  } catch (err: any) {
    console.warn('[deleteFromStorage] Exception:', err?.message || err);
    return false;
  }
}
