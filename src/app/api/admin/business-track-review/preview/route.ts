import { NextResponse } from "next/server";

import { getPlatformAccess } from "@/lib/auth/platform-access";
import { locateSoundReviewRow, previewSourceFromRow, probeStorageSize, readPreviewSlice } from "@/lib/business/track-sound-preview.server";
import {
  BUSINESS_TRACK_PREVIEW_CACHE_CONTROL,
  BUSINESS_TRACK_PREVIEW_SOURCE_TTL_SECONDS,
  businessTrackPreviewStatus,
  clipPreviewRange,
  previewByteCap,
  previewResponseHeaders,
} from "@/lib/business/track-sound-preview";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVATE = { "Cache-Control": BUSINESS_TRACK_PREVIEW_CACHE_CONTROL };

function denied(status: 401 | 403 | 404 | 409 | 416 | 502) {
  return NextResponse.json({ ok: false }, { status, headers: PRIVATE });
}

/**
 * Admin review preview. Same-origin only: the browser never receives a storage signed URL.
 * Permissions are checked on every request, including Range requests from the audio element.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const access = user ? await getPlatformAccess(supabase, user.id) : null;
  const status = businessTrackPreviewStatus(access);
  if (status !== 200) return denied(status);

  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const identity = url.searchParams.get("identity") ?? "";
  if (!UUID.test(id) || identity.length === 0 || identity.length > 4000) return denied(404);

  const queued = await locateSoundReviewRow(supabase, id);
  if (!queued || queued.audio_identity !== identity) return denied(queued ? 409 : 404);

  let service: ReturnType<typeof createServiceRoleClient>;
  try {
    service = createServiceRoleClient();
  } catch {
    return denied(502);
  }
  const { data: row, error } = await service
    .from("audio_items")
    .select("id, audio_path, desired_music_master_asset_id, active_music_delivery_asset_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !row) return denied(404);
  type PreviewAsset = {
    audio_item_id: string;
    asset_role: string;
    lifecycle_state: string;
    storage_bucket: string;
    storage_path: string;
  };
  let asset: PreviewAsset | null = null;
  const assetId = row.active_music_delivery_asset_id as string | null;
  if (assetId) {
    const loaded = await service
      .from("music_audio_assets")
      .select("audio_item_id, asset_role, lifecycle_state, storage_bucket, storage_path")
      .eq("id", assetId)
      .maybeSingle();
    if (loaded.data) asset = loaded.data as unknown as PreviewAsset;
  }
  const source = previewSourceFromRow({
    id: row.id as string,
    audio_path: row.audio_path as string | null,
    desired_music_master_asset_id: row.desired_music_master_asset_id as string | null,
    active_music_delivery_asset_id: row.active_music_delivery_asset_id as string | null,
  }, asset, identity);
  if (!source) return denied(409);

  const fileSize = await probeStorageSize({
    signer: service,
    bucket: source.bucket,
    path: source.path,
    ttlSeconds: BUSINESS_TRACK_PREVIEW_SOURCE_TTL_SECONDS,
  });
  if (!fileSize) return denied(502);
  const cap = previewByteCap(fileSize, queued.duration_seconds);
  const range = clipPreviewRange(fileSize, cap, request.headers.get("range"));
  if (!range.ok) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        ...PRIVATE,
        "Content-Range": `bytes */${fileSize}`,
      },
    });
  }
  const slice = await readPreviewSlice({
    signer: service,
    bucket: source.bucket,
    path: source.path,
    ttlSeconds: BUSINESS_TRACK_PREVIEW_SOURCE_TTL_SECONDS,
    start: range.start,
    end: range.end,
  });
  if (!slice || slice.bytes.byteLength === 0) return denied(502);
  return new NextResponse(Buffer.from(slice.bytes), {
    status: 206,
    headers: previewResponseHeaders({
      start: range.start,
      end: range.start + slice.bytes.byteLength - 1,
      total: fileSize,
      contentType: slice.contentType,
    }),
  });
}
