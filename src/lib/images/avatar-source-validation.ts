import {
  AVATAR_ERROR_MESSAGES,
  AVATAR_MAX_INPUT_PIXELS,
  AVATAR_MAX_SOURCE_BYTES,
  AVATAR_MAX_SOURCE_DIMENSION,
  AVATAR_SOURCE_MIME_TYPES,
} from "@/lib/images/avatar-constants";
import {
  detectImageKindFromBytes,
  isAvatarSourceImageKind,
  isBannedAvatarImageKind,
} from "@/lib/images/image-magic";

const VIDEO_EXTENSIONS = [".mov", ".mp4", ".m4v", ".webm", ".avi", ".mkv"];
const VIDEO_MIME_PREFIXES = ["video/"];
const GIF_EXTENSIONS = [".gif"];
const SVG_EXTENSIONS = [".svg", ".svgz"];

function inferKindFromFileName(fileName: string): string | null {
  const normalized = fileName.trim().toLowerCase();

  if (
    normalized.endsWith(".jpg") ||
    normalized.endsWith(".jpeg") ||
    normalized.endsWith(".jpe") ||
    normalized.endsWith(".jfif")
  ) {
    return "image/jpeg";
  }

  if (normalized.endsWith(".png")) {
    return "image/png";
  }

  if (normalized.endsWith(".webp")) {
    return "image/webp";
  }

  if (normalized.endsWith(".avif")) {
    return "image/avif";
  }

  if (normalized.endsWith(".heic")) {
    return "image/heic";
  }

  if (normalized.endsWith(".heif")) {
    return "image/heif";
  }

  if (GIF_EXTENSIONS.some((ext) => normalized.endsWith(ext))) {
    return "image/gif";
  }

  if (SVG_EXTENSIONS.some((ext) => normalized.endsWith(ext))) {
    return "image/svg+xml";
  }

  if (VIDEO_EXTENSIONS.some((ext) => normalized.endsWith(ext))) {
    return "video";
  }

  return null;
}

function isVideoLikeFile(file: Pick<File, "name" | "type">): boolean {
  const mime = file.type.trim().toLowerCase();
  const inferred = inferKindFromFileName(file.name);

  return (
    VIDEO_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix)) ||
    inferred === "video"
  );
}

export function isHeicLikeFile(file: Pick<File, "name" | "type">): boolean {
  const mime = file.type.trim().toLowerCase();
  const inferred = inferKindFromFileName(file.name);

  return (
    mime === "image/heic" ||
    mime === "image/heif" ||
    mime === "image/heic-sequence" ||
    mime === "image/heif-sequence" ||
    inferred === "image/heic" ||
    inferred === "image/heif"
  );
}

export function resolveAvatarSourceMime(file: Pick<File, "name" | "type">): string | null {
  const mime = file.type.trim().toLowerCase();

  if (AVATAR_SOURCE_MIME_TYPES.has(mime)) {
    return mime === "image/jpg" || mime === "image/pjpeg" ? "image/jpeg" : mime;
  }

  const inferred = inferKindFromFileName(file.name);

  if (inferred && inferred !== "video" && inferred !== "image/gif" && inferred !== "image/svg+xml") {
    return inferred;
  }

  return null;
}

export function validateAvatarSourceFileMeta(file: Pick<File, "name" | "type" | "size">): string | null {
  if (file.size <= 0) {
    return AVATAR_ERROR_MESSAGES.notImage;
  }

  if (file.size > AVATAR_MAX_SOURCE_BYTES) {
    return AVATAR_ERROR_MESSAGES.fileTooLarge;
  }

  if (isVideoLikeFile(file)) {
    return AVATAR_ERROR_MESSAGES.choosePhoto;
  }

  const inferred = inferKindFromFileName(file.name);

  if (inferred === "image/gif" || inferred === "image/svg+xml") {
    return AVATAR_ERROR_MESSAGES.notImage;
  }

  return null;
}

export async function peekAvatarSourceKind(
  file: File,
): Promise<ReturnType<typeof detectImageKindFromBytes>> {
  const header = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  return detectImageKindFromBytes(header);
}

export async function validateAvatarSourceFile(file: File): Promise<string | null> {
  const metaError = validateAvatarSourceFileMeta(file);

  if (metaError) {
    return metaError;
  }

  try {
    const kind = await peekAvatarSourceKind(file);

    if (isBannedAvatarImageKind(kind)) {
      return kind === "video"
        ? AVATAR_ERROR_MESSAGES.choosePhoto
        : AVATAR_ERROR_MESSAGES.notImage;
    }

    if (!kind) {
      return AVATAR_ERROR_MESSAGES.notImage;
    }

    if (!isAvatarSourceImageKind(kind)) {
      return AVATAR_ERROR_MESSAGES.notImage;
    }
  } catch {
    return AVATAR_ERROR_MESSAGES.notImage;
  }

  return null;
}

export class AvatarSourceResolutionError extends Error {
  constructor() {
    super(AVATAR_ERROR_MESSAGES.resolutionTooLarge);
    this.name = "AvatarSourceResolutionError";
  }
}

export function avatarSourceBoundsError(
  width: number,
  height: number,
): string | null {
  if (width <= 0 || height <= 0) {
    return AVATAR_ERROR_MESSAGES.notImage;
  }

  if (
    width > AVATAR_MAX_SOURCE_DIMENSION ||
    height > AVATAR_MAX_SOURCE_DIMENSION ||
    width * height > AVATAR_MAX_INPUT_PIXELS
  ) {
    return AVATAR_ERROR_MESSAGES.resolutionTooLarge;
  }

  return null;
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
    const boundsError = avatarSourceBoundsError(bitmap.width, bitmap.height);

    if (boundsError) {
      throw new AvatarSourceResolutionError();
    }

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
    { type: "image/jpeg", quality: 0.92 },
    { type: "image/webp", quality: 0.9 },
    { type: "image/png" },
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
