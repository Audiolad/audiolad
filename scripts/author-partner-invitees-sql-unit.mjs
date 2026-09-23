#!/usr/bin/env node
/**
 * Contract checks for the invitee list + activation email migration.
 * Does not open a database and never writes to production.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = join(
  repoRoot,
  "supabase/migrations/20261031120000_author_partner_invitees_and_activation_email.sql",
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sql = readFileSync(migrationPath, "utf8");
const listStart = sql.indexOf("4. Owner-only list");
assert(listStart > 0, "list section present");
const listSql = sql.slice(listStart);
const enqueueSql = sql.slice(0, listStart);

assert(sql.includes("CREATE TABLE IF NOT EXISTS public.author_partner_activation_email_outbox"), "outbox table");
assert(sql.includes("UNIQUE (referral_id)"), "one row per referral");
assert(sql.includes("ON CONFLICT (referral_id) DO NOTHING"), "enqueue is insert-once");
assert(sql.includes("partner_author_activated:"), "idempotency key prefix");
assert(
  /WHEN \(\s*OLD\.activated_at IS NULL\s*AND NEW\.activated_at IS NOT NULL\s*AND NEW\.status = 'activated'\s*\)/.test(sql),
  "trigger only on first activation",
);
assert(sql.includes("AFTER UPDATE OF activated_at, status"), "update trigger, not insert");
assert(!/INSERT INTO public\.author_referrals/.test(sql), "does not write referrals");
assert(!/author_ledger|partner_commission|sale_accrual/.test(sql), "no monetary ledger");
assert(sql.includes("author_partner_is_owner(p_author_id)"), "owner gate");
assert(sql.includes("r.referrer_author_id = p_author_id"), "own referrals only");
assert(sql.includes("'state', 'pending'"), "pending state");
assert(sql.includes("r.attributed_at"), "pending date is attributed_at");
assert(sql.includes("'activated_at', r.activated_at"), "canonical activated_at");
assert(sql.includes("'expires_at', r.expires_at"), "canonical expires_at");
assert(sql.includes("r.status = 'attributed'"), "pending is attributed");
assert(enqueueSql.includes("EXCEPTION WHEN OTHERS"), "email failure does not abort activation");
assert(!/FROM auth\.users/.test(listSql), "list does not read auth users");
assert(!/\.email/.test(listSql), "list payload has no email column");
assert(!/invitee_user_id/.test(listSql), "list does not return invitee user id");
assert(listSql.includes("a.name"), "activated name is authors.name");
assert(sql.includes("GRANT EXECUTE ON FUNCTION public.list_author_partner_invitees(uuid)"), "list granted");
assert(sql.includes("TO authenticated, service_role"), "list callable by the signed-in owner");
assert(
  sql.includes("REVOKE ALL ON FUNCTION public.claim_author_partner_activation_email_outbox(integer, integer)"),
  "claim is not public",
);

console.log("author-partner-invitees-sql-unit: ok");
