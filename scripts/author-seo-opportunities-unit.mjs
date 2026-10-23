#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { selectAuthorSeoOpportunities } from "../src/lib/seo-queries/opportunity-list.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const row = (id, lifecycle = "available", reservationId = null, extra = {}) => ({
  id, lifecycle, reservationId, queryText: `музыка ${id}`,
  clusterName: "Отдых", recommendedFormat: "music", ...extra,
});
const ids = (items) => items.map((item) => item.id);

// Source order represents created_at DESC, id ASC. Partitioning stays stable.
const source = [
  row("free-new"),
  row("other", "in_progress"), // repository redacts foreign reservation ids
  row("published-own", "published", "used-own"),
  row("own-new", "in_progress", "active-new"),
  row("published-legacy", "published"),
  row("moderation", "moderation", "active-submitted"),
  row("free-old", "available", null, { clusterName: "Сон", recommendedFormat: "practice" }),
  row("own-old", "in_progress", "active-old"),
  row("other-moderation", "moderation"),
];
const before = structuredClone(source);
const allowed = selectAuthorSeoOpportunities(source);
assert.deepEqual(ids(allowed), ["own-new", "moderation", "own-old", "free-new", "free-old"]);
assert.deepEqual(source, before, "selection must not mutate server props");
assert.deepEqual(ids(selectAuthorSeoOpportunities(allowed)), ids(allowed));
assert.equal(allowed.filter((item) => item.reservationId).length, 3);

// Search, both selects, total and user-facing pagination use only this source.
const search = (items, query = "", cluster = "", format = "") => items.filter((item) =>
  item.queryText.includes(query)
  && (!cluster || item.clusterName === cluster)
  && (!format || item.recommendedFormat === format),
);
assert.deepEqual(ids(search(allowed, "музыка", "Отдых", "music")), [
  "own-new", "moderation", "own-old", "free-new",
]);
assert.deepEqual(ids(search(allowed, "", "Сон", "practice")), ["free-old"]);
assert.equal(search(allowed, "published").length, 0);
assert.equal(search(allowed, "other").length, 0);
assert.equal(allowed.length, 5);
assert.deepEqual(ids(allowed.slice(0, 2)), ["own-new", "moderation"]);
assert.deepEqual(ids(allowed.slice(2, 4)), ["own-old", "free-new"]);

assert.deepEqual(ids(selectAuthorSeoOpportunities([row("free"), row("used", "published", "used") ])), ["free"]);
assert.deepEqual(selectAuthorSeoOpportunities([]), []);
const atLimit = selectAuthorSeoOpportunities([
  row("free"),
  ...Array.from({ length: 5 }, (_, i) => row(`own-${i}`, "in_progress", `res-${i}`)),
]);
assert.deepEqual(ids(atLimit), ["own-0", "own-1", "own-2", "own-3", "own-4", "free"]);
assert.equal(atLimit.filter((item) => item.reservationId).length, 5);

// A reserve immediately moves the card to own work; publication removes it.
const reserved = selectAuthorSeoOpportunities(source.map((item) => item.id === "free-old"
  ? { ...item, lifecycle: "in_progress", reservationId: "new-res" } : item));
assert.deepEqual(ids(reserved), ["own-new", "moderation", "free-old", "own-old", "free-new"]);
const published = selectAuthorSeoOpportunities(reserved.map((item) => item.id === "free-old"
  ? { ...item, lifecycle: "published" } : item));
assert.equal(published.some((item) => item.id === "free-old"), false);

// Full source, including rows beyond PostgREST's 1000-row transport boundary.
const large = selectAuthorSeoOpportunities([
  ...Array.from({ length: 1100 }, (_, i) => row(`published-${i}`, "published")),
  row("free-after-page"), row("own-after-page", "in_progress", "res-after-page"),
]);
assert.deepEqual(ids(large), ["own-after-page", "free-after-page"]);

// Integration contracts: exclude on the server, before serializing to the UI.
const repository = read("src/lib/seo-queries/queries.ts");
const listing = repository.slice(repository.indexOf("export async function listSeoOpportunitiesForAuthor"));
assert.match(listing, /fetchAllPages/);
assert.match(listing, /\.order\("created_at", \{ ascending: false \}\)/);
assert.match(listing, /\.order\("id"\)/);
assert.match(listing, /loadPublishedSeoOccupancyForQueries/);
assert.match(listing, /reservation\.author_id !== authorId\) return \[\]/);
assert.match(listing, /if \(lifecycle === "published"\) return \[\]/);
assert.ok(listing.indexOf('if (lifecycle === "published")') < listing.indexOf("return [{"));
assert.match(listing, /return selectAuthorSeoOpportunities\(opportunities\)/);

// The opened workspace is resolved by the existing support-aware server guard.
const page = read("src/app/(platform)/author-dashboard/seo-opportunities/page.tsx");
const auth = read("src/lib/author-products/auth.ts");
assert.match(page, /listAuthorWorkspacesForUser\(user\.id\)/);
assert.ok(page.indexOf("requireAuthorMembership(workspace.id)") < page.indexOf("listSeoOpportunitiesForAuthor(workspace.id)"));
assert.match(auth, /execution\.realUserId === userId/);
assert.match(auth, /id: execution\.actingAuthorId/);
assert.match(auth, /requestedAuthorMatchesSupport\(execution, authorId\)/);
const route = read("src/app/api/author/seo-reservations/route.ts");
assert.ok(route.indexOf("await requireAuthorMutationMembership(authorId)") < route.indexOf('supabase.rpc("reserve_seo_query"'));

const client = read("src/components/author-dashboard/AuthorSeoOpportunitiesClient.tsx");
assert.match(client, /local\.authorId === authorId && local\.source === opportunities/);
assert.match(client, /selectAuthorSeoOpportunities/);
assert.match(client, /subscribeToPageReturn/);
assert.equal((client.match(/router\.refresh\(\)/g) ?? []).length, 6);
assert.match(client, /activeCount >= SEO_ACTIVE_RESERVATION_LIMIT/);
assert.match(client, /lifecycleLabel\(own \? "in_progress" : "available"\)/);
assert.doesNotMatch(client, /—/);
console.log("author-seo-opportunities-unit: ok");
