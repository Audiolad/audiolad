import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_ERROR_MESSAGES,
  AVATAR_MAX_BYTES,
} from "@/lib/images/avatar-constants";

function hasAllowedExtension(fileName: string): boolean {
  const normalized = fileName.trim().toLowerCase();

  return (
    normalized.endsWith(".jpg") ||
    normalized.endsWith(".jpeg") ||
    normalized.endsWith(".png") ||
    normalized.endsWith(".webp")
  );
}

export function validateAvatarSourceFileMeta(file: File): string | null {
  const mime = file.type.trim().toLowerCase();

  if (!AVATAR_ALLOWED_MIME_TYPES.has(mime) || !hasAllowedExtension(file.name)) {
    return AVATAR_ERROR_MESSAGES.unsupportedFormat;
  }

  if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
    return AVATAR_ERROR_MESSAGES.fileTooLarge;
  }

  return null;
}

export async function validateAvatarSourceFile(file: File): Promise<string | null> {
  const metaError = validateAvatarSourceFileMeta(file);

  if (metaError) {
    return metaError;
  }

  try {
    await loadAvatarSourceDimensions(file);
    return null;
  } catch {
    return AVATAR_ERROR_MESSAGES.readFailed;
  }
}

export async function loadAvatarSourceDimensions(
  file: File,
): Promise<{ width: number; height: number }> {
  const bitmap = await loadOrientedImageBitmap(file);

  try {
    if (bitmap.width <= 0 || bitmap.height <= 0) {
      throw new Error("invalid_dimensions");
    }

    return {
      width: bitmap.width,
      height: bitmap.height,
    };
  } finally {
    bitmap.close();
  }
}

export async function loadOrientedImageBitmap(source: Blob): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(source, {
        imageOrientation: "from-image",
      });
    } catch {
      // Fallback below.
    }
  }

  return loadImageBitmapViaElement(source);
}

async function loadImageBitmapViaElement(source: Blob): Promise<ImageBitmap> {
  const objectUrl = URL.createObjectURL(source);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("image_decode_failed"));
      element.src = objectUrl;
    });

    if (typeof createImageBitmap === "function") {
      return await createImageBitmap(image);
    }

    throw new Error("createImageBitmap_unavailable");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function createOrientedPreviewUrl(source: Blob): Promise<string> {
  const bitmap = await loadOrientedImageBitmap(source);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("canvas_unavailable");
    }

    context.drawImage(bitmap, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (value) {
            resolve(value);
          } else {
            reject(new Error("preview_blob_failed"));
          }
        },
        "image/png",
      );
    });

    return URL.createObjectURL(blob);
  } finally {
    bitmap.close();
  }
}
