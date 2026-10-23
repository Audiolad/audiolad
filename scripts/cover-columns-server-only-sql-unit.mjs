#!/usr/bin/env node
/**
 * Cover / gallery image columns are server-only (migration 20270118120000).
 *
 * Static checks always run. The SQL smoke runs on a throwaway database
 * (scripts/lib/scratch-postgres.mjs): never a remote or production database.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runScratchPostgresSmoke } from "./lib/scratch-postgres.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "20270118120000";
const MIGRATION_NAME = `${VERSION}_cover_columns_server_only.sql`;
const PREVIOUS_STORAGE_MIGRATION = "20270117120000_practice_covers_server_only_cover_writes.sql";
const LABEL = "cover-columns-server-only-sql-unit";
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// Static checks
// ---------------------------------------------------------------------------
const names = readdirSync(join(ROOT, "supabase/migrations")).filter((n) => n.endsWith(".sql"));
const versions = names.map((n) => n.match(/^(\d{14})_/)?.[1]).filter(Boolean);
assert(names.includes(MIGRATION_NAME), `missing migration ${MIGRATION_NAME}`);
assert(versions.filter((v) => v === VERSION).length === 1, `migration version ${VERSION} must be unique`);

const migration = read(`supabase/migrations/${MIGRATION_NAME}`);
const code = migration.replace(/^\s*--.*$/gm, "");
for (const [table, trigger] of [
  ["public.practices", "guard_practices_cover_server_only_trigger"],
  ["public.audio_items", "guard_audio_items_cover_server_only_trigger"],
  ["public.publication_gallery_slides", "guard_gallery_slides_image_server_only_trigger"],
]) {
  assert(code.includes(`DROP TRIGGER IF EXISTS ${trigger} ON ${table}`), `${trigger}: idempotent drop`);
  assert(
    new RegExp(`CREATE TRIGGER ${trigger}\\s+BEFORE INSERT OR UPDATE ON ${table.replace(".", "\\.")}`).test(code),
    `${trigger}: BEFORE INSERT OR UPDATE on ${table}`,
  );
}
assert(
  (code.match(/IF current_user NOT IN \('authenticated', 'anon'\) THEN/g) ?? []).length === 2,
  "guards only apply to authenticated / anon",
);
assert(!/current_setting\(/.test(code), "no GUC bypass in the guards");
assert(!/SECURITY DEFINER/.test(code), "guards run as the caller");
assert((code.match(/ERRCODE = '42501'/g) ?? []).length >= 3, "guards raise insufficient_privilege");
assert(
  code.includes(`'DROP POLICY IF EXISTS "Author members can upload practice gallery images" ON storage.objects'`),
  "authenticated gallery upload policy is dropped",
);
assert(!/FOR\s+(INSERT|UPDATE|ALL)/i.test(code), "no authenticated write policy is created");
assert(/FOR DELETE[\s\S]*position\('\.\.' in name\) = 0/.test(code), "gallery delete policy has the .. check");
assert(!/DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE/i.test(code), "migration must not change data or tables");
assert(!/use_shared_cover/.test(code), "use_shared_cover stays author-editable");
assert(existsSync(join(ROOT, "docs/security/cover-columns-server-only.md")), "rollback notes must exist");

console.log(`${LABEL}: static ok`);

// ---------------------------------------------------------------------------
// SQL smoke
// ---------------------------------------------------------------------------
function extractOriginalPracticeCoversBlock(sql) {
  const start = sql.indexOf("-- practice-covers bucket");
  const createAt = sql.indexOf('CREATE POLICY "Author members can delete practice covers"', start);
  const endMarker = "END;\n$$;";
  const end = sql.indexOf(endMarker, createAt);
  assert(start >= 0 && createAt > start && end > createAt, "original practice-covers block not found");
  return sql.slice(start, end + endMarker.length);
}

const storageStub = read("scripts/lib/practice-covers-storage-policy-sql-stub.sql");
const originalBlock = extractOriginalPracticeCoversBlock(
  read("supabase/migrations/20260714191000_author_dashboard_storage_and_rls.sql"),
);
const previousStorageMigration = read(`supabase/migrations/${PREVIOUS_STORAGE_MIGRATION}`);
const columnsStub = read("scripts/lib/cover-columns-server-only-sql-stub.sql");
const helpers = read("supabase/tests/cover_columns_server_only_helpers.sql");
const before = read("supabase/tests/cover_columns_server_only_before.sql");
const behavior = read("supabase/tests/cover_columns_server_only_behavior.sql");

runScratchPostgresSmoke(
  LABEL,
  (runPsql) => {
    runPsql([storageStub, originalBlock, previousStorageMigration, columnsStub, helpers].join("\n"));
    const beforeOut = runPsql(before);
    assert(/cover_columns_server_only_before: ALL PASS/.test(beforeOut), "before-state check failed");
    runPsql(migration);
    runPsql(migration); // idempotent re-apply
    const out = runPsql(behavior);
    assert(/cover_columns_server_only_behavior: ALL PASS/.test(out), "behavior check failed");
  },
  { urlEnv: ["AUDIOLAD_COVER_COLUMNS_SQL_DATABASE_URL"] },
);
