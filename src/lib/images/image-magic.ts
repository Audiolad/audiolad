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
