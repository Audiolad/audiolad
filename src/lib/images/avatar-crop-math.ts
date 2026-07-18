import {
  AVATAR_OUTPUT_SIZE,
  AVATAR_SQUARE_TOLERANCE_PX,
} from "@/lib/images/avatar-constants";

export type AvatarCropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AvatarCropPoint = {
  x: number;
  y: number;
};

export function computeCoverMinZoom(
  imageWidth: number,
  imageHeight: number,
  cropWidth: number,
  cropHeight: number,
): number {
  if (imageWidth <= 0 || imageHeight <= 0 || cropWidth <= 0 || cropHeight <= 0) {
    return 1;
  }

  return Math.max(cropWidth / imageWidth, cropHeight / imageHeight);
}

export function computeAvatarOutputSize(
  cropWidth: number,
  cropHeight: number,
  maxSize = AVATAR_OUTPUT_SIZE,
): number {
  const shortestSide = Math.min(cropWidth, cropHeight);

  if (!Number.isFinite(shortestSide) || shortestSide <= 0) {
    return maxSize;
  }

  return Math.min(maxSize, Math.round(shortestSide));
}

export function isNearlySquare(
  width: number,
  height: number,
  tolerancePx = AVATAR_SQUARE_TOLERANCE_PX,
): boolean {
  if (width <= 0 || height <= 0) {
    return false;
  }

  return Math.abs(width - height) <= tolerancePx;
}

export function clampCropAreaToImage(
  crop: AvatarCropArea,
  imageWidth: number,
  imageHeight: number,
): AvatarCropArea {
  const width = Math.max(1, Math.min(crop.width, imageWidth));
  const height = Math.max(1, Math.min(crop.height, imageHeight));
  const x = Math.min(Math.max(0, crop.x), Math.max(0, imageWidth - width));
  const y = Math.min(Math.max(0, crop.y), Math.max(0, imageHeight - height));

  return { x, y, width, height };
}

export function restrictCropPosition(
  position: AvatarCropPoint,
  imageWidth: number,
  imageHeight: number,
  cropWidth: number,
  cropHeight: number,
  zoom: number,
): AvatarCropPoint {
  const scaledWidth = imageWidth * zoom;
  const scaledHeight = imageHeight * zoom;
  const maxX = Math.max(0, (scaledWidth - cropWidth) / 2);
  const maxY = Math.max(0, (scaledHeight - cropHeight) / 2);

  return {
    x: Math.min(Math.max(position.x, -maxX), maxX),
    y: Math.min(Math.max(position.y, -maxY), maxY),
  };
}
