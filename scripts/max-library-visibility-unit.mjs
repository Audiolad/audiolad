/**
 * MAX library visibility and exact-product access.
 * Service role must not reveal saved-only metadata the ordinary library would hide.
 * Exact PDP/playback follows direct-link visibility. A save is not an entitlement.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GUEST_ORDINARY_CATALOG_VIEWER } from "../src/lib/catalog/visibility-query.ts";
import { resolveMaxExactPractice } from "../src/lib/max/exact-product.ts";
import { loadMaxStage1Library, setMaxLibraryDepsForTests } from "../src/lib/max/library.ts";
import {
  getMaxPlaybackSession,
  setMaxPlaybackDepsForTests,
} from "../src/lib/max/playback.ts";
import {
  getMaxPublishedProduct,
  setMaxProductDepsForTests,
} from "../src/lib/max/product.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LISTED = "11111111-1111-4111-8111-111111111111";
const UNLISTED = "22222222-2222-4222-8222-222222222222";
const DRAFT = "33333333-3333-4333-8333-333333333333";
const UNPUBLISHED = "44444444-4444-4444-8444-444444444444";
const DELETED = "55555555-5555-4555-8555-555555555555";
const SELECTED = "66666666-6666-4666-8666-666666666666";
const ENTITLED_UNLISTED = "77777777-7777-4777-8777-777777777777";
const ENTITLED_SELECTED = "88888888-8888-4888-8888-888888888888";
const AUDIO_SECRET = "raw-audio-do-not-leak.mp3";
const COVER_SECRET = "users/secret-storage/draft-cover.webp";
const PLACEHOLDER = "Практика временно недоступна";

const loaderSource = readFileSync(join(repoRoot, "src/lib/max/library.ts"), "utf8");
const productSource = readFileSync(join(repoRoot, "src/lib/max/product.ts"), "utf8");
const playbackSource = readFileSync(join(repoRoot, "src/lib/max/playback.ts"), "utf8");
assert.match(loaderSource, /redactMaxLibraryCatalogVisibility\(supabase, userId/);
assert.match(productSource, /resolveMaxExactPractice\(/);
assert.match(productSource, /viewer: GUEST_ORDINARY_CATALOG_VIEWER/);
assert.match(playbackSource, /evaluateLoadedMaxExactPractice\(/);
assert.match(playbackSource, /canUseMaxStorefrontPreview|maxPlaybackPreviewAllowed/);
assert.doesNotMatch(loaderSource, /auth\.uid\(/);

function practice(input) {
  return {
    id: input.id,
    title: input.title,
    slug: input.slug,
    format: "Медитация",
    duration_minutes: 8,
    price: input.price ?? 490,
    is_free: false,
    cover_url: input.coverUrl ?? "https://cdn.example.test/cover.webp",
    cover_image: null,
    updated_at: null,
    audio_url: AUDIO_SECRET,
    author_id: "author-1",
    status: input.status,
    deleted_at: input.deletedAt ?? null,
    catalog_visibility: input.visibility,
    is_catalog_listed: input.visibility === "listed",
    scheduled_publish_at: null,
    published_at: "2026-01-01T00:00:00.000Z",
    authors: { name: input.authorName ?? "Анна Автор", slug: input.authorSlug ?? "anna" },
  };
}

const rows = {
  listed: practice({
    id: LISTED,
    title: "Открытая тишина",
    slug: "otkrytaya",
    status: "published",
    visibility: "listed",
  }),
  unlisted: practice({
    id: UNLISTED,
    title: "Тихая ссылка",
    slug: "tihaya-ssylka",
    status: "published",
    visibility: "unlisted",
  }),
  draft: practice({
    id: DRAFT,
    title: "Черновик секрета",
    slug: "chernovik-sekreta",
    status: "draft",
    visibility: "listed",
    coverUrl: COVER_SECRET,
  }),
  unpublished: practice({
    id: UNPUBLISHED,
    title: "Снятая с публикации",
    slug: "snyataya",
    status: "unpublished",
    visibility: "listed",
  }),
  deleted: practice({
    id: DELETED,
    title: "Удалённая практика",
    slug: "udalennaya",
    status: "published",
    visibility: "listed",
    deletedAt: "2026-02-01T00:00:00.000Z",
  }),
  selected: practice({
    id: SELECTED,
    title: "Только для своих",
    slug: "tolko-dlya-svoih",
    status: "published",
    visibility: "selected_users",
  }),
  entitledUnlisted: practice({
    id: ENTITLED_UNLISTED,
    title: "Купленная скрытая",
    slug: "kuplennaya-skrytaya",
    status: "published",
    visibility: "unlisted",
    authorSlug: "boris",
    authorName: "Борис Автор",
  }),
  entitledSelected: practice({
    id: ENTITLED_SELECTED,
    title: "Купленная закрытая",
    slug: "kuplennaya-zakrytaya",
    status: "published",
    visibility: "selected_users",
    authorSlug: "boris",
  }),
};

function entitlement(userId, row, source = "purchase") {
  return {
    user_id: userId,
    id: `entitlement-${row.id}`,
    access_source: source,
    granted_at: "2026-03-01T00:00:00.000Z",
    expires_at: null,
    practice_id: row.id,
    practices: row,
  };
}

function save(userId, practiceId) {
  return {
    user_id: userId,
    practice_id: practiceId,
    created_at: "2026-04-01T00:00:00.000Z",
  };
}

const tables = {
  user_practices: [
    entitlement(USER_A, rows.entitledUnlisted),
    entitlement(USER_A, rows.entitledSelected),
    entitlement(USER_B, rows.selected),
  ],
  library_saves: [
    save(USER_A, LISTED),
    save(USER_A, UNLISTED),
    save(USER_A, DRAFT),
    save(USER_A, UNPUBLISHED),
    save(USER_A, DELETED),
    save(USER_A, SELECTED),
  ],
  practices: Object.values(rows),
  practice_visibility_users: [{ user_id: USER_B, practice_id: SELECTED }],
  author_members: [],
  playlist_saves: [],
};

const visibilityUsers = [];

function createFakeClient() {
  return {
    from(table) {
      const filters = [];
      const api = {
        select() {
          return api;
        },
        eq(column, value) {
          filters.push({ op: "eq", column, value });
          if (column === "user_id") visibilityUsers.push(value);
          return api;
        },
        in(column, value) {
          filters.push({ op: "in", column, value });
          return api;
        },
        order() {
          return api;
        },
        not() {
          return api;
        },
        or() {
          return api;
        },
        limit() {
          return api;
        },
        maybeSingle() {
          return api;
        },
        then(onFulfilled, onRejected) {
          const data = (tables[table] ?? []).filter((row) =>
            filters.every((filter) => {
              if (filter.op === "in") {
                return Array.isArray(filter.value) && filter.value.includes(row[filter.column]);
              }
              return row[filter.column] === filter.value;
            }),
          );
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
        },
      };
      return api;
    },
  };
}

function catalogProduct(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    title: row.title,
    slug: row.slug,
    subtitle: null,
    description: null,
    format: row.format,
    productKind: "practice",
    publicationClass: "audio_product",
    price: row.price,
    isFree: false,
    authorName: row.authors.name,
    authorSlug: row.authors.slug,
    href: `/practice/${row.authors.slug}/${row.slug}`,
    meta: null,
    statsLabel: "8 мин",
    productTypeLabel: "Аудиопрактика",
    priceLabel: "490 ₽",
    sortTimestamp: 1,
    coverUrl: "https://cdn.example.test/cover.webp",
    coverImage: null,
    updatedAt: null,
    gallery: [],
  };
}

function fullSession() {
  return {
    ok: true,
    session: {
      practiceTitle: "Сессия",
      authorName: "Борис Автор",
      format: "Практика",
      tracks: [{ id: "track-1", title: "Трек", position: 1, durationSeconds: 90, coverImageUrl: null }],
      coverImageUrl: null,
    },
  };
}

function denyAccess() {
  return {
    isAuthorMember: false,
    hasEntitlement: false,
    canSeeSelectedUsers: false,
  };
}

function allowEntitlement() {
  return {
    isAuthorMember: false,
    hasEntitlement: true,
    canSeeSelectedUsers: true,
  };
}

setMaxLibraryDepsForTests({
  createClient: createFakeClient,
  listSavedPlaylists: async (_supabase, _query, options) => {
    visibilityUsers.push(options.userId);
    return { items: [], nextCursor: null };
  },
});

try {
  const loaded = await loadMaxStage1Library(createFakeClient(), USER_A);
  assert.equal(loaded.error, false);
  const byId = new Map(
    loaded.items.filter((item) => item.kind === "catalog").map((item) => [item.practiceId, item]),
  );
  assert.equal(byId.get(LISTED).title, "Открытая тишина");
  assert.equal(byId.get(LISTED).authorSlug, "anna");
  assert.equal(byId.get(LISTED).productSlug, "otkrytaya");
  assert.equal(byId.get(LISTED).canListen, false);
  assert.equal(byId.get(UNLISTED).title, "Тихая ссылка");
  assert.equal(byId.get(UNLISTED).productSlug, "tihaya-ssylka");
  assert.equal(byId.get(UNLISTED).canListen, false);

  for (const id of [DRAFT, UNPUBLISHED, DELETED, SELECTED]) {
    const item = byId.get(id);
    assert.equal(item.title, PLACEHOLDER);
    assert.equal(item.authorSlug, null);
    assert.equal(item.productSlug, null);
    assert.equal(item.coverUrl, null);
    assert.equal(item.price, null);
    assert.equal(item.priceLabel, "Цена уточняется");
    assert.equal(item.canListen, false);
    assert.equal(item.isSaved, true);
  }

  assert.equal(byId.get(ENTITLED_UNLISTED).title, "Купленная скрытая");
  assert.equal(byId.get(ENTITLED_UNLISTED).canListen, true);
  assert.equal(byId.get(ENTITLED_UNLISTED).productSlug, "kuplennaya-skrytaya");
  assert.equal(byId.get(ENTITLED_UNLISTED).authorSlug, "boris");
  assert.equal(byId.get(ENTITLED_SELECTED).title, "Купленная закрытая");
  assert.equal(byId.get(ENTITLED_SELECTED).canListen, true);

  const payload = JSON.stringify(loaded.items);
  for (const secret of [
    "Черновик секрета",
    "chernovik-sekreta",
    "Снятая с публикации",
    "snyataya",
    "Удалённая практика",
    "udalennaya",
    "Только для своих",
    "tolko-dlya-svoih",
    AUDIO_SECRET,
    COVER_SECRET,
    USER_A,
    USER_B,
  ]) {
    assert.equal(payload.includes(secret), false, secret);
  }
  assert.ok(visibilityUsers.every((userId) => userId === USER_A));

  const allowlisted = await loadMaxStage1Library(createFakeClient(), USER_B);
  const selected = allowlisted.items.find((item) => item.kind === "catalog" && item.practiceId === SELECTED);
  assert.equal(selected.title, "Только для своих");
  assert.equal(selected.canListen, true);
  assert.equal(JSON.stringify(allowlisted.items).includes("Открытая тишина"), false);

  const guestListed = await resolveMaxExactPractice(
    {},
    "anna",
    "otkrytaya",
    null,
    { getPractice: async () => ({ practice: rows.listed, error: false }) },
  );
  assert.equal(guestListed.ok, true);
  const guestSelected = await resolveMaxExactPractice(
    {},
    "anna",
    "tolko-dlya-svoih",
    null,
    { getPractice: async () => ({ practice: rows.selected, error: false }) },
  );
  assert.deepEqual(guestSelected, { ok: false, reason: "not_found" });

  let playbackLoads = 0;
  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    getPractice: async () => ({ practice: rows.entitledUnlisted, error: false }),
    loadSession: async (_supabase, author, slug, linkedUserId) => {
      playbackLoads += 1;
      assert.equal(linkedUserId, USER_A);
      assert.equal(author, "boris");
      assert.equal(slug, "kuplennaya-skrytaya");
      return fullSession();
    },
    resolvePreview: async () => {
      throw new Error("entitled unlisted must not preview");
    },
  });
  const entitledPlay = await getMaxPlaybackSession(USER_A, "boris", "kuplennaya-skrytaya");
  assert.equal(entitledPlay.ok, true);
  assert.equal(entitledPlay.playbackMode, "full");
  assert.equal(playbackLoads, 1);

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    getPractice: async () => ({ practice: rows.entitledSelected, error: false }),
    resolveAccess: async (_supabase, _practice, linkedUserId) =>
      linkedUserId === USER_A ? allowEntitlement() : denyAccess(),
    loadSession: async (_supabase, _author, _slug, linkedUserId) => {
      assert.equal(linkedUserId, USER_A);
      return fullSession();
    },
  });
  const selectedPlay = await getMaxPlaybackSession(USER_A, "boris", "kuplennaya-zakrytaya");
  assert.equal(selectedPlay.ok, true);
  assert.equal(selectedPlay.playbackMode, "full");

  let foreignLoads = 0;
  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    getPractice: async () => ({ practice: rows.entitledSelected, error: false }),
    resolveAccess: async () => denyAccess(),
    loadSession: async () => {
      foreignLoads += 1;
      return fullSession();
    },
  });
  const foreignPlay = await getMaxPlaybackSession(USER_B, "boris", "kuplennaya-zakrytaya");
  assert.deepEqual(foreignPlay, { ok: false, reason: "not_found" });
  assert.equal(foreignLoads, 0);

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    getPractice: async () => ({ practice: rows.listed, error: false }),
    loadSession: async () => ({ ok: false, reason: "unavailable" }),
    resolvePreview: async () => ({
      ok: true,
      track: { trackId: "preview-1", title: "Фрагмент", position: 1, durationSeconds: 30, coverUrl: null },
      previewDurationSeconds: 30,
    }),
  });
  const savedPreview = await getMaxPlaybackSession(USER_A, "anna", "otkrytaya");
  assert.equal(savedPreview.ok, true);
  assert.equal(savedPreview.playbackMode, "preview");

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    getPractice: async () => ({ practice: rows.unlisted, error: false }),
    loadSession: async () => ({ ok: false, reason: "unavailable" }),
    resolvePreview: async () => {
      throw new Error("saved unlisted must not preview");
    },
  });
  const savedUnlisted = await getMaxPlaybackSession(USER_A, "anna", "tihaya-ssylka");
  assert.deepEqual(savedUnlisted, { ok: false, reason: "access_required" });

  let catalogViewers = [];
  setMaxProductDepsForTests({
    createClient: () => ({}),
    releaseScheduled: async () => {},
    getPractice: async () => ({ practice: rows.entitledUnlisted, error: false }),
    listCatalog: async (_supabase, options) => {
      catalogViewers.push(options.viewer);
      return [];
    },
    mapProducts: async () => [catalogProduct(rows.entitledUnlisted)],
    loadTracks: async () => [],
    loadTopics: async () => [],
    loadSeo: async () => ({ relatedProducts: [], authorRecommendationsTitle: null }),
  });
  const pdp = await getMaxPublishedProduct("boris", "kuplennaya-skrytaya", USER_A);
  assert.equal(pdp.ok, true);
  assert.equal(pdp.product.title, "Купленная скрытая");
  assert.equal(pdp.product.authorSlug, "boris");
  assert.equal(pdp.product.productSlug, "kuplennaya-skrytaya");
  assert.deepEqual(catalogViewers[0], GUEST_ORDINARY_CATALOG_VIEWER);

  catalogViewers = [];
  setMaxProductDepsForTests({
    createClient: () => ({}),
    releaseScheduled: async () => {},
    getPractice: async () => ({ practice: rows.listed, error: false }),
    listCatalog: async (_supabase, options) => {
      catalogViewers.push(options.viewer);
      return [catalogProduct(rows.listed)];
    },
    mapProducts: async () => {
      throw new Error("listed discovery must come from the guest catalog");
    },
    loadTracks: async () => [],
    loadTopics: async () => [],
    loadSeo: async () => ({ relatedProducts: [], authorRecommendationsTitle: null }),
  });
  const guestPdp = await getMaxPublishedProduct("anna", "otkrytaya", null);
  assert.equal(guestPdp.ok, true);
  assert.equal(guestPdp.product.title, "Открытая тишина");
  assert.deepEqual(catalogViewers[0], GUEST_ORDINARY_CATALOG_VIEWER);

  setMaxProductDepsForTests({
    createClient: () => ({}),
    releaseScheduled: async () => {},
    getPractice: async () => ({ practice: rows.entitledSelected, error: false }),
    resolveAccess: async () => denyAccess(),
    listCatalog: async () => {
      throw new Error("foreign selected_users must not reach catalog discovery");
    },
  });
  const foreignPdp = await getMaxPublishedProduct("boris", "kuplennaya-zakrytaya", USER_B);
  assert.deepEqual(foreignPdp, { ok: true, product: null });
} finally {
  setMaxLibraryDepsForTests(null);
  setMaxPlaybackDepsForTests(null);
  setMaxProductDepsForTests(null);
}

console.log("max-library-visibility-unit: ok");
