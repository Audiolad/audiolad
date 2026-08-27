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

export function buildPublicationGalleryVariantBasePath(
  practiceId: string,
  slideId: string,
  versionId: string,
): string {
  return `practices/${practiceId}/gallery/${slideId}/variants/${versionId}`;
}

export function buildPublicationGalleryVariantPath(
  practiceId: string,
  slideId: string,
  versionId: string,
  key: ImageVariantKey,
): string {
  return `${buildPublicationGalleryVariantBasePath(practiceId, slideId, versionId)}/${buildVariantFileName(key)}`;
}

export function buildPublicationGalleryOriginalPath(
  practiceId: string,
  slideId: string,
  versionId: string,
  extension: "jpg" | "png" | "webp",
): string {
  return `${buildPublicationGalleryVariantBasePath(practiceId, slideId, versionId)}/original.${extension}`;
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

export function buildAuthorContactIconVariantBasePath(
  authorId: string,
  contactId: string,
  versionId: string,
): string {
  return `authors/${authorId}/contacts/${contactId}/variants/${versionId}`;
}

export function buildAuthorContactIconVariantPath(
  authorId: string,
  contactId: string,
  versionId: string,
  key: ImageVariantKey,
): string {
  return `${buildAuthorContactIconVariantBasePath(authorId, contactId, versionId)}/${buildVariantFileName(key)}`;
}

export function buildAuthorContactIconOriginalPath(
  authorId: string,
  contactId: string,
  versionId: string,
  extension: "jpg" | "png" | "webp",
): string {
  return `${buildAuthorContactIconVariantBasePath(authorId, contactId, versionId)}/original.${extension}`;
}

export function buildQuickOfferAssetVariantBasePath(
  authorId: string,
  offerId: string,
  kind: "hero" | "material",
  versionId: string,
  materialId?: string,
): string {
  if (kind === "material" && materialId) {
    return `authors/${authorId}/quick-offers/${offerId}/materials/${materialId}/variants/${versionId}`;
  }

  return `authors/${authorId}/quick-offers/${offerId}/${kind}/variants/${versionId}`;
}

export function buildQuickOfferAssetVariantPath(
  authorId: string,
  offerId: string,
  kind: "hero" | "material",
  versionId: string,
  key: ImageVariantKey,
  materialId?: string,
): string {
  return `${buildQuickOfferAssetVariantBasePath(authorId, offerId, kind, versionId, materialId)}/${buildVariantFileName(key)}`;
}

export function buildQuickOfferAssetOriginalPath(
  authorId: string,
  offerId: string,
  kind: "hero" | "material",
  versionId: string,
  extension: "jpg" | "png" | "webp",
  materialId?: string,
): string {
  return `${buildQuickOfferAssetVariantBasePath(authorId, offerId, kind, versionId, materialId)}/original.${extension}`;
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
    slideId?: string;
    audioItemId?: string;
    authorId?: string;
    authorKind?: "avatar" | "banner";
    contactId?: string;
    userId?: string;
    playlistId?: string;
    offerId?: string;
    offerAssetKind?: "hero" | "material";
    materialId?: string;
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
    case "product-gallery": {
      const practiceId = context.practiceId!;
      const slideId = context.slideId!;
      const { versionId, originalExtension } = processed;
      originalPath = buildPublicationGalleryOriginalPath(
        practiceId,
        slideId,
        versionId,
        originalExtension,
      );
      for (const variant of processed.variants) {
        assign(
          variant.key,
          buildPublicationGalleryVariantPath(
            practiceId,
            slideId,
            versionId,
            variant.key,
          ),
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
    case "author-contact-icon": {
      const authorId = context.authorId!;
      const contactId = context.contactId!;
      const { versionId, originalExtension } = processed;
      originalPath = buildAuthorContactIconOriginalPath(
        authorId,
        contactId,
        versionId,
        originalExtension,
      );
      for (const variant of processed.variants) {
        assign(
          variant.key,
          buildAuthorContactIconVariantPath(
            authorId,
            contactId,
            versionId,
            variant.key,
          ),
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
    case "quick-offer-hero":
    case "quick-offer-card": {
      const authorId = context.authorId!;
      const offerId = context.offerId!;
      const kind = context.offerAssetKind ?? (profile === "quick-offer-card" ? "material" : "hero");
      const materialId = context.materialId;
      const { versionId, originalExtension } = processed;
      originalPath = buildQuickOfferAssetOriginalPath(
        authorId,
        offerId,
        kind,
        versionId,
        originalExtension,
        materialId,
      );
      for (const variant of processed.variants) {
        assign(
          variant.key,
          buildQuickOfferAssetVariantPath(
            authorId,
            offerId,
            kind,
            versionId,
            variant.key,
            materialId,
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
