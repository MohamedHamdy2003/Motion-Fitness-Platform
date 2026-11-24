export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    });
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw(ctx, width, height) {
        ctx.drawImage(bitmap, 0, 0, width, height);
      },
      close() {
        bitmap.close();
      },
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('تعذر قراءة ملف الصورة.'));
      el.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw(ctx, width, height) {
        ctx.drawImage(img, 0, 0, width, height);
      },
      close() {
        URL.revokeObjectURL(url);
      },
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

export async function compressImageFile(
  file,
  { maxDimension = 1920, quality = 0.88 } = {},
) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    throw new Error('صيغة الصورة غير مدعومة. استخدم JPEG أو PNG أو WebP.');
  }

  let decoded;
  try {
    decoded = await decodeImage(file);
  } catch {
    return {
      blob: file,
      mime: file.type,
      size: file.size,
      originalSize: file.size,
      compressed: false,
    };
  }

  try {
    const scale = Math.min(
      1,
      maxDimension / Math.max(decoded.width || 1, decoded.height || 1),
    );
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return {
        blob: file,
        mime: file.type,
        size: file.size,
        originalSize: file.size,
        compressed: false,
      };
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    decoded.draw(ctx, width, height);

    const webpBlob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    );

    if (
      webpBlob &&
      webpBlob.type === 'image/webp' &&
      webpBlob.size > 0 &&
      (webpBlob.size < file.size || scale < 1)
    ) {
      return {
        blob: webpBlob,
        mime: 'image/webp',
        size: webpBlob.size,
        originalSize: file.size,
        width,
        height,
        compressed: true,
      };
    }

    return {
      blob: file,
      mime: file.type,
      size: file.size,
      originalSize: file.size,
      width: decoded.width,
      height: decoded.height,
      compressed: false,
    };
  } finally {
    decoded.close();
  }
}
