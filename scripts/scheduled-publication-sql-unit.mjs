#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationName = "20261210120000_practice_scheduled_publication.sql";
const claimName = "20261211120000_claim_due_scheduled_practice_publications.sql";
const outboxName = "20261212120000_scheduled_publish_notification_outbox.sql";
const sql = readFileSync(
  join(repoRoot, "supabase/migrations", migrationName),
  "utf8",
);
const claimSql = readFileSync(
  join(repoRoot, "supabase/migrations", claimName),
  "utf8",
);
const outboxSql = readFileSync(
  join(repoRoot, "supabase/migrations", outboxName),
  "utf8",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const names = readdirSync(join(repoRoot, "supabase/migrations")).filter((name) =>
  name.endsWith(".sql"),
);
const versions = names
  .map((name) => name.match(/^(\d{14})_/)?.[1])
  .filter(Boolean);
assert(new Set(versions).size === versions.length, "no duplicate migration timestamps");
assert(versions.includes("20261210120000"), "scheduled publication version listed");
assert(versions.includes("20261211120000"), "due publication claim version listed");
assert(versions.includes("20261212120000"), "publish notification outbox version listed");
assert(sql.includes("ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz"), "column");
assert(sql.includes("practice_is_publicly_available"), "visibility function");
assert(sql.includes("scheduled_publish_after_release"), "hide-after-release guard");
assert(sql.includes("NEW.published_at := CASE"), "published_at stays the real go-live");
assert(!sql.includes("approve_and_publish_practice"), "moderation RPC is unchanged");
assert(!/CREATE TYPE|ADD VALUE/i.test(sql), "no new moderation enum");
assert(
  sql.includes('POLICY "Public can read published practices"'),
  "public read policy",
);
assert(
  sql.includes('POLICY "Selected users can read allowlisted practices"'),
  "selected users policy",
);
assert(sql.includes("can_current_viewer_read_practice"), "viewer read gate");
assert(sql.includes("viewer_can_commercially_access_practice"), "commercial gate");
assert(sql.includes("is_public_listed_practice"), "listed SEO gate");
assert(
  !sql.includes("Author members can read author practices"),
  "author read policy stays as it is",
);
assert(sql.includes("p_status = 'published'"), "moderation status still required");
assert(
  sql.includes("p_scheduled_publish_at IS NULL") &&
    sql.includes("p_scheduled_publish_at <= p_at") &&
    sql.includes("p_published_at <= p_at"),
  "computed availability predicate",
);
assert(sql.includes("ELSE now()"), "approval of a past schedule stamps now()");
assert(
  claimSql.includes("SET published_at = p.scheduled_publish_at"),
  "elapsed schedule stamps the scheduled instant",
);
assert(
  claimSql.includes("p.published_at IS NULL"),
  "already stamped rows, including approval-after-schedule, are not claimed again",
);
assert(
  claimSql.includes("p.scheduled_publish_at <= now()"),
  "claim waits until the schedule is due",
);
assert(
  claimSql.includes("p.status = 'published'"),
  "claim does not publish an unapproved product",
);
assert(
  !claimSql.includes("SET published_at = now()"),
  "claim does not replace the schedule with the read time",
);
assert(
  outboxSql.includes("REVOKE ALL ON FUNCTION public.claim_due_scheduled_practice_publications() FROM anon"),
  "anon cannot execute the claim",
);
assert(
  outboxSql.includes("REVOKE ALL ON FUNCTION public.claim_due_scheduled_practice_publications() FROM authenticated"),
  "authenticated cannot execute the claim",
);
assert(
  outboxSql.includes("GRANT EXECUTE ON FUNCTION public.claim_due_scheduled_practice_publications() TO service_role"),
  "service role can execute the claim",
);
assert(
  !outboxSql.includes("GRANT EXECUTE ON FUNCTION public.claim_due_scheduled_practice_publications() TO anon"),
  "claim is not granted to anon",
);
assert(
  outboxSql.includes("RETURNS integer"),
  "claim returns a count and not product rows",
);
assert(
  outboxSql.includes("INSERT INTO public.scheduled_publish_notification_outbox"),
  "pending notification is inserted with the stamp",
);
assert(
  outboxSql.includes("ON CONFLICT (practice_id) DO NOTHING"),
  "a practice cannot get a second publish event",
);
assert(
  outboxSql.includes("REVOKE ALL ON TABLE public.scheduled_publish_notification_outbox FROM anon"),
  "anon cannot read the outbox",
);
assert(
  outboxSql.includes("REVOKE ALL ON FUNCTION public.take_pending_scheduled_publish_notifications() FROM anon"),
  "anon cannot drain notifications",
);
assert(
  outboxSql.includes("FOR UPDATE SKIP LOCKED"),
  "parallel drains lease distinct rows",
);

const claimFree = readFileSync(
  join(
    repoRoot,
    "supabase/migrations",
    "20260901120100_practice_catalog_visibility_modes.sql",
  ),
  "utf8",
);
assert(
  claimFree.includes("claim_free_practice") &&
    claimFree.includes("viewer_can_commercially_access_practice"),
  "free obtain goes through the commercial gate",
);
assert(
  sql.includes("viewer_can_commercially_access_practice") &&
    sql.includes("practice_is_publicly_available"),
  "commercial obtain requires public availability",
);

console.log("scheduled-publication-sql-unit: ok");
