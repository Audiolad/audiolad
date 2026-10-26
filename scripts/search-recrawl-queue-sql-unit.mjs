#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const name = "20270125120000_search_recrawl_queue.sql";
const sql = readFileSync(join(root, "supabase/migrations", name), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(sql.startsWith("--"), "migration starts with a comment");
assert(sql.includes("CREATE TABLE IF NOT EXISTS public.search_recrawl_queue"), "creates the queue");
assert(sql.includes("ENABLE ROW LEVEL SECURITY"), "enables RLS");
assert(sql.includes("REVOKE ALL ON TABLE public.search_recrawl_queue FROM anon"), "revokes anon");
assert(
  sql.includes("REVOKE ALL ON TABLE public.search_recrawl_queue FROM authenticated"),
  "revokes authenticated",
);
assert(sql.includes("GRANT EXECUTE ON FUNCTION public.enqueue_search_recrawl"), "service enqueue");
assert(sql.includes("TO service_role"), "service_role execute");
assert(!sql.includes("TO anon"), "no anon execute");
assert(!sql.includes("TO authenticated"), "no authenticated execute");
assert(
  sql.includes("search_recrawl_queue_pending_url_engine_uidx"),
  "unique pending url per engine",
);
assert(sql.includes("WHERE status IN ('pending', 'leased')"), "pending uniqueness is partial");
assert(sql.includes("url ~ '^https://audiolad\\.ru(/|$)'"), "origin check");
assert(sql.includes("'yandex'"), "yandex engine");
assert(sql.includes("'indexnow'"), "indexnow engine");
assert(sql.includes("attempts"), "attempts column");
assert(sql.includes("last_error"), "last_error column");
assert(sql.includes("last_http_status"), "last_http_status column");
assert(sql.includes("next_attempt_at"), "next_attempt_at column");
assert(sql.includes("created_at"), "created_at column");
assert(sql.includes("updated_at"), "updated_at column");
assert(sql.includes("entity_id"), "entity id column");
const insertAt = sql.indexOf("INSERT INTO public.search_recrawl_queue");
const insertStatement = sql.slice(insertAt, sql.indexOf("RETURNING", insertAt));
assert(insertAt > 0 && insertStatement.includes("VALUES ("), "enqueue insert uses values");
assert(!/\bSELECT\b/.test(insertStatement), "no select backfill");
assert(!sql.includes("sergey-zoya"), "no other site");
assert(!sql.includes("DROP TABLE public.practices"), "does not drop practices");
assert(!sql.includes("ALTER TABLE public.practices"), "does not alter practices");
assert(!sql.includes("YANDEX_WEBMASTER_OAUTH_TOKEN"), "no secret");
assert(sql.includes("CREATE FUNCTION public.reject_search_recrawl"), "reject function");
assert(sql.includes("CREATE FUNCTION public.search_recrawl_yandex_health"), "health function");
assert(/No historical backfill/i.test(sql), "comment says there is no backfill");

console.log("search-recrawl-queue-sql-unit: ok");
