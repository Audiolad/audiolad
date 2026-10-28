import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SoundReviewRow } from "@/lib/business/track-sound-review";
import { sameSoundAudioIdentity } from "@/lib/business/track-sound-review.server";
import {
  contentRangeTotal,
  readLimitedBody,
} from "@/lib/business/track-sound-preview";
import { resolveMusicListenSource, type MusicStreamCandidate } from "@/lib/listen/music-delivery";
import { normalizeStorageSignedUrl } from "@/lib/listen/signed-url";

/** Queue membership is decided by the guarded RPC, never by a client-supplied album id. */
export async function locateSoundReviewRow(db: SupabaseClient, id: string): Promise<SoundReviewRow | null> {
  const { data: audio } = await db.from("audio_items").select("practice_id").eq("id", id).maybeSingle();
  const albumId = (audio as { practice_id?: string | null } | null)?.practice_id;
  if (!albumId) return null;
  const first = await db.rpc("admin_business_sound_queue", { p_album: albumId, p_page: 0 });
  if (first.error || !first.data) return null;
  const payload = first.data as { rows?: SoundReviewRow[]; total?: number };
  if (!Array.isArray(payload.rows)) return null;
  let rows = payload.rows;
  let row = rows.find((item) => item.id === id) ?? null;
  const total = typeof payload.total === "number" ? payload.total : rows.length;
  for (let page = 1; !row && page * 100 < total; page++) {
    const next = await db.rpc("admin_business_sound_queue", { p_album: albumId, p_page: page });
    if (next.error || !next.data) break;
    const pagePayload = next.data as { rows?: SoundReviewRow[] };
    if (!Array.isArray(pagePayload.rows)) break;
    rows = pagePayload.rows;
    row = rows.find((item) => item.id === id) ?? null;
  }
  return row;
}

type StorageSigner = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (path: string, expiresIn: number) => Promise<{
        data: { signedUrl?: string | null } | null;
        error: unknown;
      }>;
    };
  };
};

export async function readPreviewSlice(input: {
  signer: StorageSigner;
  bucket: string;
  path: string;
  ttlSeconds: number;
  start: number;
  end: number;
  fetchImpl?: typeof fetch;
}): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const signed = await input.signer.storage.from(input.bucket).createSignedUrl(input.path, input.ttlSeconds);
  const url = signed.data?.signedUrl ? normalizeStorageSignedUrl(signed.data.signedUrl) : null;
  if (signed.error || !url) return null;
  const fetchImpl = input.fetchImpl ?? fetch;
  const length = input.end - input.start + 1;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      cache: "no-store",
      headers: { Range: `bytes=${input.start}-${input.end}` },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return null;
  }
  if (response.status !== 206 && response.status !== 200) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  // A store that ignores Range would otherwise hand back the whole object.
  if (response.status === 200 && input.start !== 0) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  const bytes = await readLimitedBody(response.body, length);
  const upstreamType = response.headers.get("content-type") ?? "";
  const contentType = upstreamType.startsWith("audio/") ? upstreamType : guessAudioType(input.path);
  return { bytes, contentType };
}

export async function probeStorageSize(input: {
  signer: StorageSigner;
  bucket: string;
  path: string;
  ttlSeconds: number;
  fetchImpl?: typeof fetch;
}): Promise<number | null> {
  const signed = await input.signer.storage.from(input.bucket).createSignedUrl(input.path, input.ttlSeconds);
  const url = signed.data?.signedUrl ? normalizeStorageSignedUrl(signed.data.signedUrl) : null;
  if (signed.error || !url) return null;
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      cache: "no-store",
      headers: { Range: "bytes=0-0" },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return null;
  }
  const total = contentRangeTotal(response.headers.get("content-range"))
    ?? Number(response.headers.get("content-length"));
  await response.body?.cancel().catch(() => undefined);
  return Number.isInteger(total) && total > 0 ? total : null;
}

function guessAudioType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  return "audio/mpeg";
}

export function previewSourceFromRow(row: {
  id: string;
  audio_path: string | null;
  desired_music_master_asset_id: string | null;
  active_music_delivery_asset_id: string | null;
}, asset: {
  audio_item_id: string;
  asset_role: string;
  lifecycle_state: string;
  storage_bucket: string;
  storage_path: string;
} | null, identity: string): { bucket: string; path: string } | null {
  if (!sameSoundAudioIdentity(identity, row)) return null;
  const activeStream: MusicStreamCandidate | null = asset
    ? {
        audioItemId: asset.audio_item_id,
        assetRole: asset.asset_role,
        lifecycleState: asset.lifecycle_state,
        storageBucket: asset.storage_bucket,
        storagePath: asset.storage_path,
      }
    : null;
  const source = resolveMusicListenSource({
    productKind: "music",
    audioItemId: row.id,
    audioPath: row.audio_path,
    activeStream,
  });
  if (source.kind === "missing") return null;
  return { bucket: source.bucket, path: source.path };
}
