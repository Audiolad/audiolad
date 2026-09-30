import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase/migrations");
const migrationName = "20261213120000_public_content_revision.sql";
const sql = readFileSync(join(migrationsDir, migrationName), "utf8");
const names = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql"));
const versions = names.map((name) => name.slice(0, 14));

assert.equal(new Set(versions).size, versions.length, "migration versions stay unique");
assert.ok(versions.includes("20261213120000"));
assert.equal(
  names.filter((name) => name.startsWith("20261213120000_")).length,
  1,
);
assert.equal(
  names.includes("20261213120000_practices_realtime_publication.sql"),
  false,
  "practices publication migration is removed",
);

const tableStart = sql.indexOf("CREATE TABLE IF NOT EXISTS public.public_content_revision");
const tableEnd = sql.indexOf(");", tableStart);
const tableBody = sql.slice(tableStart, tableEnd);
assert.match(tableBody, /scope text PRIMARY KEY/);
assert.match(tableBody, /revision bigint NOT NULL/);
assert.match(tableBody, /updated_at timestamptz NOT NULL/);
assert.doesNotMatch(tableBody, /publication_id|slug|title|cover|price|catalog_visibility/i);

assert.match(sql, /REPLICA IDENTITY DEFAULT/);
assert.doesNotMatch(sql, /REPLICA IDENTITY FULL/);
assert.doesNotMatch(sql, /ALTER TABLE public\.practices REPLICA IDENTITY/);
assert.doesNotMatch(sql, /ADD TABLE public\.practices/);
assert.match(sql, /ADD TABLE public\.public_content_revision/);
assert.match(sql, /tablename = 'public_content_revision'/);

assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.doesNotMatch(sql, /DISABLE ROW LEVEL SECURITY/i);
assert.match(sql, /GRANT SELECT ON TABLE public\.public_content_revision TO anon, authenticated/);
assert.match(sql, /REVOKE ALL ON TABLE public\.public_content_revision FROM PUBLIC, anon, authenticated/);
assert.match(sql, /FOR SELECT/);
assert.doesNotMatch(sql, /FOR INSERT|FOR UPDATE|FOR DELETE|FOR ALL/i);

assert.match(sql, /practice_affects_public_surface/);
assert.match(sql, /practice_is_publicly_available/);
assert.match(sql, /p_catalog_visibility IN \('listed', 'unlisted'\)/);
assert.match(sql, /v_old_public OR v_new_public/);
assert.match(sql, /OLD\.status/);
assert.match(sql, /NEW\.status/);
assert.match(sql, /touch_public_content_revision\('practices'\)/);
assert.match(sql, /SET revision = revision \+ 1/);
assert.doesNotMatch(
  sql.slice(sql.indexOf("FUNCTION public.touch_public_content_revision"), sql.indexOf("COMMENT ON FUNCTION public.touch_public_content_revision")),
  /publication_id|slug|title/,
);

assert.match(sql, /AFTER INSERT OR UPDATE OR DELETE ON public\.practices/);
assert.match(sql, /AFTER INSERT OR UPDATE OR DELETE ON public\.practice_topics/);
assert.match(sql, /AFTER INSERT OR UPDATE OR DELETE ON public\.practice_price_promotions/);
assert.match(sql, /AFTER INSERT OR UPDATE OR DELETE ON public\.publication_gallery_slides/);
assert.match(sql, /AFTER INSERT OR UPDATE OR DELETE ON public\.audio_items/);
assert.match(sql, /AFTER INSERT OR UPDATE ON public\.authors/);
assert.match(sql, /BEFORE DELETE ON public\.authors/);
assert.match(sql, /AFTER INSERT OR UPDATE ON public\.topics/);
assert.match(sql, /BEFORE DELETE ON public\.topics/);
assert.match(sql, /to_jsonb\(OLD\)/);
assert.match(sql, /'practice_id'/);
assert.match(sql, /'publication_id'/);
assert.match(sql, /WHEN TG_OP = 'DELETE' THEN OLD\.id/);
assert.match(sql, /bump_public_content_revision_for_practice/);
assert.doesNotMatch(sql, /practice_price_promotion_starts/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.touch_public_content_revision\(text\) FROM PUBLIC, anon, authenticated/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.bump_public_content_revision_for_practice\(uuid\) FROM PUBLIC, anon, authenticated/);
assert.match(sql, /INSERT INTO public\.public_content_revision \(scope, revision\)/);
assert.doesNotMatch(sql, /selected_users/);

console.log("public-content-revision-sql-unit: ok");
