import {
  AVATAR_ALLOWED_MIME_TYPES,
  AVATAR_ERROR_MESSAGES,
  AVATAR_MAX_BYTES,
} from "@/lib/images/avatar-constants";

const HEIC_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

function inferMimeFromFileName(fileName: string): string | null {
  const normalized = fileName.trim().toLowerCase();

  if (
    normalized.endsWith(".jpg") ||
    normalized.endsWith(".jpeg") ||
    normalized.endsWith(".jpe")
  ) {
    return "image/jpeg";
  }

  if (normalized.endsWith(".png")) {
    return "image/png";
  }

  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }

  if (normalized.endsWith(".heic")) {
    return "image/heic";
  }

  if (normalized.endsWith(".heif")) {
    return "image/heif";
  }

  return null;
}

export function isHeicLikeFile(file: Pick<File, "name" | "type">): boolean {
  const mime = file.type.trim().toLowerCase();
  const inferred = inferMimeFromFileName(file.name);

  return (
    HEIC_MIME_TYPES.has(mime) ||
    inferred === "image/heic" ||
    inferred === "image/heif"
  );
}

export function resolveAvatarSourceMime(file: Pick<File, "name" | "type">): string | null {
  const mime = file.type.trim().toLowerCase();

  if (AVATAR_ALLOWED_MIME_TYPES.has(mime)) {
    return mime;
  }

  const inferred = inferMimeFromFileName(file.name);

  if (inferred && AVATAR_ALLOWED_MIME_TYPES.has(inferred)) {
    return inferred;
  }

  return null;
}

export function validateAvatarSourceFileMeta(file: File): string | null {
  if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
    return AVATAR_ERROR_MESSAGES.fileTooLarge;
  }

  if (resolveAvatarSourceMime(file)) {
    return null;
  }

  if (isHeicLikeFile(file)) {
    return null;
  }

  return AVATAR_ERROR_MESSAGES.unsupportedFormat;
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
    if (isHeicLikeFile(file)) {
      return AVATAR_ERROR_MESSAGES.heicUnsupported;
    }

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

    const blob = await canvasToPreviewBlob(context.canvas);

    return URL.createObjectURL(blob);
  } finally {
    bitmap.close();
  }
}

async function canvasToPreviewBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const attempts: Array<{ type: string; quality?: number }> = [
    { type: "image/png" },
    { type: "image/jpeg", quality: 0.92 },
    { type: "image/webp", quality: 0.9 },
  ];

  for (const attempt of attempts) {
    const blob = await tryCanvasToBlob(canvas, attempt.type, attempt.quality);

    if (blob) {
      return blob;
    }
  }

  throw new Error("preview_blob_failed");
}

function tryCanvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (value) => resolve(value),
      type,
      quality,
    );
  });
}
