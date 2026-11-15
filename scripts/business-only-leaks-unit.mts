import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUSINESS_ONLY_COLUMN, isBusinessOnlyPractice } from "../src/lib/products/business-only";
import { canUsePracticeOnOpenPlatform } from "../src/lib/products/business-only.server";
import { getPracticeByAuthorAndSlug, resolveLegacyPracticePath } from "../src/lib/products/lookup";
import { resolveProductAccess, canAcquirePractice } from "../src/lib/products/access";
import { signEntitledListenAudio } from "../src/lib/listen/sign-entitled-audio";
import { buildPublicPracticePreviewClip } from "../src/lib/listen/serve-preview-clip";
import { isAlbumRadioReleaseRow } from "../src/lib/listen/album-radio-eligibility";
import { isPracticeEligibleForPublicPlaylist } from "../src/lib/playlists/public-content";
import { isPracticePromoPageEligible } from "../src/lib/promo-pages/validation";
import { isPublicCatalogPracticeRow, shouldBlockPublicPracticeAccess } from "../src/lib/fixtures/test-fixture-marker";
import { planPracticePublishIndexNow } from "../src/lib/seo/indexnow/planner";
import { planPracticeYandexRecrawl } from "../src/lib/seo/yandex-webmaster/planner";
import { readPublishedDirectLinkTarget } from "../src/lib/mini-app/published-product-target";
import { mergeLibraryCollection } from "../src/lib/library/collection";
import { createSupabaseLibrarySavesStore } from "../src/lib/library/saves";
import { canExposePracticeUrl } from "../src/lib/products/public-url.server";
import { practiceBelongsToAuthor } from "../src/lib/authors/space-ops";
import { evaluateLoadedMaxExactPractice } from "../src/lib/max/exact-product";
import { mapPracticeRowsToSitemapEntries, mapAuthorPracticeRowsToSitemapEntries } from "../src/lib/seo/sitemap-data";
import { applyOrdinaryCatalogEligibility } from "../src/lib/catalog/visibility-query";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
assert.equal(read("src/lib/products/business-only.ts"), readFileSync(resolve(root, "../seed-business-only.ts"), "utf8"));
assert.equal(BUSINESS_ONLY_COLUMN, "business_only");
assert.equal(isBusinessOnlyPractice(null), false);
assert.equal(isBusinessOnlyPractice({ business_only: false }), false);

const id = "11111111-1111-4111-8111-111111111111";
const row = {
  id, author_id: "artist-id", title: "Секретный альбом", slug: "known-album",
  status: "published", business_only: true, product_kind: "music", publication_class: "release",
  catalog_visibility: "listed", is_catalog_listed: true, is_free: true, price: 0,
  cover_image: null, cover_url: "/secret-cover.jpg", audio_url: "secret.mp3",
  format: null, duration_minutes: null, updated_at: null,
  deleted_at: null, scheduled_publish_at: null, published_at: "2026-01-01T00:00:00Z",
  authors: { slug: "known-author", name: "Автор" },
};
// Deliberately inconsistent visibility/old grants: flag alone must deny.
// Mock implements service-role reads and PostgREST filters, never RLS.
function database(practice: typeof row, role: string, ignoreFilters = false) {
  const calls: string[] = [];
  let signs = 0;
  const db = {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let columns = "";
      const q = {
        select(value: string) { columns = value; calls.push(`${table}:select:${value}`); return q; },
        eq(key: string, value: unknown) { filters.push([key, value]); calls.push(`${key}=${value}`); return q; },
        is() { return q; }, or() { return q; }, not() { return q; },
        async maybeSingle() {
          if (table === "practices") {
            if (!ignoreFilters && filters.some(([key, value]) => key !== "authors.slug" && practice[key as keyof typeof practice] !== value)) return { data: null, error: null };
            // Enforce projection for the security column instead of handing back a magical full row.
            return { data: { ...practice, business_only: columns.includes("business_only") ? practice.business_only : undefined }, error: null };
          }
          if (table === "author_members") return { data: role === "author" ? { id: "member" } : null, error: null };
          if (table === "user_practices") return { data: role === "stale-entitlement" ? { access_source: "purchase", expires_at: null, access_level: 1 } : null, error: null };
          if (table === "practice_slug_redirects") return { data: { practice_id: id }, error: null };
          if (table === "audio_items") return { data: { id: "known-track", practice_id: id, audio_path: "secret.mp3", status: "published" }, error: null };
          return { data: null, error: null };
        },
      };
      return q;
    },
    storage: { from: () => ({ createSignedUrl() { signs++; throw new Error("must not sign"); } }) },
  } as unknown as SupabaseClient;
  return { db, calls, signs: () => signs };
}
let units = 0;
for (const role of ["guest", "listener", "stale-entitlement", "b2b-owner", "author", "admin"]) {
  const { db, calls, signs } = database(row, role);
  const userId = role === "guest" ? null : role;
  assert.deepEqual(await getPracticeByAuthorAndSlug(db, "known-author", "known-album"), { practice: null, error: false });
  assert.equal(await resolveLegacyPracticePath(db, "known-album"), null);
  assert.equal(await practiceBelongsToAuthor(db, "artist-id", row.slug), false);
  assert.equal(await canExposePracticeUrl(db, "https://audiolad.ru/practice/known-author/known-album"), false);
  assert.equal(await canUsePracticeOnOpenPlatform(db, { id }), false);
  assert.equal(await canUsePracticeOnOpenPlatform(db, { slug: row.slug }), false);
  const access = await resolveProductAccess(db, row, userId);
  assert.equal(access.canListen, false);
  assert.equal(access.canAcquire, false);
  assert.equal(access.hasEntitlement, false);
  assert.equal(canAcquirePractice(row, { canSeeSelectedUsers: true }), false);
  assert.deepEqual(await signEntitledListenAudio({ userId, authorSlug: "known-author", productSlug: row.slug, audioId: "known-track", practice: row }, {
    createClient: () => db,
    resolveAccess: async () => { throw new Error("must deny before privilege/entitlement checks"); },
    signPath: async () => { throw new Error("must not sign"); },
  }), { ok: false, reason: "not_found" });
  await assert.rejects(buildPublicPracticePreviewClip({ storageClient: db, practiceId: id, audioItem: { id: "known-track", audio_path: "secret.mp3", status: "published" } }), /not_found/);
  await assert.rejects(createSupabaseLibrarySavesStore(db).insert({ userId: role, practiceId: id, createdAt: "2026-01-01" }), /not_found/);
  // grantAccess: rejected in the database (user_practices trigger, PR-A isolated test); no extra app query on the payment path.
  assert.equal((await evaluateLoadedMaxExactPractice(db, row as never, userId)).ok, false);
  assert.deepEqual(mapPracticeRowsToSitemapEntries([{ ...row, created_at: null }]), []);
  assert.deepEqual(mapAuthorPracticeRowsToSitemapEntries([{ ...row, created_at: null }]), []);
  assert.equal(signs(), 0);
  assert.ok(calls.some((call) => call.includes("business_only")));
  assert.equal(isAlbumRadioReleaseRow(row), false);
  assert.equal(isPracticeEligibleForPublicPlaylist(row), false);
  assert.equal(isPracticePromoPageEligible(row), false);
  assert.equal(isPublicCatalogPracticeRow(row), false);
  assert.equal(shouldBlockPublicPracticeAccess(row), true);
  assert.equal(readPublishedDirectLinkTarget(row), null);
  assert.deepEqual(planPracticePublishIndexNow({ business_only: true, authorSlug: "known-author", practiceSlug: row.slug, isFirstPublishOfPractice: true, publishedCountBefore: 0, catalogVisibility: "listed" }), []);
  assert.equal(planPracticeYandexRecrawl({ business_only: true, authorSlug: "known-author", practiceSlug: row.slug, nextStatus: "published", catalogVisibility: "listed" }), null);
  assert.deepEqual(mergeLibraryCollection({ entitlements: [{ id: "old-grant", practiceId: id, accessSource: "purchase", grantedAt: "2026-01-01", expiresAt: null }], saves: [{ practiceId: id, createdAt: "2026-01-01" }], practices: new Map([[id, row]]) }), []);
  console.log(`unit: known URL/ID ${role} – page, legacy, signing, preview, access, catalog, playlists, promo, SEO, library denied`);
  units++;
}
// A stale supplied snapshot must be reloaded before any signing operation.
assert.deepEqual(await signEntitledListenAudio({ userId: "stale-entitlement", authorSlug: "known-author", productSlug: row.slug, audioId: "known-track", practice: { ...row, business_only: false } }, {
  createClient: () => database(row, "stale-entitlement", true).db,
  signPath: async () => { throw new Error("stale snapshot must not sign"); },
}), { ok: false, reason: "not_found" });
// A malicious/incomplete service mock ignoring SQL still hits the row guard.
assert.equal((await getPracticeByAuthorAndSlug(database(row, "admin", true).db, "known-author", row.slug)).practice, null);
for (const visibility of ["listed", "unlisted"]) {
  const normal = { ...row, business_only: false, catalog_visibility: visibility, is_catalog_listed: visibility === "listed" };
  const { db } = database(normal, "listener");
  assert.equal((await getPracticeByAuthorAndSlug(db, "known-author", row.slug)).practice?.id, id);
  assert.equal(await canUsePracticeOnOpenPlatform(db, { id }), true);
  assert.equal((await resolveProductAccess(db, normal, null)).canListen, true);
  assert.equal(canAcquirePractice(normal), true);
  assert.ok(readPublishedDirectLinkTarget(normal));
  assert.equal(isAlbumRadioReleaseRow(normal), visibility === "listed");
  assert.equal(isPublicCatalogPracticeRow(normal), visibility === "listed");
  let signed = 0;
  const result = await signEntitledListenAudio({ userId: null, authorSlug: "known-author", productSlug: normal.slug, audioId: "known-track", practice: normal }, {
    createClient: () => db,
    resolveAccess: async () => ({ mode: "entitled" }),
    signPath: async () => { signed++; return { url: "https://storage.invalid/signed" }; },
  });
  assert.equal(result.ok, true);
  assert.equal(signed, 1);
  console.log(`unit: ${visibility} regression – direct link, free access, acquisition, signing preserved`);
  units++;
}
for (const viewer of [undefined, { userId: "listener", allowlistedPracticeIds: [id], entitledPracticeIds: [], hiddenPracticeIds: [] }]) {
  const { db, calls } = database(row, "listener");
  applyOrdinaryCatalogEligibility(db.from("practices").select("id, business_only"), viewer);
  assert.ok(calls.includes("business_only=false"));
}

// Static wiring checks deliberately reported as static, not live route tests.
// Each consumer is linked to an executable gate above; DB/network are not used.
const queryFiles = [
  "studio/server/catalog-assets", "studio-music/catalog", "studio-music/preview",
  "seo-queries/queries", "seo-queries/author-discovery-repository", "seo-queries/load-published-seo-occupancy", "seo-queries/list-audio-sprint-queries",
  "authors/space-ops",
  "products/lookup", "products/catalog", "products/practice-seo-content", "products/access-links-server",
  "listen/page-shared", "listen/load-session-payload", "listen/signed-audio", "listen/sign-entitled-audio", "listen/serve-preview-clip-response",
  "authors/lookup", "authors/profile", "authors/public-page", "authors/public-list-data", "authors/similar-authors",
  "catalog/author-search", "history/queries", "home/listening-progress", "library/collection", "max/library-visibility", "max/storefront-preview",
  "mini-app/published-product-target", "topics/queries", "seo/sitemap-data", "seo/articles/load", "seo/indexnow/hooks",
  "business-app/guest-coffee/load.server", "business-app/onboarding-preview.server", "promo-pages/eligible-products", "playlists/editorial-practices", "playlists/membership", "quick-offers/offers-api",
];
const staticVectors: Array<[string, string, string]> = [];
for (const name of queryFiles) {
  const file = `src/lib/${name}.${name === "listen/page-shared" ? "tsx" : "ts"}`;
  const source = read(file);
  // Every direct practice query gets its own deny, not merely one check per file.
  const blocks = source.split('.from("practices")').slice(1);
  assert.ok(blocks.length, file);
  for (const block of blocks) {
    assert.match(block.slice(0, block.indexOf(";")), /\.eq\(BUSINESS_ONLY_COLUMN, false\)/, file);
    const literal = block.match(/^\s*\.select\(\s*(["`])([\s\S]*?)\1/);
    if (literal) assert.ok(literal[2].includes("business_only"), `${file}: select must include flag`);
    else {
      const constant = block.match(/\.select\((\w+)\)/)?.[1];
      assert.ok(constant, `${file}: audit new select shape`);
      const declaration = source.slice(source.indexOf(`const ${constant} =`));
      assert.ok(declaration.slice(0, declaration.indexOf(";")).includes("business_only"), `${file}: ${constant} must include flag`);
    }
  }
  staticVectors.push([name, file, "eq(BUSINESS_ONLY_COLUMN, false)"]);
}
for (const [file, guard] of [
  ["src/app/(platform)/(listener)/practice/[...segments]/page.tsx", "getPracticeByAuthorAndSlug"],
  ["src/app/(platform)/listen/[...segments]/page.tsx", "getPracticeByAuthorAndSlug"],
  ["src/app/embed/practice/[authorSlug]/[productSlug]/page.tsx", "getPracticeByAuthorAndSlug"],
  ["src/lib/max/exact-product.ts", "isBusinessOnlyPractice(practice)"],
  ["src/app/api/listen/album-radio/route.ts", 'reason: "not_found"'],
  ["src/lib/listen/api-context.ts", "isBusinessOnlyPractice(practiceRow)"],
  ["src/lib/listen/serve-preview-clip.ts", "canUsePracticeOnOpenPlatform"],
  ["src/app/api/checkout/studio-music/route.ts", "canUsePracticeOnOpenPlatform"],
  ["src/app/api/checkout/course-upgrade/route.ts", "canUsePracticeOnOpenPlatform"],
  ["src/lib/payments/start-tochka-checkout.ts", "canUsePracticeOnOpenPlatform"],
  ["src/app/api/playlists/membership/route.ts", "canUsePracticeOnOpenPlatform"],
  ["src/app/api/playlists/[id]/editorial-practices/route.ts", "canUsePracticeOnOpenPlatform"],
  ["src/app/api/playlists/[id]/items/[practiceId]/replace/route.ts", "canUsePracticeOnOpenPlatform"],
  ["src/app/api/orders/route.ts", "canUsePracticeOnOpenPlatform"],
  ["src/app/api/payments/route.ts", "canUsePracticeOnOpenPlatform"],
  ["src/app/api/library/claim/route.ts", "canUsePracticeOnOpenPlatform"],
  ["src/lib/library/saves.ts", "canUsePracticeOnOpenPlatform"],
  ["src/lib/pricing/rpc.ts", "canUsePracticeOnOpenPlatform"],
  ["src/app/api/price-promotions/start/route.ts", "canUsePracticeOnOpenPlatform"],
  ["src/lib/quick-offers/public-page.ts", "canUsePracticeOnOpenPlatform"],
  ["src/lib/promo-pages/public-page.ts", "canUsePracticeOnOpenPlatform"],
  ["src/lib/products/access-links-server.ts", "assertOpenPlatformAccessLink"],
  ["src/lib/seo/search-recrawl/enqueue.ts", "canExposePracticeUrl"],
  ["src/lib/seo/indexnow/notify.ts", "canExposePracticeUrl"],
  ["src/lib/seo/yandex-webmaster/notify.ts", "canExposePracticeUrl"],
  ["src/lib/playlists/public-detail.ts", "isBusinessOnlyPractice(practice)"],
  ["src/lib/playlists/detail.ts", "isBusinessOnlyPractice(practice)"],
  ["src/lib/authors/profile.ts", "isBusinessOnlyPractice(practice)"],
  ["src/lib/private-audio/server/signed-urls.ts", ".from(PRIVATE_AUDIO_BUCKET)"],
  ["src/app/api/my-library/private-audio/[id]/audio/route.ts", "getOwnedPrivateAudioItem(user.id, id)"],
  ["src/lib/personal-materials/server/delivery.ts", '.from("personal_materials")'],
  ["src/app/api/public-content/revision/route.ts", '.from("public_content_revision")'],
  ["src/app/api/listen/resume-session/route.ts", ".eq(BUSINESS_ONLY_COLUMN, false)"],
  ["src/app/api/orders/pending/route.ts", ".eq(BUSINESS_ONLY_COLUMN, false)"],
  ["src/app/api/checkout/status/route.ts", "canUsePracticeOnOpenPlatform"],
  ["src/app/api/orders/[id]/route.ts", "canUsePracticeOnOpenPlatform"],
] as const) {
  assert.ok(read(file).includes(guard), `${file}: ${guard}`);
  staticVectors.push([file, file, guard]);
}
function files(dir: string): string[] {
  return readdirSync(resolve(root, dir), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
}
for (const file of files("src/app/api/listen").filter((f) => f.endsWith("route.ts"))) {
  assert.match(read(file), /loadListenApiContext|loadListenSessionPayload|resolveLegacyPracticePath|getPracticeByLegacyListenSlug|serveListenSignedAudio|serveListenPreviewClip|handleListenStats|handlePracticeRating|getPracticeByAuthorAndSlug|selectAlbumRadio|commentStore/, file);
  staticVectors.push(["listen route", file, "shared listen gate"]);
}
assert.match(read("next.config.ts"), /private, no-store/);
assert.match(read("src/app/(platform)/(listener)/practice/[...segments]/page.tsx"), /if \(error \|\| !practice\) \{\s*notFound\(\)/);
assert.match(read("src/app/(platform)/(listener)/practice/[...segments]/page.tsx"), /dynamic = "force-dynamic"/);
assert.match(read("src/lib/catalog/search.ts"), /CATALOG_PRACTICE_SEARCH_SELECT = `\s*business_only,/);
for (const file of ["src/lib/business-workspace/sign.server.ts", "src/lib/business-workspace/load.server.ts"]) {
  assert.doesNotMatch(read(file), /isBusinessOnlyPractice|BUSINESS_ONLY_COLUMN|canUsePracticeOnOpenPlatform/);
}
for (const [vector, file, guard] of staticVectors) console.log(`static: ${vector} | ${file} | ${guard}`);
console.log(`business-only-leaks: PASS – ${units} role/regression cases, ${staticVectors.length} static wiring checks`);
