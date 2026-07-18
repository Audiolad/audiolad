import type { Area } from "react-easy-crop";

import {
  AVATAR_JPEG_QUALITY,
  AVATAR_OUTPUT_SIZE,
  AVATAR_WEBP_QUALITY,
} from "@/lib/images/avatar-constants";
import {
  clampCropAreaToImage,
  computeAvatarOutputSize,
  type AvatarCropArea,
} from "@/lib/images/avatar-crop-math";
import { loadOrientedImageBitmap } from "@/lib/images/avatar-source-validation";

export type AvatarCropOutput = {
  blob: Blob;
  fileName: string;
  mimeType: "image/webp" | "image/png" | "image/jpeg";
  width: number;
  height: number;
  hasAlpha: boolean;
};

function detectAlphaChannel(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  const { data } = context.getImageData(0, 0, width, height);

  for (let index = 3; index < data.length; index += 4) {
    if (data[index]! < 255) {
      return true;
    }
  }

  return false;
}

function chooseOutputMimeType(
  sourceMime: string,
  hasAlpha: boolean,
): AvatarCropOutput["mimeType"] {
  if (hasAlpha) {
    return "image/webp";
  }

  if (sourceMime === "image/png") {
    return "image/webp";
  }

  return "image/webp";
}

function buildOutputFileName(mimeType: AvatarCropOutput["mimeType"]): string {
  switch (mimeType) {
    case "image/png":
      return "avatar.png";
    case "image/jpeg":
      return "avatar.jpg";
    default:
      return "avatar.webp";
  }
}

export async function cropAvatarToBlob(
  source: Blob,
  cropArea: Area,
  options?: {
    sourceMime?: string;
    maxOutputSize?: number;
  },
): Promise<AvatarCropOutput> {
  const bitmap = await loadOrientedImageBitmap(source);
  const sourceMime = options?.sourceMime?.trim().toLowerCase() ?? source.type;

  try {
    const pixelCrop = clampCropAreaToImage(
      {
        x: Math.round(cropArea.x),
        y: Math.round(cropArea.y),
        width: Math.round(cropArea.width),
        height: Math.round(cropArea.height),
      },
      bitmap.width,
      bitmap.height,
    );

    const outputSize = computeAvatarOutputSize(
      pixelCrop.width,
      pixelCrop.height,
      options?.maxOutputSize ?? AVATAR_OUTPUT_SIZE,
    );

    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;

    const context = canvas.getContext("2d", { alpha: true });

    if (!context) {
      throw new Error("canvas_unavailable");
    }

    context.clearRect(0, 0, outputSize, outputSize);
    context.drawImage(
      bitmap,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      outputSize,
      outputSize,
    );

    const hasAlpha =
      sourceMime === "image/png" &&
      detectAlphaChannel(context, outputSize, outputSize);
    const mimeType = chooseOutputMimeType(sourceMime, hasAlpha);
    const quality =
      mimeType === "image/jpeg" ? AVATAR_JPEG_QUALITY : AVATAR_WEBP_QUALITY / 100;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => {
          if (value) {
            resolve(value);
          } else {
            reject(new Error("crop_blob_failed"));
          }
        },
        mimeType,
        quality,
      );
    });

    return {
      blob,
      fileName: buildOutputFileName(mimeType),
      mimeType,
      width: outputSize,
      height: outputSize,
      hasAlpha,
    };
  } finally {
    bitmap.close();
  }
}

export function areaToAvatarCrop(area: Area): AvatarCropArea {
  return {
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
  };
}
