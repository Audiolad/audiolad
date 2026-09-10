import {
  canUseMusicInStudio,
  isStudioMusicPublication,
} from "@/lib/studio-music/access";

export const STUDIO_CATALOG_ASSET_SOURCE = "catalog" as const;

export const CATALOG_MUSIC_RENDER_NOT_AVAILABLE =
  "catalog_music_render_not_available" as const;

export const CATALOG_MUSIC_UNAVAILABLE_MESSAGE =
  "Музыка из каталога недоступна.";

export const CATALOG_MUSIC_RENDER_GUARD_MESSAGE =
  "Экспорт с музыкой из каталога пока недоступен";

export const STUDIO_CATALOG_FORBIDDEN_DTO_KEYS = [
  "audio_path",
  "audio_url",
  "signedUrl",
  "signed_url",
  "storage_path",
  "full_url",
  "service_role",
] as const;

export type StudioCatalogAttachDecision =
  | { ok: true }
  | { ok: false; status: number; code: string };

export type StudioCatalogRefInput = {
  id?: string | null;
  practice_id?: string | null;
  deleted_at?: string | null;
  product_kind?: string | null;
  publication_class?: string | null;
  title?: string | null;
  original_file_name?: string | null;
  duration_seconds?: number | null;
  audio_path?: string | null;
};

export function studioCatalogStreamPath(
  projectId: string,
  assetId: string,
): string {
  return `/api/studio/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/stream`;
}

export function authorizeStudioCatalogUse(input: {
  userId?: string | null;
  entitlement?: { revoked_at?: string | null } | null;
  isAuthorMember?: boolean;
  forPlayback?: boolean;
}): StudioCatalogAttachDecision {
  if (!input.userId) {
    return { ok: false, status: 401, code: "unauthenticated" };
  }
  if (
    canUseMusicInStudio({
      entitlement: input.entitlement,
      isAuthorMember: input.isAuthorMember === true,
    })
  ) {
    return { ok: true };
  }
  return {
    ok: false,
    status: 403,
    code: input.forPlayback
      ? "catalog_music_unavailable"
      : "catalog_music_forbidden",
  };
}

export function authorizeStudioCatalogAttachRefs(input: {
  practiceId: string;
  audioItemId: string;
  practice: StudioCatalogRefInput | null;
  audioItem: StudioCatalogRefInput | null;
}): StudioCatalogAttachDecision {
  if (!input.practice?.id || input.practice.deleted_at) {
    return { ok: false, status: 404, code: "not_found" };
  }
  if (String(input.practice.id) !== input.practiceId) {
    return { ok: false, status: 404, code: "not_found" };
  }
  if (!isStudioMusicPublication(input.practice)) {
    return { ok: false, status: 404, code: "not_found" };
  }
  if (!input.audioItem?.id) {
    return { ok: false, status: 404, code: "not_found" };
  }
  if (String(input.audioItem.id) !== input.audioItemId) {
    return { ok: false, status: 404, code: "not_found" };
  }
  if (
    !input.audioItem.practice_id ||
    String(input.audioItem.practice_id) !== input.practiceId
  ) {
    return { ok: false, status: 422, code: "invalid_catalog_audio_item" };
  }
  const duration = input.audioItem.duration_seconds;
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    return { ok: false, status: 422, code: "invalid_audio_duration" };
  }
  return { ok: true };
}

export function resolveStudioCatalogAssetTitle(
  audioItem: Pick<StudioCatalogRefInput, "title" | "original_file_name">,
): string {
  const title = audioItem.title?.trim();
  if (title) {
    return title;
  }
  const original = audioItem.original_file_name?.trim();
  if (original) {
    return original;
  }
  return "Музыка";
}

export function studioCatalogAssetDtoContainsForbiddenFields(
  value: unknown,
): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => studioCatalogAssetDtoContainsForbiddenFields(item));
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (
      (STUDIO_CATALOG_FORBIDDEN_DTO_KEYS as readonly string[]).includes(key) ||
      /audio_path|signedUrl|storage_path|service_role/i.test(key)
    ) {
      return true;
    }
    if (
      typeof nested === "string" &&
      (/\/storage\/v1\/object/.test(nested) ||
        nested.includes("practice-audio") ||
        nested.includes("studio-draft-assets"))
    ) {
      return true;
    }
    if (studioCatalogAssetDtoContainsForbiddenFields(nested)) {
      return true;
    }
  }
  return false;
}

export function projectHasActiveCatalogMusic(input: {
  tracks: readonly { assetId?: string | null; muted?: boolean; clips?: readonly unknown[] }[];
  assets: readonly { id: string; sourceType?: string | null; source_type?: string | null }[];
}): boolean {
  const catalogIds = new Set(
    input.assets
      .filter(
        (asset) =>
          (asset.sourceType ?? asset.source_type) === STUDIO_CATALOG_ASSET_SOURCE,
      )
      .map((asset) => asset.id),
  );
  return input.tracks.some((track) => {
    if (!track.assetId || !catalogIds.has(track.assetId)) {
      return false;
    }
    return Array.isArray(track.clips) ? track.clips.length > 0 : true;
  });
}

export type StudioByteRange =
  | { kind: "full" }
  | { kind: "partial"; start: number; end: number }
  | { kind: "unsatisfiable" };

export function parseHttpByteRange(
  header: string | null | undefined,
  size: number,
): StudioByteRange {
  if (!Number.isFinite(size) || size <= 0) {
    return { kind: "full" };
  }
  const raw = header?.trim();
  if (!raw) {
    return { kind: "full" };
  }
  const match = /^bytes=(\d*)-(\d*)$/i.exec(raw);
  if (!match) {
    return { kind: "unsatisfiable" };
  }
  const startRaw = match[1];
  const endRaw = match[2];
  if (!startRaw && !endRaw) {
    return { kind: "unsatisfiable" };
  }
  let start: number;
  let end: number;
  if (!startRaw) {
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) {
      return { kind: "unsatisfiable" };
    }
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw ? Number(endRaw) : size - 1;
    if (!Number.isFinite(start) || start < 0 || start >= size) {
      return { kind: "unsatisfiable" };
    }
    if (!Number.isFinite(end) || end < start) {
      return { kind: "unsatisfiable" };
    }
    end = Math.min(end, size - 1);
  }
  return { kind: "partial", start, end };
}

export function studioCatalogPartialContentHeaders(input: {
  start: number;
  end: number;
  size: number;
  mimeType: string;
}): Record<string, string> {
  const length = input.end - input.start + 1;
  return {
    "Accept-Ranges": "bytes",
    "Content-Range": `bytes ${input.start}-${input.end}/${input.size}`,
    "Content-Length": String(length),
    "Content-Type": input.mimeType,
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
}

export function isSameCatalogSelection(input: {
  selectedPracticeId?: string | null;
  selectedAudioItemId?: string | null;
  practiceId: string;
  audioItemId: string;
}): boolean {
  return (
    input.selectedPracticeId === input.practiceId &&
    input.selectedAudioItemId === input.audioItemId
  );
}

export function resolveActiveCatalogMusicSelection(input: {
  slots: readonly { trackKind?: string | null; audioTrackId?: string | null }[];
  tracks: readonly {
    id: string;
    sourceType?: string | null;
    catalogPracticeId?: string | null;
    catalogAudioItemId?: string | null;
  }[];
}): { practiceId: string; audioItemId: string } | null {
  const musicSlot = input.slots.find(
    (slot) => slot.trackKind === "music" && slot.audioTrackId,
  );
  if (!musicSlot?.audioTrackId) {
    return null;
  }
  const track = input.tracks.find((item) => item.id === musicSlot.audioTrackId);
  if (
    !track ||
    track.sourceType !== STUDIO_CATALOG_ASSET_SOURCE ||
    !track.catalogPracticeId ||
    !track.catalogAudioItemId
  ) {
    return null;
  }
  return {
    practiceId: track.catalogPracticeId,
    audioItemId: track.catalogAudioItemId,
  };
}

export function projectTracksBlockCatalogRender(
  tracks: readonly {
    sourceType?: string | null;
    clips?: readonly unknown[];
  }[],
): boolean {
  return tracks.some(
    (track) =>
      track.sourceType === STUDIO_CATALOG_ASSET_SOURCE &&
      Array.isArray(track.clips) &&
      track.clips.length > 0,
  );
}
