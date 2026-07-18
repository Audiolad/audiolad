import type { ImageProfile, ImageVariantKey } from "@/lib/images/image-types";

export function buildVariantFileName(key: ImageVariantKey): string {
  return `${key}.webp`;
}

export function buildPracticeCoverVariantBasePath(
  practiceId: string,
  versionId: string,
): string {
  return `practices/${practiceId}/variants/${versionId}`;
}

export function buildPracticeCoverVariantPath(
  practiceId: string,
  versionId: string,
  key: ImageVariantKey,
): string {
  return `${buildPracticeCoverVariantBasePath(practiceId, versionId)}/${buildVariantFileName(key)}`;
}

export function buildPracticeCoverOriginalPath(
  practiceId: string,
  versionId: string,
  extension: "jpg" | "png" | "webp",
): string {
  return `${buildPracticeCoverVariantBasePath(practiceId, versionId)}/original.${extension}`;
}

export function buildTrackCoverVariantBasePath(
  practiceId: string,
  audioItemId: string,
  versionId: string,
): string {
  return `practices/${practiceId}/track-covers/${audioItemId}/variants/${versionId}`;
}

export function buildTrackCoverVariantPath(
  practiceId: string,
  audioItemId: string,
  versionId: string,
  key: ImageVariantKey,
): string {
  return `${buildTrackCoverVariantBasePath(practiceId, audioItemId, versionId)}/${buildVariantFileName(key)}`;
}

export function buildTrackCoverOriginalPath(
  practiceId: string,
  audioItemId: string,
  versionId: string,
  extension: "jpg" | "png" | "webp",
): string {
  return `${buildTrackCoverVariantBasePath(practiceId, audioItemId, versionId)}/original.${extension}`;
}

export function buildAuthorAssetVariantBasePath(
  authorId: string,
  kind: "avatar" | "banner",
  versionId: string,
): string {
  return `authors/${authorId}/${kind}/variants/${versionId}`;
}

export function buildAuthorAssetVariantPath(
  authorId: string,
  kind: "avatar" | "banner",
  versionId: string,
  key: ImageVariantKey,
): string {
  return `${buildAuthorAssetVariantBasePath(authorId, kind, versionId)}/${buildVariantFileName(key)}`;
}

export function buildAuthorAssetOriginalPath(
  authorId: string,
  kind: "avatar" | "banner",
  versionId: string,
  extension: "jpg" | "png" | "webp",
): string {
  return `${buildAuthorAssetVariantBasePath(authorId, kind, versionId)}/original.${extension}`;
}

export function buildUserAvatarVariantBasePath(
  userId: string,
  versionId: string,
): string {
  return `${userId}/variants/${versionId}`;
}

export function buildUserAvatarVariantPath(
  userId: string,
  versionId: string,
  key: ImageVariantKey,
): string {
  return `${buildUserAvatarVariantBasePath(userId, versionId)}/${buildVariantFileName(key)}`;
}

export function buildUserAvatarOriginalPath(
  userId: string,
  versionId: string,
  extension: "jpg" | "png" | "webp",
): string {
  return `${buildUserAvatarVariantBasePath(userId, versionId)}/original.${extension}`;
}

export function buildPlaylistCoverVariantBasePath(
  userId: string,
  playlistId: string,
  versionId: string,
): string {
  return `${userId}/${playlistId}/variants/${versionId}`;
}

export function buildPlaylistCoverVariantPath(
  userId: string,
  playlistId: string,
  versionId: string,
  key: ImageVariantKey,
): string {
  return `${buildPlaylistCoverVariantBasePath(userId, playlistId, versionId)}/${buildVariantFileName(key)}`;
}

export function buildPlaylistCoverOriginalPath(
  userId: string,
  playlistId: string,
  versionId: string,
  extension: "jpg" | "png" | "webp",
): string {
  return `${buildPlaylistCoverVariantBasePath(userId, playlistId, versionId)}/original.${extension}`;
}

export function buildVariantPathsForProfile(
  profile: ImageProfile,
  processed: {
    versionId: string;
    originalExtension: "jpg" | "png" | "webp";
    variants: Array<{ key: ImageVariantKey }>;
  },
  context: {
    practiceId?: string;
    audioItemId?: string;
    authorId?: string;
    authorKind?: "avatar" | "banner";
    userId?: string;
    playlistId?: string;
  },
): {
  originalPath?: string;
  variantPaths: Partial<Record<ImageVariantKey, string>>;
} {
  const variantPaths: Partial<Record<ImageVariantKey, string>> = {};
  let originalPath: string | undefined;

  const assign = (key: ImageVariantKey, path: string) => {
    variantPaths[key] = path;
  };

  switch (profile) {
    case "product-cover": {
      const { practiceId, versionId, originalExtension } = {
        practiceId: context.practiceId!,
        versionId: processed.versionId,
        originalExtension: processed.originalExtension,
      };
      originalPath = buildPracticeCoverOriginalPath(
        practiceId,
        versionId,
        originalExtension,
      );
      for (const variant of processed.variants) {
        assign(
          variant.key,
          buildPracticeCoverVariantPath(practiceId, versionId, variant.key),
        );
      }
      break;
    }
    case "track-cover": {
      const practiceId = context.practiceId!;
      const audioItemId = context.audioItemId!;
      const { versionId, originalExtension } = processed;
      originalPath = buildTrackCoverOriginalPath(
        practiceId,
        audioItemId,
        versionId,
        originalExtension,
      );
      for (const variant of processed.variants) {
        assign(
          variant.key,
          buildTrackCoverVariantPath(
            practiceId,
            audioItemId,
            versionId,
            variant.key,
          ),
        );
      }
      break;
    }
    case "author-avatar":
    case "author-banner": {
      const authorId = context.authorId!;
      const kind = context.authorKind!;
      const { versionId, originalExtension } = processed;
      originalPath = buildAuthorAssetOriginalPath(
        authorId,
        kind,
        versionId,
        originalExtension,
      );
      for (const variant of processed.variants) {
        assign(
          variant.key,
          buildAuthorAssetVariantPath(authorId, kind, versionId, variant.key),
        );
      }
      break;
    }
    case "user-avatar": {
      const userId = context.userId!;
      const { versionId, originalExtension } = processed;
      originalPath = buildUserAvatarOriginalPath(
        userId,
        versionId,
        originalExtension,
      );
      for (const variant of processed.variants) {
        assign(
          variant.key,
          buildUserAvatarVariantPath(userId, versionId, variant.key),
        );
      }
      break;
    }
    case "playlist-cover": {
      const userId = context.userId!;
      const playlistId = context.playlistId!;
      const { versionId, originalExtension } = processed;
      originalPath = buildPlaylistCoverOriginalPath(
        userId,
        playlistId,
        versionId,
        originalExtension,
      );
      for (const variant of processed.variants) {
        assign(
          variant.key,
          buildPlaylistCoverVariantPath(
            userId,
            playlistId,
            versionId,
            variant.key,
          ),
        );
      }
      break;
    }
    default:
      break;
  }

  return { originalPath, variantPaths };
}
