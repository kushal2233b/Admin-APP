import { supabase } from './supabase';

/**
 * Compresses an image file or DataURL string using HTML5 Canvas.
 * Returns a lightweight DataURL (JPEG/WEBP) usually around 30KB - 120KB.
 */
export async function compressImageFile(
  input: File | string,
  maxWidth = 1000,
  maxHeight = 1000,
  initialQuality = 0.78
): Promise<string> {
  // If it's already an http/https URL, return it directly
  if (typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'))) {
    return input;
  }

  return new Promise((resolve) => {
    const img = new Image();

    const processImage = () => {
      let width = img.width;
      let height = img.height;

      if (!width || !height) {
        if (typeof input === 'string') return resolve(input);
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string) || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(input);
        return;
      }

      // Calculate new dimensions preserving aspect ratio
      if (width > maxWidth || height > maxHeight) {
        if (width / height > maxWidth / maxHeight) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        let currentQuality = initialQuality;
        let dataUrl = canvas.toDataURL('image/webp', currentQuality);
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
        }

        // Auto-compress further if DataURL length exceeds ~150KB string size
        while (dataUrl.length > 150000 && currentQuality > 0.3) {
          currentQuality -= 0.15;
          let compressed = canvas.toDataURL('image/webp', currentQuality);
          if (!compressed.startsWith('data:image/webp')) {
            compressed = canvas.toDataURL('image/jpeg', currentQuality);
          }
          dataUrl = compressed;
        }

        // Absolute sizing safety: if it's STILL too large (> 250KB), scale down resolution
        let scaleWidth = width;
        let scaleHeight = height;
        while (dataUrl.length > 250000 && scaleWidth > 150) {
          scaleWidth = Math.round(scaleWidth * 0.7);
          scaleHeight = Math.round(scaleHeight * 0.7);

          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = scaleWidth;
          tempCanvas.height = scaleHeight;
          const tempCtx = tempCanvas.getContext('2d');
          if (tempCtx) {
            tempCtx.imageSmoothingEnabled = true;
            tempCtx.imageSmoothingQuality = 'high';
            tempCtx.drawImage(img, 0, 0, scaleWidth, scaleHeight);

            let compressed = tempCanvas.toDataURL('image/webp', currentQuality);
            if (!compressed.startsWith('data:image/webp')) {
              compressed = tempCanvas.toDataURL('image/jpeg', currentQuality);
            }
            dataUrl = compressed;
          } else {
            break;
          }
        }

        // Always resolve with compressed dataUrl
        resolve(dataUrl);
      } else {
        if (typeof input === 'string') return resolve(input);
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string) || '');
        reader.onerror = () => resolve('');
        reader.readAsDataURL(input);
      }
    };

    img.onload = processImage;
    img.onerror = () => {
      if (typeof input === 'string') return resolve(input);
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(input);
    };

    if (typeof input === 'string') {
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
