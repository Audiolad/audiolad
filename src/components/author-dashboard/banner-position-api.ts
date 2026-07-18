"use client";

import {
  getDefaultBannerPosition,
  normalizeStoredBannerPosition,
  type BannerPosition,
} from "@/lib/authors/banner-position";

export async function saveBannerPosition({
  authorId,
  position,
}: {
  authorId: string;
  position: BannerPosition;
}) {
  const response = await fetch("/api/author/profile/banner-position", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      author_id: authorId,
      banner_position_x: position.x,
      banner_position_y: position.y,
    }),
  });

  if (!response.ok) {
    throw new Error("save_failed");
  }

  const payload = (await response.json()) as {
    banner_position_x?: unknown;
    banner_position_y?: unknown;
  };

  return {
    position: normalizeStoredBannerPosition({
      banner_position_x: payload.banner_position_x,
      banner_position_y: payload.banner_position_y,
    }),
  };
}

export { getDefaultBannerPosition };
