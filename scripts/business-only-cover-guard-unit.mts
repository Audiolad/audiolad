import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Cover leak: business-only albums must not upload images into the public covers bucket.
const { assertBusinessOnlyCoverUploadAllowed, BUSINESS_ONLY_COVER_UPLOAD_BLOCKED, BUSINESS_ONLY_COVER_UPLOAD_BLOCKED_MESSAGE } = await import('../src/lib/business-track-passports/cover-guard');
const { handleAuthorRouteError } = await import('../src/lib/author-products/auth');
assert.doesNotThrow(() => assertBusinessOnlyCoverUploadAllowed({ business_only: false }));
assert.doesNotThrow(() => assertBusinessOnlyCoverUploadAllowed({}));
let blocked: unknown = null;
try { assertBusinessOnlyCoverUploadAllowed({ business_only: true }); } catch (error) { blocked = error; }
assert.ok(blocked, 'business-only cover upload must throw');
const response = handleAuthorRouteError(blocked);
assert.equal(response.status, 409);
const body = await response.json() as { error: string; message: string };
assert.equal(body.error, BUSINESS_ONLY_COVER_UPLOAD_BLOCKED);
assert.equal(body.message, BUSINESS_ONLY_COVER_UPLOAD_BLOCKED_MESSAGE);
assert.doesNotMatch(body.message, /—/);
const routes: [string, string, RegExp][] = [
  ['src/app/api/author/products/[id]/gallery/route.ts', 'export async function POST', /insertAuthorGallerySlide|uploadOptimizedImageSet/],
  ['src/app/api/author/products/[id]/gallery/[slideId]/route.ts', 'export async function PATCH', /replaceAuthorGallerySlideImage|uploadOptimizedImageSet/],
];
for (const [path, handler, sink] of routes) {
  const text = read(path);
  const body = text.slice(text.indexOf(handler));
  const end = body.indexOf('\nexport async function', 1);
  const handlerBody = end > 0 ? body.slice(0, end) : body;
  const guard = handlerBody.indexOf('assertBusinessOnlyCoverUploadAllowed(practice)');
  const firstSink = handlerBody.search(sink);
  assert.ok(guard > 0 && firstSink > guard, `${path} ${handler}: business-only guard must run before any image upload`);
}
const sql = read('supabase/migrations/20270311120000_business_track_passports.sql');
for (const table of ['practices', 'audio_items', 'publication_gallery_slides']) {
  assert.match(sql, new RegExp(`BEFORE INSERT OR UPDATE ON public\\.${table}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.guard_business_only_public_images`));
}
assert.match(read('supabase/rollback/20270311120000_business_track_passports.down.sql'), /DROP FUNCTION public\.guard_business_only_public_images\(\);/);
// PR-D: album/track covers of closed albums go to the private bucket (business-private-covers-unit);
// only the gallery stays blocked and hidden.
const form = read('src/components/author-dashboard/AuthorProductForm.tsx');
assert.match(form, /\(!businessOnly \|\| \(initialProduct\?\.gallery_slides\?\.length \?\? 0\) > 0\)/, 'gallery hidden for business-only without slides');
assert.match(read('supabase/migrations/20270311120000_business_track_passports.sql'), /^BEGIN;\nSET LOCAL lock_timeout = '5s';/m);
console.log('business-only-cover-guard: PASS (helper 409 + Russian message, 2 gallery upload routes guarded before storage, DB triggers on practices/audio_items/gallery, rollback, author form hides gallery, lock_timeout)');
