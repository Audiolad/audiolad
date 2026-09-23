#!/usr/bin/env node
/**
 * Contract checks for the invitee list + activation email migration.
 * Real SQL runs only when AUDIOLAD_AUTHOR_PARTNER_INVITEES_ISOLATED=1
 * against AUDIOLAD_AUTHOR_PARTNER_INVITEES_DATABASE_URL (scratch CI Postgres).
 * Never writes to production.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
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
assert(!enqueueSql.includes("EXCEPTION WHEN OTHERS"), "enqueue does not swallow insert failures");
assert(sql.includes("partner_activation_email_recipient_missing"), "missing recipient aborts activation");
assert(sql.includes("not strict SMTP exactly-once"), "docs do not claim SMTP exactly-once");
assert(sql.includes("audiolad-author-sale-email-outbox.timer"), "retries use the installed sale timer");
assert(sql.includes("run:author-sale-email-outbox"), "retries use the release npm script");
assert(!sql.includes("audiolad-author-partner-activation-email-outbox.timer"), "no separate partner timer");
assert(sql.includes("status IN ('pending', 'failed')"), "claim includes failed rows");
assert(sql.includes("next_attempt_at <= now()"), "claim waits until next_attempt_at");
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

const saleWrapper = readFileSync(
  join(repoRoot, "deploy/scripts/run-author-sale-email-outbox.sh"),
  "utf8",
);
const saleRunner = readFileSync(
  join(repoRoot, "scripts/process-author-sale-email-outbox.ts"),
  "utf8",
);
const packageJson = readFileSync(join(repoRoot, "package.json"), "utf8");
assert(saleWrapper.includes("run run:author-sale-email-outbox"), "installed wrapper still calls the release script");
assert(saleWrapper.includes('"claimed".*"sent".*"failed"'), "sale log parser stays");
assert(saleRunner.includes("runInstalledAuthorEmailOutboxCycle"), "release script drains both queues");
assert(
  packageJson.includes(
    '"run:author-sale-email-outbox": "npx tsx scripts/process-author-sale-email-outbox.ts"',
  ),
  "package script name unchanged",
);
assert(
  !existsSync(
    join(repoRoot, "deploy/systemd/audiolad-author-partner-activation-email-outbox.timer"),
  ),
  "separate partner timer is not shipped",
);
assert(saleWrapper.includes("SMTP is not exactly-once"), "wrapper matches at-least-once semantics");

console.log("author-partner-invitees-sql-unit: ok");

function runIsolatedSmoke() {
  if (process.env.AUDIOLAD_AUTHOR_PARTNER_INVITEES_ISOLATED !== "1") {
    console.log("author-partner-invitees isolated sql: skipped (not isolated)");
    return;
  }

  const databaseUrl = process.env.AUDIOLAD_AUTHOR_PARTNER_INVITEES_DATABASE_URL || "";
  if (!databaseUrl) {
    throw new Error("AUDIOLAD_AUTHOR_PARTNER_INVITEES_DATABASE_URL is required for isolated sql");
  }
  if (/audiolad\.ru|72\.56\.232\.160/i.test(databaseUrl)) {
    throw new Error("isolated sql refuses production-looking database urls");
  }

  const files = [
    "scripts/lib/author-partner-program-sql-stub.sql",
    "supabase/migrations/20261024120000_author_partner_program_foundation.sql",
    "supabase/migrations/20261028120000_author_partner_generate_code_extensions_path.sql",
    "supabase/migrations/20261025120000_author_partner_attribution.sql",
    "supabase/migrations/20261027120100_author_partner_activation_bonus.sql",
    "supabase/migrations/20261031120000_author_partner_invitees_and_activation_email.sql",
    "supabase/tests/author_partner_invitees_email_smoke.sql",
  ].map((relative) => join(repoRoot, relative));

  for (const file of files) {
    if (!existsSync(file)) throw new Error(`missing sql file: ${file}`);
    try {
      execFileSync("psql", [databaseUrl, "-v", "ON_ERROR_STOP=1", "-f", file], {
        encoding: "utf8",
        maxBuffer: 30 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const stdout = error && error.stdout ? String(error.stdout) : "";
      const stderr = error && error.stderr ? String(error.stderr) : "";
      throw new Error(`psql failed for ${file}\n${stdout}\n${stderr}`);
    }
  }

  console.log("author-partner-invitees isolated sql: ok");
}

runIsolatedSmoke();
