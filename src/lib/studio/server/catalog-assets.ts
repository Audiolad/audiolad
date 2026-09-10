import "server-only";

import { requireAuthenticatedUser } from "@/lib/author-products/auth";
import { isStudioMusicPublication } from "@/lib/studio-music/access";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";

import {
  authorizeStudioCatalogAttachRefs,
  authorizeStudioCatalogUse,
  parseHttpByteRange,
  resolveStudioCatalogAssetTitle,
  studioCatalogAssetDtoContainsForbiddenFields,
  studioCatalogPartialContentHeaders,
  studioCatalogStreamPath,
} from "../catalog-asset";
import { toStudioAssetDto, type StudioProjectAssetRow } from "./model";
import { requireStudioProjectAccess } from "./repository";
import { StudioApiError } from "./validation";

const ASSET_SELECT =
  "id, project_id, source_id, storage_path, original_name, mime_type, size_bytes, duration_seconds, source_type, catalog_practice_id, catalog_audio_item_id, upload_state, upload_state_changed_at, pending_source_id, pending_storage_path, pending_size_bytes, pending_original_name, pending_mime_type, pending_reserved_at, created_at, deleted_at";

const PRACTICE_AUDIO_BUCKET = "practice-audio";
const STREAM_SIGN_TTL_SECONDS = 120;

type CatalogPracticeRow = {
  id: string;
  deleted_at: string | null;
  product_kind: string | null;
  publication_class: string | null;
  author_id: string | null;
};

type CatalogAudioItemRow = {
  id: string;
  practice_id: string | null;
  title: string | null;
  original_file_name: string | null;
  duration_seconds: number | null;
  audio_path: string | null;
};

function mapAttachError(error: { message?: string; code?: string }): never {
  const message = (error.message ?? "").toLowerCase();
  if (message.includes("catalog_music_forbidden")) {
    throw new StudioApiError("catalog_music_forbidden", 403);
  }
  if (message.includes("invalid_catalog_audio_item")) {
    throw new StudioApiError("invalid_catalog_audio_item", 422);
  }
  if (message.includes("project_not_found")) {
    throw new StudioApiError("not_found", 404);
  }
  if (message.includes("invalid_asset") || message.includes("invalid_audio")) {
    throw new StudioApiError("invalid_asset", 422);
  }
  console.error("studio_catalog_attach_error", error.message);
  throw new StudioApiError("internal_error", 500);
}

async function canUseCatalogMusic(
  service: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  practiceId: string,
): Promise<boolean> {
  const { data, error } = await service.rpc("can_use_music_in_studio", {
    p_user_id: userId,
    p_practice_id: practiceId,
  });
  if (error) {
    throw new StudioApiError("internal_error", 500);
  }
  return data === true;
}

async function loadCatalogRefs(
  service: ReturnType<typeof createServiceRoleClient>,
  practiceId: string,
  audioItemId: string,
): Promise<{
  practice: CatalogPracticeRow | null;
  audioItem: CatalogAudioItemRow | null;
}> {
  const [practiceResult, audioResult] = await Promise.all([
    service
      .from("practices")
      .select("id, deleted_at, product_kind, publication_class, author_id")
      .eq("id", practiceId)
      .maybeSingle(),
    service
      .from("audio_items")
      .select("id, practice_id, title, original_file_name, duration_seconds, audio_path")
      .eq("id", audioItemId)
      .maybeSingle(),
  ]);
  if (practiceResult.error || audioResult.error) {
    throw new StudioApiError("internal_error", 500);
  }
  return {
    practice: (practiceResult.data ?? null) as CatalogPracticeRow | null,
    audioItem: (audioResult.data ?? null) as CatalogAudioItemRow | null,
  };
}

export async function attachStudioCatalogAsset(input: {
  projectId: string;
  practiceId: string;
  audioItemId: string;
}) {
  const { user } = await requireAuthenticatedUser();
  const { service } = await requireStudioProjectAccess(input.projectId);
  const { practice, audioItem } = await loadCatalogRefs(
    service,
    input.practiceId,
    input.audioItemId,
  );
  const refs = authorizeStudioCatalogAttachRefs({
    practiceId: input.practiceId,
    audioItemId: input.audioItemId,
    practice,
    audioItem,
  });
  if (!refs.ok) {
    throw new StudioApiError(refs.code, refs.status);
  }

  const canUse = await canUseCatalogMusic(service, user.id, input.practiceId);
  const access = authorizeStudioCatalogUse({
    userId: user.id,
    isAuthorMember: canUse,
  });
  if (!access.ok) {
    throw new StudioApiError(access.code, access.status);
  }

  const { data, error } = await service.rpc("attach_studio_catalog_project_asset", {
    p_project_id: input.projectId,
    p_user_id: user.id,
    p_practice_id: input.practiceId,
    p_audio_item_id: input.audioItemId,
    p_original_name: resolveStudioCatalogAssetTitle(audioItem!),
    p_mime_type: "audio/mpeg",
    p_duration_seconds: audioItem!.duration_seconds,
  });
  if (error) {
    mapAttachError(error);
  }
  const asset = data as StudioProjectAssetRow;
  const dto = toStudioAssetDto(asset, null, { available: true });
  if (studioCatalogAssetDtoContainsForbiddenFields(dto)) {
    throw new StudioApiError("internal_error", 500);
  }
  return dto;
}

export async function toListedStudioAssetDtos(
  assets: StudioProjectAssetRow[],
) {
  let userId: string | null = null;
  try {
    userId = (await requireAuthenticatedUser()).user.id;
  } catch {
    userId = null;
  }
  const service = createServiceRoleClient();
  return Promise.all(
    assets.map(async (asset) => {
      if (asset.source_type !== "catalog") {
        return toStudioAssetDto(asset);
      }
      const available = await resolveStudioCatalogAssetAvailability(
        service,
        userId,
        asset,
      );
      const dto = toStudioAssetDto(asset, null, { available });
      if (studioCatalogAssetDtoContainsForbiddenFields(dto)) {
        throw new StudioApiError("internal_error", 500);
      }
      return dto;
    }),
  );
}

export async function resolveStudioCatalogAssetAvailability(
  service: ReturnType<typeof createServiceRoleClient>,
  userId: string | null,
  asset: StudioProjectAssetRow,
): Promise<boolean> {
  if (asset.source_type !== "catalog" || !asset.catalog_practice_id) {
    return true;
  }
  if (!userId) {
    return false;
  }
  const { data, error } = await service.rpc("can_use_music_in_studio", {
    p_user_id: userId,
    p_practice_id: asset.catalog_practice_id,
  });
  if (error) {
    throw new StudioApiError("internal_error", 500);
  }
  return data === true;
}

export async function assertCatalogAssetReadyForPlayback(
  projectId: string,
  asset: StudioProjectAssetRow,
) {
  if (asset.source_type !== "catalog") {
    throw new StudioApiError("not_found", 404);
  }
  if (asset.project_id !== projectId || asset.deleted_at) {
    throw new StudioApiError("not_found", 404);
  }
  if (
    !asset.catalog_practice_id ||
    !asset.catalog_audio_item_id ||
    asset.storage_path ||
    asset.source_id
  ) {
    throw new StudioApiError("not_found", 404);
  }

  const { user } = await requireAuthenticatedUser();
  const { service } = await requireStudioProjectAccess(projectId);
  const { practice, audioItem } = await loadCatalogRefs(
    service,
    asset.catalog_practice_id,
    asset.catalog_audio_item_id,
  );
  if (!practice || !audioItem) {
    throw new StudioApiError("catalog_music_unavailable", 403);
  }
  if (!isStudioMusicPublication(practice) || practice.deleted_at) {
    throw new StudioApiError("catalog_music_unavailable", 403);
  }
  if (String(audioItem.practice_id) !== asset.catalog_practice_id) {
    throw new StudioApiError("catalog_music_unavailable", 403);
  }

  const canUse = await canUseCatalogMusic(service, user.id, asset.catalog_practice_id);
  const access = authorizeStudioCatalogUse({
    userId: user.id,
    isAuthorMember: canUse,
    forPlayback: true,
  });
  if (!access.ok) {
    throw new StudioApiError(access.code, access.status);
  }

  const audioPath = audioItem.audio_path?.trim() ?? "";
  if (!audioPath) {
    throw new StudioApiError("catalog_music_unavailable", 403);
  }

  return { user, service, audioPath, audioItem };
}

export async function createStudioCatalogPlaybackDescriptor(
  projectId: string,
  asset: StudioProjectAssetRow,
) {
  await assertCatalogAssetReadyForPlayback(projectId, asset);
  return {
    url: studioCatalogStreamPath(projectId, asset.id),
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    ttlSeconds: 4 * 60 * 60,
    durationSeconds: asset.duration_seconds,
    mimeType: asset.mime_type || "audio/mpeg",
    originalName: asset.original_name,
    sizeBytes: Number(asset.size_bytes),
    sourceType: "catalog" as const,
  };
}

export async function proxyStudioCatalogAssetStream(input: {
  projectId: string;
  asset: StudioProjectAssetRow;
  rangeHeader: string | null;
}): Promise<Response> {
  const { service, audioPath, audioItem } = await assertCatalogAssetReadyForPlayback(
    input.projectId,
    input.asset,
  );
  const mimeType = input.asset.mime_type || "audio/mpeg";
  const { data, error } = await service.storage
    .from(PRACTICE_AUDIO_BUCKET)
    .createSignedUrl(audioPath, STREAM_SIGN_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    console.error("studio_catalog_stream_sign_error", error?.message);
    throw new StudioApiError("internal_error", 500);
  }
  const signedUrl = normalizeStorageSignedUrl(data.signedUrl);
  if (!signedUrl) {
    throw new StudioApiError("internal_error", 500);
  }

  const sizeHint =
    typeof audioItem.duration_seconds === "number" && input.asset.size_bytes > 0
      ? Number(input.asset.size_bytes)
      : 0;
  const range = parseHttpByteRange(input.rangeHeader, sizeHint);
  if (range.kind === "unsatisfiable" && sizeHint > 0) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${sizeHint}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
      },
    });
  }

  const upstreamHeaders: HeadersInit = {};
  if (input.rangeHeader) {
    upstreamHeaders.Range = input.rangeHeader;
  }
  const upstream = await fetch(signedUrl, { headers: upstreamHeaders });
  if (!upstream.ok && upstream.status !== 206) {
    console.error("studio_catalog_stream_upstream_error", upstream.status);
    throw new StudioApiError("catalog_music_unavailable", 403);
  }

  const headers = new Headers();
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set(
    "Content-Type",
    upstream.headers.get("Content-Type") || mimeType,
  );
  const contentRange = upstream.headers.get("Content-Range");
  if (contentRange) {
    headers.set("Content-Range", contentRange);
  } else if (range.kind === "partial" && sizeHint > 0) {
    const partial = studioCatalogPartialContentHeaders({
      start: range.start,
      end: range.end,
      size: sizeHint,
      mimeType,
    });
    for (const [key, value] of Object.entries(partial)) {
      headers.set(key, value);
    }
  }
  const contentLength = upstream.headers.get("Content-Length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  return new Response(upstream.body, {
    status: upstream.status === 206 || range.kind === "partial" ? 206 : upstream.status,
    headers,
  });
}
