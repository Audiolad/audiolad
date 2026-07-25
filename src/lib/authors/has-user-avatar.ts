import { AUTHOR_DEFAULT_AVATAR_PATH } from "@/lib/authors/brand-assets";
import { hasFixtureMarker } from "@/lib/fixtures/test-fixture-marker";
import { parseImageManifest } from "@/lib/images/image-manifest";

export type AuthorAvatarFields = {
  avatar_url?: string | null;
  avatar_path?: string | null;
  avatar_image?: unknown;
};

function isBrandDefaultAvatarReference(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  if (normalized === AUTHOR_DEFAULT_AVATAR_PATH.toLowerCase()) {
    return true;
  }

  return (
    normalized.endsWith("/brand/author-default-avatar.png") ||
    normalized.includes("author-default-avatar")
  );
}

/**
 * True only when the author has uploaded a real avatar.
 * Brand fallback / placeholder / fixture avatars do not count.
 */
export function hasUserAuthorAvatar(fields: AuthorAvatarFields): boolean {
  if (hasFixtureMarker(fields.avatar_image)) {
    return false;
  }

  const manifest = parseImageManifest(fields.avatar_image);

  if (manifest) {
    const variantPaths = Object.values(manifest.variants ?? {})
      .map((variant) => variant?.path?.trim() ?? "")
      .filter(Boolean);

    if (variantPaths.some((path) => !isBrandDefaultAvatarReference(path))) {
      return true;
    }

    if (
      manifest.originalPath?.trim() &&
      !isBrandDefaultAvatarReference(manifest.originalPath)
    ) {
      return true;
    }
  }

  const avatarPath =
    typeof fields.avatar_path === "string" ? fields.avatar_path.trim() : "";

  if (avatarPath && !isBrandDefaultAvatarReference(avatarPath)) {
    return true;
  }

  const avatarUrl =
    typeof fields.avatar_url === "string" ? fields.avatar_url.trim() : "";

  if (avatarUrl && !isBrandDefaultAvatarReference(avatarUrl)) {
    return true;
  }

  return false;
}
