import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadCatalogPlaySession } from "../src/lib/catalog/catalog-playback";
import { isCatalogGlobalPlayerSession } from "../src/lib/listen/global-player-types";
import { loadListenSessionPayload } from "../src/lib/listen/load-session-payload";
import {
  hasProductPlayableAudio,
  hasPublicTrackPlayableAudio,
} from "../src/lib/listen/music-delivery";
import {
  collectValidatedActiveMusicDeliveryItemIds,
  hasListenTrackPlayableSource,
  resolvePlayableAudioItemRows,
  type MusicAudioAssetValidationRow,
} from "../src/lib/listen/validated-active-music-delivery";
import { buildPracticeAccessPresentation } from "../src/lib/products/practice-access-ui";
import type { ProductAccessResult } from "../src/lib/products/access";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const MUSIC_STREAMS = "music-streams";
const PRACTICE_ID = "practice-jazz";
const AUTHOR_SLUG = "jazz-relax";
const PRODUCT_SLUG = "dzhaz-dlya-otdyha";

function streamAsset(
  overrides: Partial<MusicAudioAssetValidationRow> & {
    id: string;
    audio_item_id: string;
  },
): MusicAudioAssetValidationRow {
  return {
    asset_role: "stream",
    lifecycle_state: "verified",
    storage_bucket: MUSIC_STREAMS,
    storage_path: `${overrides.audio_item_id}/master/mp3-256.mp3`,
    ...overrides,
  };
}

function assertSessionJsonSafe(session: unknown) {
  const json = JSON.stringify(session);
  assert.doesNotMatch(json, /storage_path/);
  assert.doesNotMatch(json, /music-masters/);
  assert.doesNotMatch(json, /active_music_delivery_asset_id/);
  assert.doesNotMatch(json, /music-streams\//);
  assert.doesNotMatch(json, /signedUrl|token=/i);
}

// --- Pure validation ---

{
  // A. direct MP3
  assert.equal(
    hasListenTrackPlayableSource({
      audioPath: "authors/a/direct.mp3",
      hasActiveDelivery: false,
    }),
    true,
  );
}

{
  // B. music null path + validated delivery
  assert.equal(
    hasListenTrackPlayableSource({
      audioPath: null,
      hasActiveDelivery: true,
    }),
    true,
  );
}

{
  // D. pointer present but asset rejected
  const item = {
    id: "audio-1",
    active_music_delivery_asset_id: "asset-1",
  };
  const valid = collectValidatedActiveMusicDeliveryItemIds(
    [item],
    [
      streamAsset({
        id: "asset-1",
        audio_item_id: "audio-1",
        lifecycle_state: "rejected",
      }),
    ],
  );
  assert.equal(valid.has("audio-1"), false);
  assert.equal(
    hasListenTrackPlayableSource({
      audioPath: null,
      hasActiveDelivery: valid.has("audio-1"),
    }),
    false,
  );
}

{
  // E. pointer to master
  const item = {
    id: "audio-1",
    active_music_delivery_asset_id: "asset-master",
  };
  const valid = collectValidatedActiveMusicDeliveryItemIds(
    [item],
    [
      streamAsset({
        id: "asset-master",
        audio_item_id: "audio-1",
        asset_role: "master",
        storage_bucket: "music-masters",
        storage_path: "audio-1/master.wav",
      }),
    ],
  );
  assert.equal(valid.has("audio-1"), false);
}

{
  // F. pointer to another item's stream
  const item = {
    id: "audio-1",
    active_music_delivery_asset_id: "asset-other",
  };
  const valid = collectValidatedActiveMusicDeliveryItemIds(
    [item],
    [
      streamAsset({
        id: "asset-other",
        audio_item_id: "audio-2",
      }),
    ],
  );
  assert.equal(valid.has("audio-1"), false);
}

{
  // G. ready job without active delivery → not playable
  assert.equal(
    hasListenTrackPlayableSource({
      audioPath: null,
      hasActiveDelivery: false,
    }),
    false,
  );
}

{
  // H. replacement processing: old valid active stream still playable
  const item = {
    id: "audio-1",
    audio_path: null as string | null,
    active_music_delivery_asset_id: "asset-old",
  };
  const valid = collectValidatedActiveMusicDeliveryItemIds(
    [item],
    [streamAsset({ id: "asset-old", audio_item_id: "audio-1" })],
  );
  assert.equal(valid.has("audio-1"), true);
  assert.equal(
    hasListenTrackPlayableSource({
      audioPath: null,
      hasActiveDelivery: true,
    }),
    true,
  );
}

{
  // I. no path + no valid stream
  assert.equal(
    hasListenTrackPlayableSource({
      audioPath: null,
      hasActiveDelivery: false,
    }),
    false,
  );
}

{
  // C. 10 WAV-derived tracks keep order via resolvePlayableAudioItemRows
  const rows = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    return {
      id: `audio-${n}`,
      position: n,
      audio_path: null as string | null,
      active_music_delivery_asset_id: `stream-${n}`,
      title: `Track ${n}`,
    };
  });
  const assets = rows.map((row) =>
    streamAsset({
      id: row.active_music_delivery_asset_id,
      audio_item_id: row.id,
    }),
  );

  const serviceRole = {
    from(table: string) {
      assert.equal(table, "music_audio_assets");
      const chain = {
        select() {
          return chain;
        },
        in() {
          return Promise.resolve({ data: assets, error: null });
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;

  const playable = await resolvePlayableAudioItemRows(rows, "music", {
    serviceRole,
  });
  assert.equal(playable.length, 10);
  assert.deepEqual(
    playable.map((row) => row.id),
    rows.map((row) => row.id),
  );
}

// Public CTA still listen for validated WAV product
{
  const freeAccess: ProductAccessResult = {
    canListen: true,
    canAcquire: false,
    isPubliclyListed: true,
    reason: "free",
    isAuthorMember: false,
    accessSource: null,
    hasEntitlement: false,
    accessLevel: null,
  };
  const tracksHavePlayableAudio = hasPublicTrackPlayableAudio({
    audioPath: null,
    hasActiveDelivery: true,
  });
  const product = hasProductPlayableAudio({
    practiceAudioUrl: null,
    tracksHavePlayableAudio,
  });
  const presentation = buildPracticeAccessPresentation({
    access: freeAccess,
    practice: {
      id: PRACTICE_ID,
      slug: PRODUCT_SLUG,
      audio_url: null,
      price: 0,
      is_free: true,
      format: "музыка",
      status: "published",
      is_catalog_listed: true,
      catalog_visibility: "public",
      author_id: "author-1",
    },
    authorSlug: AUTHOR_SLUG,
    paymentsConfigured: true,
    isAuthenticated: true,
    hasPlayableAudio: product,
  });
  assert.equal(presentation.primaryAction.kind, "listen");
}

type JazzAudioItem = {
  id: string;
  practice_id: string;
  title: string;
  description: string | null;
  position: number;
  duration_seconds: number;
  audio_path: string | null;
  active_music_delivery_asset_id: string | null;
  cover_url: string | null;
  cover_image: unknown;
  updated_at: string;
  status: string;
  is_preview: boolean;
  preview_start_ms: number | null;
  preview_end_ms: number | null;
};

const jazzPractice = {
  id: PRACTICE_ID,
  author_id: "author-jazz",
  title: "Джаз для отдыха",
  slug: PRODUCT_SLUG,
  subtitle: null,
  description: "Лёгкий вечерний джаз",
  format: "музыка",
  duration_minutes: 32,
  audio_url: null as string | null,
  cover_url: null,
  cover_image: null,
  use_shared_cover: true,
  updated_at: "2026-09-14T00:00:00.000Z",
  status: "published",
  is_free: true,
  price: 0,
  is_catalog_listed: true,
  catalog_visibility: "listed",
  guest_access_enabled: false,
  product_kind: "music",
  publication_class: "release",
  authors: {
    id: "author-jazz",
    name: "Джаз Релакс",
    slug: AUTHOR_SLUG,
  },
};

const jazzTracks: JazzAudioItem[] = Array.from({ length: 10 }, (_, i) => {
  const n = i + 1;
  return {
    id: `audio-jazz-${n}`,
    practice_id: PRACTICE_ID,
    title: `Трек ${n}`,
    description: null,
    position: n,
    duration_seconds: 180 + n,
    audio_path: null,
    active_music_delivery_asset_id: `stream-jazz-${n}`,
    cover_url: null,
    cover_image: null,
    updated_at: "2026-09-14T00:00:00.000Z",
    status: "published",
    is_preview: n === 1,
    preview_start_ms: null,
    preview_end_ms: null,
  };
});

const jazzAssets: MusicAudioAssetValidationRow[] = jazzTracks.map((track) =>
  streamAsset({
    id: track.active_music_delivery_asset_id as string,
    audio_item_id: track.id,
  }),
);

function usesInnerAuthorJoin(selectSql: string): boolean {
  return selectSql.includes("authors!practices_author_id_fkey!inner");
}

function createJazzSupabase(audioOverride?: JazzAudioItem[]) {
  const items = audioOverride ?? jazzTracks;
  const practices = [jazzPractice];

  return {
    from(table: string) {
      let selectSql = "";
      const filters = new Map<string, unknown>();

      const resolvePractices = () => {
        const productSlug = filters.get("slug");
        const authorSlug = filters.get("authors.slug");
        let rows = practices.filter((practice) => practice.slug === productSlug);
        if (usesInnerAuthorJoin(selectSql) && typeof authorSlug === "string") {
          rows = rows.filter((practice) => practice.authors.slug === authorSlug);
        }
        return rows;
      };

      const resolveAudioItems = () => {
        const practiceId = filters.get("practice_id");
        const status = filters.get("status");
        return items.filter((item) => {
          if (item.practice_id !== practiceId) return false;
          if (typeof status === "string" && item.status !== status) return false;
          return true;
        });
      };

      const chain = {
        select(sql: string) {
          selectSql = sql;
          return chain;
        },
        eq(column: string, value: unknown) {
          filters.set(column, value);
          return chain;
        },
        in() {
          return chain;
        },
        order() {
          return chain;
        },
        maybeSingle() {
          if (table !== "practices") {
            return Promise.resolve({ data: null, error: null });
          }
          const rows = resolvePractices();
          if (rows.length > 1) {
            return Promise.resolve({
              data: null,
              error: { code: "PGRST116", message: "multiple rows" },
            });
          }
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then(
          onFulfilled?: (value: { data: unknown; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          let result: { data: unknown; error: null };
          if (table === "audio_items") {
            result = { data: resolveAudioItems(), error: null };
          } else if (table === "practices") {
            result = { data: resolvePractices(), error: null };
          } else {
            result = { data: [], error: null };
          }
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };
      return chain;
    },
  };
}

function createJazzServiceRole(assets: MusicAudioAssetValidationRow[] = jazzAssets) {
  return {
    from(table: string) {
      assert.equal(table, "music_audio_assets");
      let ids: string[] = [];
      const chain = {
        select() {
          return chain;
        },
        in(_column: string, values: string[]) {
          ids = values;
          const data = assets.filter((asset) => ids.includes(asset.id));
          return Promise.resolve({ data, error: null });
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

function asClient(supabase: ReturnType<typeof createJazzSupabase>) {
  return supabase as unknown as SupabaseClient;
}

async function testListenAndCatalogSessions() {
  const serviceRole = createJazzServiceRole();

  // K. listen session
  const listen = await loadListenSessionPayload(
    asClient(createJazzSupabase()),
    AUTHOR_SLUG,
    PRODUCT_SLUG,
    null,
    { serviceRole },
  );
  assert.equal(listen.ok, true, "listen session must succeed for WAV music");
  if (!listen.ok) return;
  assert.equal(listen.session.tracks.length, 10);
  assert.deepEqual(
    listen.session.tracks.map((track) => track.id),
    jazzTracks.map((track) => track.id),
  );
  assert.equal(
    listen.session.tracks.some((track) => track.id === "audio-jazz-3"),
    true,
  );
  assertSessionJsonSafe(listen.session);

  // J. catalog play (free → entitled path)
  const catalog = await loadCatalogPlaySession(
    asClient(createJazzSupabase()),
    AUTHOR_SLUG,
    PRODUCT_SLUG,
    null,
    { serviceRole },
  );
  assert.equal(catalog.ok, true, "catalog play must succeed for free WAV music");
  if (!catalog.ok) return;
  assert.equal(isCatalogGlobalPlayerSession(catalog.session), true);
  assert.equal(catalog.session.tracks.length, 10);
  assertSessionJsonSafe(catalog.session);

  // no_audio when pointers missing
  const emptyTracks = jazzTracks.map((track) => ({
    ...track,
    active_music_delivery_asset_id: null,
  }));
  const empty = await loadListenSessionPayload(
    asClient(createJazzSupabase(emptyTracks)),
    AUTHOR_SLUG,
    PRODUCT_SLUG,
    null,
    { serviceRole: createJazzServiceRole([]) },
  );
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.reason, "no_audio");
  }
}

function testSourceWiring() {
  const session = read("src/lib/listen/load-session-payload.ts");
  const catalog = read("src/lib/catalog/catalog-playback.ts");
  const publicItems = read("src/lib/products/public-audio-items.ts");
  const helper = read("src/lib/listen/validated-active-music-delivery.ts");
  const signed = read("src/lib/listen/signed-audio.ts");

  assert.match(helper, /isVerifiedMusicStreamAsset/);
  assert.match(helper, /createServiceRoleClient/);
  assert.doesNotMatch(helper, /storage_path.*return/);

  assert.match(session, /resolvePlayableAudioItemRows/);
  assert.match(session, /active_music_delivery_asset_id/);
  assert.doesNotMatch(session, /\.filter\(\(item\) => item\.audio_path\?\.trim\(\)\)/);

  assert.match(catalog, /resolvePlayableAudioItemRows/);
  assert.match(catalog, /active_music_delivery_asset_id/);
  assert.doesNotMatch(
    catalog,
    /Boolean\(item\.audio_path\?\.trim\(\)\)/,
  );

  assert.match(publicItems, /loadValidatedActiveMusicDeliveryItemIds/);
  assert.doesNotMatch(publicItems, /async function loadValidatedActiveDeliveryItemIds/);

  // P. signed-audio resolver not duplicated
  assert.match(signed, /resolveMusicListenSource/);
  assert.doesNotMatch(session, /resolveMusicListenSource/);
  assert.doesNotMatch(catalog, /createSignedUrl|signed-audio/);

  const catalogPlayRoute = read("src/app/api/catalog/play/route.ts");
  assert.match(catalogPlayRoute, /loadCatalogPlaySession/);

  const listenSessionRoute = read(
    "src/app/api/listen/product/[slug]/[productSlug]/session/route.ts",
  );
  assert.match(listenSessionRoute, /loadListenSessionPayload/);
}

await testListenAndCatalogSessions();
testSourceWiring();

console.log("wav-music-session-tracks-unit: ok");
