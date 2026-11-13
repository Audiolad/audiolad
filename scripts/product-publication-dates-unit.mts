import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatProductDate, productFirstPublicationAt } from "../src/lib/products/publication-dates";

const now = new Date("2026-11-13T12:00:00Z");
const stamp = "2026-11-12T21:30:00Z";
assert.equal(formatProductDate(stamp), "13 ноября 2026 г.");
assert.equal(formatProductDate("2026-11-12T20:59:59Z"), "12 ноября 2026 г.");
for (const invalid of [null, undefined, "", "invalid"]) assert.equal(formatProductDate(invalid), null);
assert.equal(productFirstPublicationAt({ first_published_at: stamp }, now), stamp);
assert.equal(productFirstPublicationAt({ first_published_at: "invalid" }, now), null);
assert.equal(productFirstPublicationAt({ first_published_at: "2030-01-01" }, now), null);
assert.equal(productFirstPublicationAt({ status: "published", published_at: stamp }, now), null);
assert.equal(productFirstPublicationAt({ status: "published", first_publication_date_unknown: true, published_at: stamp }, now), null);
const scheduled = { status: "published", first_publication_date_unknown: false, scheduled_publish_at: stamp };
assert.equal(productFirstPublicationAt(scheduled, now), stamp);
assert.equal(productFirstPublicationAt({ ...scheduled, status: "draft" }, now), null);
assert.equal(productFirstPublicationAt({ ...scheduled, status: "unpublished" }, now), null);
assert.equal(productFirstPublicationAt({ ...scheduled, scheduled_publish_at: "2030-01-01" }, now), null);
assert.equal(productFirstPublicationAt({ ...scheduled, first_publication_date_unknown: true }, now), null);
assert.equal(productFirstPublicationAt({ ...scheduled, first_publication_date_unknown: undefined }, now), null);
assert.equal(productFirstPublicationAt({ ...scheduled, first_published_at: "2026-11-01T00:00:00Z" }, now), "2026-11-01T00:00:00Z");
// Wiring checks: the shared practice/music/course hero and both post layouts
// must receive the same factual date, independent of SEO article templates.
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
assert.match(read("src/components/products/practice-page/PracticePageContent.tsx"), /ProductPublicationDate publishedAt=\{viewModel.firstPublishedAt\}/);
assert.equal((read("src/components/products/audio-post/AudioPostPage.tsx").match(/ProductPublicationDate publishedAt=/g) ?? []).length, 2);
assert.match(read("src/components/author-dashboard/AuthorDashboardClient.tsx"), /Создан \{createdDate\}/);
assert.match(read("src/components/author-dashboard/AuthorDashboardClient.tsx"), /productIsPublic && firstPublicationDate/);
assert.equal((read("src/components/author-dashboard/AuthorMusicClient.tsx").match(/<MusicProductDates item=/g) ?? []).length, 2);
console.log("product-publication-dates-unit: Moscow dates, unknown history, schedule, UI wiring: PASS");
