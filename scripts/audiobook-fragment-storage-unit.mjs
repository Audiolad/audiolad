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
const fragmentsRoute = readFileSync(
  "src/app/api/studio/audiobooks/projects/[projectId]/chapters/[chapterId]/fragments/route.ts",
  "utf8",
);
const databaseDocs = readFileSync("docs/DATABASE.md", "utf8");

assert.match(sql, /CREATE TABLE public\.audiobook_fragments/);
assert.match(sql, /reserve_audiobook_fragment[\s\S]*FOR UPDATE[\s\S]*quota_exceeded/);
assert.match(sql, /audiobook_fragments_source_check CHECK \(source_type IN \('upload', 'recording'\)\)/);
assert.match(sql, /audiobook_fragments_status_check CHECK \(status IN \('uploading','active'\)\)/);
assert.match(sql, /finalize_audiobook_fragment/);
assert.match(sql, /delete_audiobook_fragment[\s\S]*row_number\(\) OVER/);
assert.match(sql, /REVOKE ALL ON TABLE public\.audiobook_fragments FROM PUBLIC, anon, authenticated/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.delete_audiobook_fragment[\s\S]*TO service_role/);
assert.match(server, /createSignedUploadUrl/);
assert.match(server, /upload_not_complete/);
assert.match(server, /audiobook_fragment_storage_cleanup_error/);
assert.match(server, /delete_audiobook_fragment/);
assert.match(server, /sourceType: unknown/);
assert.match(server, /input\.sourceType !== "upload" && input\.sourceType !== "recording"/);
assert.match(server, /\.eq\("chapter_id", chapterId\)\s*\.order\("position"/);
assert.match(server, /\.eq\("status", "uploading"\)/);
assert.match(fragmentsRoute, /sourceType: body\?\.sourceType/);
assert.match(ui, /uploadToSignedUrl/);
assert.match(ui, /matchesReservation/);
assert.match(ui, /file\.size === fragment\.size_bytes/);
assert.match(ui, /normalizeAudiobookMimeType\(file\.type\) === fragment\.mime_type/);
assert.match(ui, /sanitizeAudiobookFilename\(file\.name\) === fragment\.original_name/);
assert.match(ui, /fragmentBase\}\/\$\{fragment\.id\}\/retry/);
assert.match(ui, /Выбрать файл и повторить/);
assert.match(ui, /Загрузка не завершена/);
assert.doesNotMatch(ui, /FormData/);
assert.doesNotMatch(ui, /MediaRecorder/);
assert.doesNotMatch(databaseDocs, /short-lived signed upload token|signed upload TTL/i);
assert.match(ui, /Загрузить аудиофрагмент/);

console.log("audiobook-fragment-storage-unit: ok");
