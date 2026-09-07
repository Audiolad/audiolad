export type DetectedImageKind =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/svg+xml"
  | "image/avif"
  | "image/heic"
  | "image/heif"
  | "video";

const MAGIC_JPEG = [0xff, 0xd8, 0xff] as const;
const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47] as const;
const MAGIC_GIF = [0x47, 0x49, 0x46, 0x38] as const;

const HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
]);

const HEIF_BRANDS = new Set(["mif1", "msf1", "heif", "miaf"]);
const AVIF_BRANDS = new Set(["avif", "avis", "avio"]);
const VIDEO_BRANDS = new Set([
  "qt  ",
  "isom",
  "iso2",
  "mp41",
  "mp42",
  "mmp4",
  "avc1",
  "3gp4",
  "3g2a",
]);

function bytesEqual(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  if (bytes.length < offset + expected.length) {
    return false;
  }

  return expected.every((value, index) => bytes[offset + index] === value);
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) {
    return "";
  }

  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readFtypBrands(bytes: Uint8Array): string[] {
  if (bytes.length < 12 || readAscii(bytes, 4, 4) !== "ftyp") {
    return [];
  }

  const brands = [readAscii(bytes, 8, 4)];
  const boxSize = bytes.length >= 4 ? (bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]! : 0;
  const end = boxSize > 0 ? Math.min(bytes.length, boxSize) : Math.min(bytes.length, 64);

  for (let index = 16; index + 4 <= end; index += 4) {
    brands.push(readAscii(bytes, index, 4));
  }

  return brands.filter(Boolean);
}

export function detectImageKindFromBytes(bytes: Uint8Array): DetectedImageKind | null {
  if (bytesEqual(bytes, 0, MAGIC_JPEG)) {
    return "image/jpeg";
  }

  if (bytesEqual(bytes, 0, MAGIC_PNG)) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    readAscii(bytes, 0, 4) === "RIFF" &&
    readAscii(bytes, 8, 4) === "WEBP"
  ) {
    return "image/webp";
  }

  if (bytesEqual(bytes, 0, MAGIC_GIF)) {
    return "image/gif";
  }

  const head = new TextDecoder("utf-8", { fatal: false })
    .decode(bytes.subarray(0, Math.min(bytes.length, 256)))
    .toLowerCase();

  if (head.includes("<svg") || (head.includes("<?xml") && head.includes("svg"))) {
    return "image/svg+xml";
  }

  const brands = readFtypBrands(bytes);

  if (brands.length > 0) {
    if (brands.some((brand) => AVIF_BRANDS.has(brand))) {
      return "image/avif";
    }

    if (brands.some((brand) => HEIC_BRANDS.has(brand))) {
      return "image/heic";
    }

    if (brands.some((brand) => HEIF_BRANDS.has(brand))) {
      return "image/heif";
    }

    if (brands.some((brand) => VIDEO_BRANDS.has(brand))) {
      return "video";
    }
  }

  return null;
}

export function isAvatarSourceImageKind(kind: DetectedImageKind | null): boolean {
  return (
    kind === "image/jpeg" ||
    kind === "image/png" ||
    kind === "image/webp" ||
    kind === "image/avif" ||
    kind === "image/heic" ||
    kind === "image/heif"
  );
}

export function isBannedAvatarImageKind(kind: DetectedImageKind | null): boolean {
  return kind === "image/gif" || kind === "image/svg+xml" || kind === "video";
}

function readUint16Be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

export function readJpegSofDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  let offset = 2;

  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1] ?? 0;

    if (marker === 0xd8 || marker === 0xd9 || marker === 0x00) {
      offset += 2;
      continue;
    }

    const size = readUint16Be(bytes, offset + 2);

    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (offset + 8 >= bytes.length) {
        return null;
      }

      const height = readUint16Be(bytes, offset + 5);
      const width = readUint16Be(bytes, offset + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }

    if (size < 2) {
      return null;
    }

    offset += 2 + size;
  }

  return null;
}

export function readPngIhdrDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < 24 || readAscii(bytes, 12, 4) !== "IHDR") {
    return null;
  }

  const width = readUint32Be(bytes, 16);
  const height = readUint32Be(bytes, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** Largest ispe box — primary frame, not the thumbnail. No pixel decode. */
export function readHeifIspeDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  let best: { width: number; height: number } | null = null;

  for (let cursor = 0; cursor + 16 <= bytes.length; cursor += 1) {
    if (
      bytes[cursor] !== 0x69 ||
      bytes[cursor + 1] !== 0x73 ||
      bytes[cursor + 2] !== 0x70 ||
      bytes[cursor + 3] !== 0x65
    ) {
      continue;
    }

    const width = readUint32Be(bytes, cursor + 8);
    const height = readUint32Be(bytes, cursor + 12);

    if (
      width > 0 &&
      height > 0 &&
      width <= 1_000_000 &&
      height <= 1_000_000 &&
      (!best || width * height > best.width * best.height)
    ) {
      best = { width, height };
    }
  }

  return best;
}

export function peekImageHeaderDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const kind = detectImageKindFromBytes(bytes);

  if (kind === "image/jpeg") {
    return readJpegSofDimensions(bytes);
  }

  if (kind === "image/png") {
    return readPngIhdrDimensions(bytes);
  }

  if (kind === "image/heic" || kind === "image/heif") {
    return readHeifIspeDimensions(bytes);
  }

  return null;
}
