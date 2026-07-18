export const DEFAULT_BANNER_POSITION_X = 50;
export const DEFAULT_BANNER_POSITION_Y = 50;

export type BannerPosition = { x: number; y: number };
export type BannerCoverExcess = { excessX: number; excessY: number };

export function formatBannerObjectPosition(position: BannerPosition): string {
  return `${position.x}% ${position.y}%`;
}

export function isFiniteBannerPositionNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseBannerPositionCoordinate(value: unknown): number | null {
  if (!isFiniteBannerPositionNumber(value)) return null;
  return value;
}

export function parseStoredBannerPositionCoordinate(value: unknown): number | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }
  return parseBannerPositionCoordinate(value);
}

export function clampBannerPositionCoordinate(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function getDefaultBannerPosition(): BannerPosition {
  return { x: DEFAULT_BANNER_POSITION_X, y: DEFAULT_BANNER_POSITION_Y };
}

export function normalizeBannerPositionPair(x: unknown, y: unknown): BannerPosition | null {
  const parsedX = parseBannerPositionCoordinate(x);
  const parsedY = parseBannerPositionCoordinate(y);
  if (parsedX === null || parsedY === null) return null;
  if (parsedX < 0 || parsedX > 100 || parsedY < 0 || parsedY > 100) return null;
  return { x: parsedX, y: parsedY };
}

export function normalizeStoredBannerPosition(row: {
  banner_position_x?: unknown;
  banner_position_y?: unknown;
}): BannerPosition {
  const parsedX = parseStoredBannerPositionCoordinate(row.banner_position_x);
  const parsedY = parseStoredBannerPositionCoordinate(row.banner_position_y);
  return {
    x: parsedX === null ? DEFAULT_BANNER_POSITION_X : clampBannerPositionCoordinate(parsedX),
    y: parsedY === null ? DEFAULT_BANNER_POSITION_Y : clampBannerPositionCoordinate(parsedY),
  };
}

export function computeBannerCoverExcess(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): BannerCoverExcess {
  if (containerWidth <= 0 || containerHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { excessX: 0, excessY: 0 };
  }
  const containerAspect = containerWidth / containerHeight;
  const imageAspect = imageWidth / imageHeight;
  if (imageAspect > containerAspect) {
    const renderedWidth = containerHeight * imageAspect;
    return { excessX: Math.max(0, renderedWidth - containerWidth), excessY: 0 };
  }
  const renderedHeight = containerWidth / imageAspect;
  return { excessX: 0, excessY: Math.max(0, renderedHeight - containerHeight) };
}

export function clampBannerPositionToCoverExcess(
  position: BannerPosition,
  excess: BannerCoverExcess,
): BannerPosition {
  return {
    x: excess.excessX > 0 ? clampBannerPositionCoordinate(position.x) : DEFAULT_BANNER_POSITION_X,
    y: excess.excessY > 0 ? clampBannerPositionCoordinate(position.y) : DEFAULT_BANNER_POSITION_Y,
  };
}

export function applyBannerPositionDragDelta(
  position: BannerPosition,
  deltaX: number,
  deltaY: number,
  excess: BannerCoverExcess,
): BannerPosition {
  let nextX = position.x;
  let nextY = position.y;
  if (excess.excessX > 0) nextX = position.x - (deltaX / excess.excessX) * 100;
  if (excess.excessY > 0) nextY = position.y - (deltaY / excess.excessY) * 100;
  return clampBannerPositionToCoverExcess({ x: nextX, y: nextY }, excess);
}

export function createManagedObjectUrl(file: File, currentUrl: string | null): string {
  if (currentUrl) URL.revokeObjectURL(currentUrl);
  return URL.createObjectURL(file);
}

export function revokeManagedObjectUrl(url: string | null): void {
  if (url) URL.revokeObjectURL(url);
}
