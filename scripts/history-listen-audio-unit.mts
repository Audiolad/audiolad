import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Execute the actual private page loader without importing the Next/React shell.
// Keep the real delivery validation; only database and presentation are mocked.
function evaluate(source: string, imports: Record<string, unknown>) {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} as Record<string, (...args: any[]) => any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
  new Function("require", "module", "exports", js)((name: string) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports;
}

const stream = {
  id: "asset-1", audio_item_id: "track-1", asset_role: "stream",
  lifecycle_state: "verified", storage_bucket: "music-streams", storage_path: "track.mp3",
};
let assets = [stream];
let rows = [track()];
let queryError: { message: string } | null = null;

function track(overrides = {}) {
  return {
    id: "track-1", title: "Music", description: null, position: 1,
    duration_seconds: 180, audio_path: null, active_music_delivery_asset_id: "asset-1",
    cover_url: null, updated_at: null, status: "published", ...overrides,
  };
}

function database(table: string) {
  let columns: string[] = [];
  const filters: Array<[string, unknown]> = [];
  const query = {
    select(value: string) { columns = value.split(",").map((s) => s.trim()); return query; },
    eq(key: string, value: unknown) { filters.push([key, value]); return query; },
    in() { return query; },
    order() { return query; },
    then(resolve: (value: unknown) => unknown) {
      const source = table === "music_audio_assets" ? assets : rows;
      const data = source
        .filter((row) => filters.every(([key, value]) => key === "practice_id" || row[key as keyof typeof row] === value))
        .map((row) => Object.fromEntries(columns.map((key) => [key, row[key as keyof typeof row]])));
      return Promise.resolve({ data, error: table === "audio_items" ? queryError : null }).then(resolve);
    },
  };
  return query;
}
const supabase = { from: database };
const serviceRole = { createServiceRoleClient: () => supabase };
const musicDelivery = evaluate(read("src/lib/listen/music-delivery.ts"), {
  "@/lib/author-products/music-master-upload-contract": { MUSIC_STREAMS_BUCKET: "music-streams" },
});
const validated = evaluate(read("src/lib/listen/validated-active-music-delivery.ts"), {
  "@/lib/listen/music-delivery": musicDelivery,
  "@/lib/supabase/service-role": serviceRole,
});
const status = evaluate(read("src/lib/listen/course-audio-status.ts"), {});
const page = read("src/lib/listen/page-shared.tsx");
const ast = ts.createSourceFile("page-shared.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const loader = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "loadListenTracks");
assert.ok(loader, "Fullscreen listen must have its track loader");
const { loadListenTracks } = evaluate(`
  import { resolvePlayableAudioItemRows } from "delivery";
  import { shouldApplyEntitledPublishedAudioFilter } from "status";
  import { isCoursePublication, resolveCourseLearnerAccess, listAccessibleCourseAudioItemIds,
    createServiceRoleClient, mapRowToListenTrack, mapLegacyPracticeToListenTrack } from "dependencies";
  ${loader.getText(ast)}
  export { loadListenTracks };
`, {
  delivery: validated,
  status,
  dependencies: {
    ...serviceRole,
    isCoursePublication: (publicationClass: string) => publicationClass === "course",
    resolveCourseLearnerAccess: async () => ({}),
    listAccessibleCourseAudioItemIds: async () => new Set(["track-1"]),
    mapRowToListenTrack: (row: { id: string }) => ({ id: row.id }),
    mapLegacyPracticeToListenTrack: () => ({ id: "legacy-practice-1" }),
  },
});
const practice = { id: "practice-1", product_kind: "music", audio_url: null };
const load = (overrides = {}) => loadListenTracks(supabase, { ...practice, ...overrides }, "entitled", "user-1");

assert.deepEqual(await load(), [{ id: "track-1" }],
  "History /listen must retain verified delivery-only music with null audio_path");
assert.match(page, /import \{ resolvePlayableAudioItemRows \} from "@\/lib\/listen\/validated-active-music-delivery"/);
assert.deepEqual(await load({ publication_class: "course" }), [{ id: "track-1" }],
  "Course query must also select the delivery pointer");

for (const invalid of [
  { audio_item_id: "another-track" }, { asset_role: "master" },
  { lifecycle_state: "pending" }, { storage_bucket: "music-masters" }, { storage_path: " " },
]) {
  assets = [{ ...stream, ...invalid }];
  assert.deepEqual(await load(), [], "Unverified/foreign assets must not become playable");
}
assets = [];
assert.deepEqual(await load(), [], "Dangling pointer must not become playable");
assets = [stream];
assert.deepEqual(await load({ product_kind: "practice" }), [], "Delivery applies only to music");
rows = [track({ audio_path: "legacy.mp3", active_music_delivery_asset_id: null })];
assert.deepEqual(await load({ product_kind: "practice" }), [{ id: "track-1" }], "Legacy audio_path still plays");
rows = [track({ status: "draft" })];
assert.deepEqual(await load(), [], "Published filter remains enforced");
rows = [];
assert.deepEqual(await load(), [], "Truly missing audio still shows unavailable");
assert.deepEqual(await load({ audio_url: "legacy.mp3" }), [{ id: "legacy-practice-1" }], "Practice fallback remains supported");
assert.deepEqual(await load({ publication_class: "course", audio_url: "legacy.mp3" }), [], "Course has no legacy fallback");
queryError = { message: "lookup failed" };
await assert.rejects(load, /audio_items_lookup_failed/);

// The history action reaches this loader; the catalog uses the shared validator.
assert.match(read("src/lib/history/queries.ts"), /actionHref: buildListenPath\(input.authorSlug, input.productSlug/);
assert.match(read("src/lib/listen/load-session-payload.ts"), /await resolvePlayableAudioItemRows\(/);
const pkg = JSON.parse(read("package.json"));
assert.equal(pkg.scripts["test:history-listen-audio"], "npx tsx scripts/history-listen-audio-unit.mts");
assert.match(read(".github/workflows/pr-repository-validation.yml"), /npm run test:history-listen-audio/);
console.log("history-listen-audio-unit: ok");
