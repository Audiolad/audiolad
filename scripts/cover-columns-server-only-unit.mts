/**
 * Cover columns and gallery slide images are written only by the server
 * (migration 20270118120000, docs/security/cover-columns-server-only.md).
 * Helper behaviour with a fake client plus route wiring checks.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  gallerySlidePrefix,
  isGallerySlideId,
  writePracticeCoverColumns,
  writeTrackCoverColumns,
} from "../src/lib/author-products/cover-storage";
import {
  deleteAuthorGallerySlide,
  replaceAuthorGallerySlideImage,
} from "../src/lib/author-products/gallery";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function source(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

const P = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";
const S = "44444444-4444-4444-8444-444444444444";

// ---------------------------------------------------------------------------
// isGallerySlideId / gallerySlidePrefix
// ---------------------------------------------------------------------------
assert(isGallerySlideId(S), "uuid accepted");
assert(isGallerySlideId(S.toUpperCase()), "upper-case uuid accepted");
for (const bad of ["", "s1", `${S}/..`, `../${S}`, `${S} `, `${S}x`, "..", "a/b", null, undefined, 1]) {
  assert(!isGallerySlideId(bad as unknown as string), `rejected: ${String(bad)}`);
}
assert(gallerySlidePrefix(P, S) === `practices/${P}/gallery/${S}/`, "gallery slide prefix");

// ---------------------------------------------------------------------------
// Fake Supabase client (records the query chain)
// ---------------------------------------------------------------------------
type Call = [string, ...unknown[]];
type Result = { data: unknown; error: unknown };

function fakeClient(results: Result[]) {
  const calls: Call[][] = [];
  const removed: Array<{ bucket: string; paths: string[] }> = [];
  const client = {
    from(table: string) {
      const chain: Call[] = [["from", table]];
      calls.push(chain);
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "update", "insert", "delete", "eq", "is", "order"]) {
        builder[method] = (...args: unknown[]) => {
          chain.push([method, ...args]);
          return builder;
        };
      }
      const next = () => Promise.resolve(results.shift() ?? { data: null, error: null });
      builder.maybeSingle = () => {
        chain.push(["maybeSingle"]);
        return next();
      };
      builder.single = () => {
        chain.push(["single"]);
        return next();
      };
      builder.then = (resolveFn: (value: Result) => unknown, rejectFn: (e: unknown) => unknown) =>
        next().then(resolveFn, rejectFn);
      return builder;
    },
    storage: {
      from(bucket: string) {
        return {
          async remove(paths: string[]) {
            removed.push({ bucket, paths });
            return { data: [], error: null };
          },
        };
      },
    },
  };
  return { client: client as never, calls, removed };
}

const patch = { cover_url: "https://example.test/c.webp", cover_image: { v: 1 }, updated_at: "t" };

{
  const f = fakeClient([{ data: { id: P }, error: null }]);
  const result = await writePracticeCoverColumns(f.client, P, patch);
  assert(result.ok, "practice write ok");
  const chain = JSON.stringify(f.calls[0]);
  assert(
    chain ===
      JSON.stringify([
        ["from", "practices"],
        ["update", patch],
        ["eq", "id", P],
        ["is", "deleted_at", null],
        ["select", "id"],
        ["maybeSingle"],
      ]),
    `practice write chain: ${chain}`,
  );
}
{
  const f = fakeClient([{ data: null, error: null }]);
  const result = await writePracticeCoverColumns(f.client, P, patch);
  assert(!result.ok && result.error === "practice_not_found", "practice not found");
}
{
  const f = fakeClient([{ data: null, error: { message: "boom" } }]);
  const result = await writePracticeCoverColumns(f.client, P, patch);
  assert(!result.ok && result.error !== "practice_not_found", "practice error propagated");
}
{
  const f = fakeClient([{ data: { id: A }, error: null }]);
  const result = await writeTrackCoverColumns(f.client, P, A, patch);
  assert(result.ok, "track write ok");
  const chain = JSON.stringify(f.calls[0]);
  assert(
    chain.startsWith(JSON.stringify([["from", "audio_items"], ["update", patch]]).slice(0, -1)) &&
      chain.includes(JSON.stringify(["eq", "id", A])) &&
      chain.includes(JSON.stringify(["eq", "practice_id", P])),
    `track write is scoped to the product: ${chain}`,
  );
}
{
  const f = fakeClient([{ data: null, error: null }]);
  const result = await writeTrackCoverColumns(f.client, P, A, patch);
  assert(!result.ok && result.error === "audio_item_not_found", "track not found");
}

// ---------------------------------------------------------------------------
// Gallery cleanup is scoped to the slide prefix
// ---------------------------------------------------------------------------
const variant = (path: string) => ({ path, width: 1, height: 1, byteSize: 1, mimeType: "image/webp" });
const slideRow = {
  id: S,
  publication_id: P,
  image_url: "https://example.test/old.webp",
  image_manifest: {
    version: 1,
    versionId: "v1",
    profile: "product-gallery",
    sourceWidth: 10,
    sourceHeight: 10,
    originalPath: `practices/${OTHER}/variants/v1/original.png`,
    variants: {
      md: variant(`practices/${P}/gallery/${S}/variants/v1/md.webp`),
      lg: variant(`practices/${P}/variants/v1/lg.webp`),
      sm: variant(`practices/${P}/gallery/${S}/../../variants/v1/sm.webp`),
    },
  },
  position: 1,
  alt: null,
};
const originalWarn = console.warn;
console.warn = () => undefined;
try {
  {
    const f = fakeClient([
      { data: slideRow, error: null },
      { data: { ...slideRow, image_url: "https://example.test/new.webp" }, error: null },
    ]);
    await replaceAuthorGallerySlideImage(f.client, P, S, {
      imageUrl: "https://example.test/new.webp",
      imageManifest: null,
    });
    assert(f.removed.length === 1, `replace: one remove call, got ${f.removed.length}`);
    assert(
      JSON.stringify(f.removed[0].paths) ===
        JSON.stringify([`practices/${P}/gallery/${S}/variants/v1/md.webp`]),
      `replace removes only the slide's own files: ${JSON.stringify(f.removed[0].paths)}`,
    );
  }
  {
    const f = fakeClient([
      { data: slideRow, error: null },
      { data: null, error: null },
      { data: [], error: null },
    ]);
    await deleteAuthorGallerySlide(f.client, P, S);
    assert(f.removed.length === 1, `delete: one remove call, got ${f.removed.length}`);
    assert(
      JSON.stringify(f.removed[0].paths) ===
        JSON.stringify([`practices/${P}/gallery/${S}/variants/v1/md.webp`]),
      `delete removes only the slide's own files: ${JSON.stringify(f.removed[0].paths)}`,
    );
  }
} finally {
  console.warn = originalWarn;
}

// ---------------------------------------------------------------------------
// Route wiring
// ---------------------------------------------------------------------------
const productCover = source("src/app/api/author/products/[id]/cover/route.ts");
const trackCover = source("src/app/api/author/products/[id]/audio/[audioId]/cover/route.ts");
for (const [name, text, writer] of [
  ["product cover", productCover, "writePracticeCoverColumns(coverWriter"],
  ["track cover", trackCover, "writeTrackCoverColumns(coverWriter"],
] as const) {
  assert(!/supabase\s*\.from\("(practices|audio_items)"\)\s*\.update\(/.test(text), `${name}: no user-client cover update`);
  assert(!/\.update\(\{\s*cover_/.test(text), `${name}: cover columns only via helper`);
  assert((text.match(new RegExp(writer.replace("(", "\\("), "g")) ?? []).length >= 2, `${name}: writes via ${writer}`);
  assert(
    text.indexOf("requirePracticeMutationAccess(") < text.indexOf("createPracticeImageWriteClient()"),
    `${name}: access checked before the server client is created`,
  );
}

const galleryPost = source("src/app/api/author/products/[id]/gallery/route.ts");
const gallerySlide = source("src/app/api/author/products/[id]/gallery/[slideId]/route.ts");
const galleryReorder = source("src/app/api/author/products/[id]/gallery/reorder/route.ts");
const galleryLib = source("src/lib/author-products/gallery.ts");

for (const [name, text] of [
  ["gallery POST", galleryPost],
  ["gallery slide", gallerySlide],
] as const) {
  assert(!text.includes("supabase.storage"), `${name}: no user-client storage`);
  assert(!text.includes("cleanupImageManifest("), `${name}: unscoped cleanup removed`);
  assert(text.includes("storage: writer.storage"), `${name}: upload via server client`);
  assert(text.includes("gallerySlidePrefix(id, slideId)"), `${name}: cleanup scoped to the slide`);
  assert(
    text.indexOf("assertPracticePublicContentEditableForActor(") <
      text.indexOf("createPracticeImageWriteClient()"),
    `${name}: editability checked before the server client is created`,
  );
}
assert(galleryPost.includes("insertAuthorGallerySlide(writer,"), "gallery POST inserts via writer");
assert(gallerySlide.includes("replaceAuthorGallerySlideImage(writer,"), "gallery PATCH replaces via writer");
assert(
  /deleteAuthorGallerySlide\(\s*createPracticeImageWriteClient\(\)/.test(gallerySlide),
  "gallery DELETE via server client",
);
for (const handler of ["export async function PATCH", "export async function DELETE"]) {
  const body = gallerySlide.slice(gallerySlide.indexOf(handler));
  assert(
    body.indexOf("isGallerySlideId(slideId)") >= 0 &&
      body.indexOf("isGallerySlideId(slideId)") < body.indexOf("requirePracticeMutationAccess("),
    `${handler}: slideId validated first`,
  );
}
assert(!galleryReorder.includes("createPracticeImageWriteClient"), "reorder stays on the user client");
assert(!galleryLib.includes("cleanupImageManifest"), "gallery lib: unscoped cleanup removed");

console.log("cover-columns-server-only-unit: ok");
