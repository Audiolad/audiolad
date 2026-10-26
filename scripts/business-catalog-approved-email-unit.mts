import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createMemoryApplicationEmailRuntime, type NewApplicationOutbox } from "../src/lib/email/application-email-runtime";
import { processApplicationEmailOutbox, type OutboundApplicationEmail } from "../src/lib/email/process-application-email-outbox";
import { brandEmailTemplateRenderer } from "../src/lib/email/templates/renderer";

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20270124120000_business_catalog_approved_email.sql");
const foundation = read("supabase/migrations/20260717150000_email_foundation.sql");
const mailings = read("supabase/migrations/20261219120000_admin_author_mailings.sql");
const moderation = read("supabase/migrations/20270107120000_business_owner_self_moderation.sql");
const outboxDdl = foundation.match(/CREATE TABLE IF NOT EXISTS public.email_outbox \([\s\S]*?\n\);/)![0];
const dedupDdl = mailings.match(/CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_deduplication_key_uidx[\s\S]*?;/)![0];
const rpc = moderation.match(/CREATE OR REPLACE FUNCTION public.moderator_business_verification_action\([\s\S]*?\$\$;/)![0];
const user = "11111111-1111-4111-a111-111111111111";
const approved = "22222222-2222-4222-a222-222222222222";
const rejected = "33333333-3333-4333-a333-333333333333";
const rolledBack = "44444444-4444-4444-a444-444444444444";
const rightsholder = "55555555-5555-4555-a555-555555555555";
const setup = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::uuid $$;
CREATE FUNCTION public.business_onboarding_is_moderator() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.business_moderation_owner_self_allowed() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE TABLE public.email_contacts(id uuid PRIMARY KEY);
CREATE TABLE public.business_rightsholder_verifications(id uuid PRIMARY KEY, owner_user_id uuid, status text, reason text, updated_at timestamptz);
CREATE TABLE public.business_rightsholder_accounts(owner_user_id uuid PRIMARY KEY, rightsholder_id uuid);
CREATE TABLE public.music_rightsholders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text, display_name text, entity_type text);
CREATE TABLE public.business_rightsholder_verification_attempts(id uuid, verification_id uuid, attempt_no integer);
CREATE TABLE public.business_rightsholder_moderation_audit(verification_id uuid, attempt_id uuid, actor_user_id uuid, action text, reason text, previous_status text, next_status text, rightsholder_id uuid);
${outboxDdl}
${dedupDdl}
${rpc}
INSERT INTO auth.users VALUES ('${user}', 'Applicant@Example.test');
INSERT INTO public.business_rightsholder_accounts VALUES ('${user}', NULL);
INSERT INTO public.music_rightsholders(id,status) VALUES ('${rightsholder}', 'active');
INSERT INTO public.business_rightsholder_verifications(id,owner_user_id,status) VALUES
('${approved}','${user}','submitted'),('${rejected}','${user}','submitted'),('${rolledBack}','${user}','submitted');
`;
const decision = (id: string, action: string) => `SELECT public.moderator_business_verification_action('${id}','${action}','Тест','${rightsholder}');`;
const checks = `
-- Reading evidence/case does not enqueue anything.
SELECT * FROM public.business_rightsholder_verifications;
DO $$ BEGIN IF EXISTS(SELECT FROM public.email_outbox) THEN RAISE EXCEPTION 'read sent mail'; END IF; END $$;
${decision(approved, "approve")}
SELECT public.moderator_business_verification_action('${rejected}','reject','Тест');
-- Same status save and duplicate click cannot enqueue a second message.
UPDATE public.business_rightsholder_verifications SET status='verified' WHERE id='${approved}';
DO $$ BEGIN
  BEGIN
    PERFORM public.moderator_business_verification_action('${approved}','approve','Тест','${rightsholder}');
    RAISE EXCEPTION 'duplicate approval accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'business_verification_transition_forbidden' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.email_outbox) <> 1 THEN RAISE EXCEPTION 'wrong outbox count'; END IF;
  IF (SELECT to_email FROM public.email_outbox) <> 'applicant@example.test' THEN RAISE EXCEPTION 'wrong account email'; END IF;
END $$;
BEGIN;
${decision(rolledBack, "approve")}
ROLLBACK;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.email_outbox) <> 1 THEN RAISE EXCEPTION 'rollback leaked mail'; END IF;
  IF (SELECT status FROM public.business_rightsholder_verifications WHERE id='${rolledBack}') <> 'submitted' THEN RAISE EXCEPTION 'rollback failed'; END IF;
END $$;
-- Permanent deduplication still holds after success, even on another status transition.
UPDATE public.email_outbox SET status='sent';
UPDATE public.business_rightsholder_verifications SET status='submitted' WHERE id='${approved}';
${decision(approved, "approve")}
DO $$ BEGIN IF (SELECT count(*) FROM public.email_outbox) <> 1 THEN RAISE EXCEPTION 'sent dedup failed'; END IF; END $$;
SELECT 'D60213C5_ROW:' || row_to_json(q)::text FROM public.email_outbox q;
SELECT 'D60213C5_SQL_OK';
`;

// Disposable single-user PostgreSQL only: no network, socket, production URL or Docker.
const scratch = mkdtempSync(path.join(tmpdir(), "audiolad-business-email-"));
const pgBin = process.env.AUDIOLAD_TEST_PG_BIN ?? "/usr/lib/postgresql/17/bin";
const exec = promisify(execFile);
await exec(path.join(pgBin, "initdb"), ["-D", scratch, "-A", "trust", "--no-locale", "--encoding=UTF8"]);
const compactSql = [setup, migration, checks].map((block) => block.split("\n").filter((line) => !line.trimStart().startsWith("--")).join(" ")).join(" ");
// A single-user backend consumes one command per line; preserve dollar-quoted bodies.
const sql = compactSql.replace(/\$\$[\s\S]*?\$\$|'(?:''|[^'])*'|;/g, (token) => token === ";" ? ";\n" : token) + "\n";
const sqlRun = exec(path.join(pgBin, "postgres"), ["--single", "-D", scratch, "postgres"]);
sqlRun.child.stdin!.end(sql);
const { stdout: output, stderr } = await sqlRun;
assert.doesNotMatch(stderr, /ERROR:|FATAL:/);
assert.match(output, /D60213C5_SQL_OK/);
const serialized = output.match(/D60213C5_ROW:(\{.*\})/)?.[1];
assert.ok(serialized, "actual SQL queue row exported");
const dbRow = JSON.parse(serialized);
const key = dbRow.deduplication_key as string;
const now = new Date("2027-01-24T12:00:00Z");
const input: NewApplicationOutbox = {
  messageType: dbRow.message_type, userId: dbRow.user_id, contactId: null,
  toEmail: dbRow.to_email, templateKey: dbRow.template_key, templateVersion: dbRow.template_version,
  payload: dbRow.payload, deduplicationKey: key, status: "pending", priority: 100,
  attemptCount: 0, maxAttempts: 5, scheduledAt: now.toISOString(), lockedAt: null, sentAt: null,
  failedAt: null, providerMessageId: null, lastErrorCode: null, lastErrorMessage: null,
  leaseToken: null, leaseExpiresAt: null, campaignId: null, campaignRecipientId: null,
};
const expectedSubject = "Ваш каталог музыки допущен в АудиоЛад Бизнес";
const expectedText = "Поздравляем! Ваши права на музыкальный каталог подтверждены. Ваш каталог музыки допущен к участию в программе АудиоЛад Бизнес. Спасибо, что вы с нами! Команда АудиоЛада";
const runtime = createMemoryApplicationEmailRuntime();
await runtime.insertOutbox(input);
const messages: OutboundApplicationEmail[] = [];
const deliver = async (message: OutboundApplicationEmail) => {
  messages.push(message);
  assert.equal(message.to, "applicant@example.test");
  assert.equal(message.subject, expectedSubject);
  assert.equal(message.text, expectedText);
  assert.ok(message.html.includes(expectedText));
  assert.ok(message.html.includes("audiolad-logo-horizontal.png"));
  return { ok: true as const, providerMessageId: "test-sent" };
};
// Concurrent workers and repeated saves must not duplicate delivery.
await Promise.all([processApplicationEmailOutbox({ runtime, now, deliver }), processApplicationEmailOutbox({ runtime, now, deliver })]);
assert.equal((await runtime.insertOutbox(input)).created, false);
await processApplicationEmailOutbox({ runtime, now, deliver });
assert.equal(messages.length, 1);
assert.equal((await runtime.findOutboxByDedup(key))?.status, "sent");

for (const throws of [false, true]) {
  const retryRuntime = createMemoryApplicationEmailRuntime();
  await retryRuntime.insertOutbox(input);
  const failed = await processApplicationEmailOutbox({ runtime: retryRuntime, now, deliver: async () => {
    if (throws) throw new Error("private transport detail");
    return { ok: false, code: "smtp_unavailable", message: "temporary failure", retryable: true };
  } });
  assert.equal(failed.failed, 1);
  const row = await retryRuntime.findOutboxByDedup(key);
  assert.equal(row?.status, "pending");
  assert.equal(row?.lastErrorCode, throws ? "provider_error" : "smtp_unavailable");
  assert.equal(row?.attemptCount, 1);
  assert.ok(!row?.lastErrorMessage?.includes("private transport detail"));
  const deliveredBefore: number = messages.length;
  await processApplicationEmailOutbox({ runtime: retryRuntime, now, deliver });
  assert.equal(messages.length, deliveredBefore, "backoff respected");
  const later = new Date(now.getTime() + 61_000);
  await processApplicationEmailOutbox({ runtime: retryRuntime, now: later, deliver });
  await processApplicationEmailOutbox({ runtime: retryRuntime, now: later, deliver });
  assert.equal(messages.length, deliveredBefore + 1);
  assert.equal((await retryRuntime.findOutboxByDedup(key))?.status, "sent");
}
const invalidVersion = await brandEmailTemplateRenderer.render({ templateKey: dbRow.template_key, templateVersion: "unknown", payload: {} });
assert.equal(invalidVersion.ok, false);
console.log("Business approval email: PostgreSQL approval/rejection/rollback/dedup + exact branded email, concurrent workers, SMTP failure/exception and retry – OK");
