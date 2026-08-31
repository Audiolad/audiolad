import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  "supabase/migrations/20260911140000_audiobook_chapter_fragments.sql",
  "utf8",
);
const server = readFileSync("src/lib/audiobooks/server.ts", "utf8");
const ui = readFileSync(
  "src/components/studio/audiobooks/AudiobookProjectWorkspace.tsx",
  "utf8",
);

assert.match(sql, /CREATE TABLE public\.audiobook_fragments/);
assert.match(sql, /reserve_audiobook_fragment[\s\S]*FOR UPDATE[\s\S]*quota_exceeded/);
assert.match(sql, /finalize_audiobook_fragment/);
assert.match(sql, /delete_audiobook_fragment[\s\S]*row_number\(\) OVER/);
assert.match(sql, /REVOKE ALL ON TABLE public\.audiobook_fragments FROM PUBLIC, anon, authenticated/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.delete_audiobook_fragment[\s\S]*TO service_role/);
assert.match(server, /createSignedUploadUrl/);
assert.match(server, /upload_not_complete/);
assert.match(server, /audiobook_fragment_storage_cleanup_error/);
assert.match(server, /delete_audiobook_fragment/);
assert.match(ui, /uploadToSignedUrl/);
assert.doesNotMatch(ui, /FormData/);
assert.match(ui, /Загрузить аудиофрагмент/);

console.log("audiobook-fragment-storage-unit: ok");
