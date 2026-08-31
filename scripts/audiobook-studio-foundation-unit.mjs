import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20260911130000_audiobook_projects_and_chapters.sql", "utf8");
const server = readFileSync("src/lib/audiobooks/server.ts", "utf8");
const ui = readFileSync("src/components/studio/audiobooks/AudiobookProjectWorkspace.tsx", "utf8");

assert.match(sql, /create_audiobook_chapter[\s\S]*FOR UPDATE[\s\S]*coalesce\(max\(position\), 0\) \+ 1/);
assert.match(sql, /delete_audiobook_chapter[\s\S]*DELETE FROM public\.audiobook_chapters[\s\S]*row_number\(\) OVER/);
assert.match(sql, /UNIQUE \(project_id, position\) DEFERRABLE/);
assert.match(sql, /REVOKE ALL ON FUNCTION public\.create_audiobook_chapter/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.delete_audiobook_chapter[\s\S]*TO service_role/);
assert.match(server, /rpc\("create_audiobook_chapter"/);
assert.match(server, /rpc\("delete_audiobook_chapter"/);
assert.doesNotMatch(server, /last\?\.position/);
assert.match(ui, /Удалить аудиокнигу\?/);
assert.match(ui, /будет удалена вместе со всеми главами/);
assert.match(ui, />Удалить</);
assert.match(ui, />Отмена</);
console.log("audiobook-studio-foundation-unit: ok");
