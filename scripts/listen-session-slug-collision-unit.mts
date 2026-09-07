#!/usr/bin/env node
/**
 * Duplicate product slugs across authors must not 500 listen/catalog sessions.
 * DB uniqueness is (author_id, slug) only. The session loader must use an
 * inner author join, same as getPracticeByAuthorAndSlug.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadCatalogPlaySession } from "../src/lib/catalog/catalog-playback";
import { isCatalogGlobalPlayerSession } from "../src/lib/listen/global-player-types";
import { loadListenSessionPayload } from "../src/lib/listen/load-session-payload";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHARED_SLUG = "kody-zhenskoy-prityagatelnosti";

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function sessionHttpStatus(reason: "not_found" | "unavailable" | "no_audio" | "error"): number {
  if (reason === "not_found") {
    return 404;
  }

  if (reason === "error") {
    return 500;
  }

  return 403;
}

type CollisionAuthor = {
  id: string;
  name: string;
  slug: string;
};

type CollisionPractice = {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  format: string | null;
  duration_minutes: number | null;
  audio_url: string | null;
  cover_url: string | null;
  cover_image: unknown;
  use_shared_cover: boolean;
  updated_at: string;
  status: string;
  is_free: boolean;
  price: number | null;
  is_catalog_listed: boolean;
  catalog_visibility: string;
  guest_access_enabled: boolean;
  product_kind: string;
  publication_class: string;
  authors: CollisionAuthor;
};

type CollisionAudioItem = {
  id: string;
  practice_id: string;
  title: string;
  description: string | null;
  position: number;
  duration_seconds: number;
  audio_path: string;
  cover_url: string | null;
  cover_image: unknown;
  updated_at: string;
  status: string;
  is_preview: boolean;
  preview_start_ms: number | null;
  preview_end_ms: number | null;
};

const freePractice: CollisionPractice = {
  id: "practice-sergey-and-zoya",
  author_id: "author-sergey-and-zoya",
  title: "Коды женской притягательности (free)",
  slug: SHARED_SLUG,
  subtitle: null,
  description: "Free audio_post",
  format: "Аудиопост",
  duration_minutes: 12,
  audio_url: null,
  cover_url: null,
  cover_image: null,
  use_shared_cover: true,
  updated_at: "2026-09-01T00:00:00.000Z",
  status: "published",
  is_free: true,
  price: 0,
  is_catalog_listed: true,
  catalog_visibility: "listed",
  guest_access_enabled: false,
  product_kind: "audio_post",
  publication_class: "practice",
  authors: {
    id: "author-sergey-and-zoya",
    name: "Сергей и Зоя",
    slug: "sergey-and-zoya",
  },
};

const paidPractice: CollisionPractice = {
  id: "practice-zoya-petrova",
  author_id: "author-zoya-petrova",
  title: "Коды женской притягательности (paid)",
  slug: SHARED_SLUG,
  subtitle: null,
  description: "Paid practice",
  format: "Практика",
  duration_minutes: 20,
  audio_url: null,
  cover_url: null,
  cover_image: null,
  use_shared_cover: true,
  updated_at: "2026-09-01T00:00:00.000Z",
  status: "published",
  is_free: false,
  price: 1490,
  is_catalog_listed: true,
  catalog_visibility: "listed",
  guest_access_enabled: false,
  product_kind: "practice",
  publication_class: "practice",
  authors: {
    id: "author-zoya-petrova",
    name: "Зоя Петрова",
    slug: "zoya-petrova",
  },
};

const audioItems: CollisionAudioItem[] = [
  {
    id: "audio-sergey-and-zoya",
    practice_id: freePractice.id,
    title: "Free track",
    description: null,
    position: 1,
    duration_seconds: 180,
    audio_path: "authors/sergey-and-zoya/free.mp3",
    cover_url: null,
    cover_image: null,
    updated_at: "2026-09-01T00:00:00.000Z",
    status: "published",
    is_preview: true,
    preview_start_ms: null,
    preview_end_ms: null,
  },
  {
    id: "audio-zoya-petrova",
    practice_id: paidPractice.id,
    title: "Paid track",
    description: null,
    position: 1,
    duration_seconds: 240,
    audio_path: "authors/zoya-petrova/paid.mp3",
    cover_url: null,
    cover_image: null,
    updated_at: "2026-09-01T00:00:00.000Z",
    status: "published",
    is_preview: true,
    preview_start_ms: 15_000,
    preview_end_ms: 75_000,
  },
];

function usesInnerAuthorJoin(selectSql: string): boolean {
  return selectSql.includes("authors!practices_author_id_fkey!inner");
}

/**
 * PostgREST: filtering `authors.slug` without `!inner` only filters the
 * embed. Parent rows that share the product slug still all match, so
 * maybeSingle() errors (PGRST116). `!inner` applies the author filter to
 * the parent row set.
 */
function createCollisionSupabase() {
  const practices = [freePractice, paidPractice];

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

        return audioItems.filter((item) => {
          if (item.practice_id !== practiceId) {
            return false;
          }

          if (typeof status === "string" && item.status !== status) {
            return false;
          }

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
              error: {
                code: "PGRST116",
                message: "JSON object requested, multiple (or no) rows returned",
              },
            });
          }

          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        then(
          onFulfilled?: (value: { data: unknown; error: null }) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          const result =
            table === "audio_items"
              ? { data: resolveAudioItems(), error: null }
              : { data: [], error: null };

          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      };

      return chain;
    },
  };
}

function asClient(supabase: ReturnType<typeof createCollisionSupabase>) {
  return supabase as unknown as SupabaseClient;
}

function testSourceUsesInnerAuthorJoin() {
  const sessionLoad = read("src/lib/listen/load-session-payload.ts");
  const lookup = read("src/lib/products/lookup.ts");

  assert.match(
    sessionLoad,
    /authors!practices_author_id_fkey!inner/,
    "listen session lookup must inner-join authors so maybeSingle is unique",
  );
  assert.match(
    lookup,
    /authors!practices_author_id_fkey!inner/,
    "product lookup remains the working inner-join reference",
  );
}

async function testFreeGuestLoadsAuthorA() {
  const loaded = await loadListenSessionPayload(
    asClient(createCollisionSupabase()),
    "sergey-and-zoya",
    SHARED_SLUG,
    null,
  );

  assert.equal(loaded.ok, true, "free guest session must succeed");
  if (!loaded.ok) {
    return;
  }

  assert.equal(
    isCatalogGlobalPlayerSession(loaded.session),
    true,
    "listen session must stay a catalog product payload",
  );
  if (!isCatalogGlobalPlayerSession(loaded.session)) {
    return;
  }

  assert.equal(loaded.session.practiceId, freePractice.id);
  assert.equal(loaded.session.authorSlug, "sergey-and-zoya");
  assert.equal(loaded.session.productSlug, SHARED_SLUG);
  assert.equal(loaded.session.practiceTitle, freePractice.title);
  assert.notEqual(loaded.session.practiceId, paidPractice.id);
}

async function testPaidGuestIsUnavailableNotError() {
  const loaded = await loadListenSessionPayload(
    asClient(createCollisionSupabase()),
    "zoya-petrova",
    SHARED_SLUG,
    null,
  );

  assert.equal(loaded.ok, false, "paid guest listen session is not entitled");
  if (loaded.ok) {
    return;
  }

  assert.equal(loaded.reason, "unavailable");
  assert.notEqual(loaded.reason, "error");
  assert.equal(sessionHttpStatus(loaded.reason), 403);
  assert.notEqual(sessionHttpStatus(loaded.reason), 500);
}

async function testCatalogPlayDoesNot500OnCollision() {
  const freePlay = await loadCatalogPlaySession(
    asClient(createCollisionSupabase()),
    "sergey-and-zoya",
    SHARED_SLUG,
    null,
  );

  assert.equal(freePlay.ok, true, "free catalog play must load author A");
  if (freePlay.ok) {
    assert.equal(freePlay.session.practiceId, freePractice.id);
    assert.equal(freePlay.session.authorSlug, "sergey-and-zoya");
    assert.equal(freePlay.session.playbackMode, "full");
    assert.notEqual(freePlay.session.practiceId, paidPractice.id);
  }

  const paidPlay = await loadCatalogPlaySession(
    asClient(createCollisionSupabase()),
    "zoya-petrova",
    SHARED_SLUG,
    null,
  );

  assert.notEqual(
    paidPlay.ok === false && paidPlay.reason === "error",
    true,
    "paid catalog play must not collapse to reason=error / HTTP 500",
  );

  if (!paidPlay.ok) {
    assert.equal(sessionHttpStatus(paidPlay.reason), 403);
    return;
  }

  assert.equal(paidPlay.session.practiceId, paidPractice.id);
  assert.equal(paidPlay.session.authorSlug, "zoya-petrova");
  assert.equal(paidPlay.session.playbackMode, "preview");
}

testSourceUsesInnerAuthorJoin();
await testFreeGuestLoadsAuthorA();
await testPaidGuestIsUnavailableNotError();
await testCatalogPlayDoesNot500OnCollision();

console.log("listen-session-slug-collision-unit: ok");
