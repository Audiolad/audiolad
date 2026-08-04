#!/usr/bin/env node
/**
 * Isolated SQL rehearsal for the author product moderation email outbox
 * migrations:
 *   - 20260801140000_practice_moderation_email_outbox.sql (author outcomes)
 *   - 20260804120000_practice_moderation_admin_email_outbox.sql (admin alerts)
 *
 * Creates a scratch database on the isolated test-db container and never
 * touches the production `supabase-db` container. Follows the bootstrap
 * pattern from scripts/practice-sale-lock-sql-unit.mjs: build a minimal but
 * faithful schema (auth.users, authors, practices, practice_moderation_
 * events, author_members, profiles, audio_items), apply the migration files,
 * then exercise them directly.
 */
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER =
  process.env.AUDIOLAD_MODERATION_EMAIL_TEST_DB_CONTAINER || "audiolad-test-db";
const TEST_DB = "audiolad_product_moderation_email_test";
const MIGRATION =
  "supabase/migrations/20260801140000_practice_moderation_email_outbox.sql";
const ADMIN_MIGRATION =
  "supabase/migrations/20260804120000_practice_moderation_admin_email_outbox.sql";

const AUTHOR_ID = "22222222-2222-2222-2222-222222222222";
const OWNER_USER_ID = "11111111-1111-1111-1111-111111111111";
const EDITOR_USER_ID = "11111111-1111-1111-1111-111111111112";
const NO_EMAIL_OWNER_USER_ID = "11111111-1111-1111-1111-111111111113";

const AUTHOR_NO_EMAIL_ID = "22222222-2222-2222-2222-222222222223";

const PRACTICE_A = "33333333-3333-3333-3333-333333333331";
const PRACTICE_B = "33333333-3333-3333-3333-333333333332";
const PRACTICE_NO_EMAIL = "33333333-3333-3333-3333-333333333333";
const PRACTICE_STALE_RESUBMIT = "33333333-3333-3333-3333-333333333334";
const PRACTICE_STALE_UNPUBLISH = "33333333-3333-3333-3333-333333333335";
const PRACTICE_STALE_DELETE = "33333333-3333-3333-3333-333333333336";
const PRACTICE_RETRY = "33333333-3333-3333-3333-333333333337";
const PRACTICE_RESTRICT = "33333333-3333-3333-3333-333333333338";
const PRACTICE_NOOP_ACTIONS = "33333333-3333-3333-3333-333333333339";

function assert(condition, message) {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function psql(database, sql, { tuples = false } = {}) {
  const args = [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
  ];
  if (tuples) args.push("-At");
  args.push("-c", sql);
  return execFileSync("docker", args, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function psqlFile(database, absolutePath) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      encoding: "utf8",
      input: readFileSync(absolutePath, "utf8"),
      maxBuffer: 20 * 1024 * 1024,
    },
  );
}

function scalar(sql) {
  return psql(TEST_DB, sql, { tuples: true }).trim();
}

function expectError(sql, expectedFragment, label) {
  let failed = false;
  try {
    psql(TEST_DB, sql, { tuples: true });
  } catch (error) {
    failed = true;
    const text = `${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}`;
    assert(
      text.includes(expectedFragment),
      `${label}: expected "${expectedFragment}", got ${text.slice(0, 500)}`,
    );
  }
  assert(failed, `${label}: expected failure but succeeded`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnPsql(database, sql) {
  const child = spawn("docker", [
    "exec",
    "-i",
    CONTAINER,
    "psql",
    "-U",
    "postgres",
    "-d",
    database,
    "-v",
    "ON_ERROR_STOP=1",
    "-q",
    "-t",
    "-A",
  ]);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  child.stdin.write(sql);
  child.stdin.end();
  const done = new Promise((resolve) => child.on("close", () => resolve()));
  return {
    output: () => stdout,
    errorOutput: () => stderr,
    done,
  };
}

function logPracticeModerationEvent({
  practiceId,
  authorId,
  action,
  fromStatus = null,
  toStatus = null,
  fromModerationStatus = null,
  toModerationStatus = null,
  comment = null,
}) {
  const sqlComment = comment === null ? "NULL" : `'${comment.replace(/'/g, "''")}'`;
  const sqlStr = (value) => (value === null ? "NULL" : `'${value}'`);
  return scalar(
    `SELECT public.log_practice_moderation_event(
      '${practiceId}'::uuid,
      '${authorId}'::uuid,
      '${action}',
      ${sqlStr(fromStatus)},
      ${sqlStr(toStatus)},
      ${sqlStr(fromModerationStatus)},
      ${sqlStr(toModerationStatus)},
      ${sqlComment},
      NULL,
      'admin',
      1,
      '{}'::jsonb
    );`,
  );
}

function bootstrap() {
  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
  psql("postgres", `CREATE DATABASE ${TEST_DB};`);
  psql(
    TEST_DB,
    `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END
$roles$;

CREATE TABLE public.authors (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  can_bypass_product_moderation boolean NOT NULL DEFAULT false
);

CREATE TABLE public.practices (
  id uuid PRIMARY KEY,
  author_id uuid REFERENCES public.authors(id),
  title text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  moderation_status text NOT NULL DEFAULT 'not_submitted',
  product_kind text NOT NULL DEFAULT 'practice',
  is_free boolean NOT NULL DEFAULT true,
  moderation_submitted_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Аудио',
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE public.practice_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES public.practices(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status text,
  to_status text,
  from_moderation_status text,
  to_moderation_status text,
  comment text,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type text NOT NULL,
  attempt integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.author_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.authors(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  role text NOT NULL
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text,
  contact_email text,
  full_name text
);
`,
  );

  psqlFile(TEST_DB, join(ROOT, MIGRATION));
  // Idempotency: re-apply migration.
  psqlFile(TEST_DB, join(ROOT, MIGRATION));
  psqlFile(TEST_DB, join(ROOT, ADMIN_MIGRATION));
  psqlFile(TEST_DB, join(ROOT, ADMIN_MIGRATION));

  psql(
    TEST_DB,
    `
INSERT INTO auth.users (id) VALUES
  ('${OWNER_USER_ID}'), ('${EDITOR_USER_ID}'), ('${NO_EMAIL_OWNER_USER_ID}');

INSERT INTO public.authors (id, name, slug) VALUES
  ('${AUTHOR_ID}', 'Author', 'maria'),
  ('${AUTHOR_NO_EMAIL_ID}', 'No Email Author', 'no-email-author');

INSERT INTO public.profiles (id, email, contact_email, full_name) VALUES
  ('${OWNER_USER_ID}', 'owner-login@example.test', 'owner-contact@Example.test ', 'Мария'),
  ('${EDITOR_USER_ID}', 'editor@example.test', NULL, 'Редактор'),
  ('${NO_EMAIL_OWNER_USER_ID}', '  ', '', 'Без почты');

INSERT INTO public.author_members (author_id, user_id, role) VALUES
  ('${AUTHOR_ID}', '${OWNER_USER_ID}', 'owner'),
  ('${AUTHOR_ID}', '${EDITOR_USER_ID}', 'editor'),
  ('${AUTHOR_NO_EMAIL_ID}', '${NO_EMAIL_OWNER_USER_ID}', 'owner');

INSERT INTO public.practices (
  id, author_id, title, slug, status, moderation_status,
  product_kind, is_free, moderation_submitted_at
) VALUES
  ('${PRACTICE_A}', '${AUTHOR_ID}', 'Practice A', 'practice-a', 'draft', 'submitted', 'practice', true, '2026-08-04T09:00:00Z'),
  ('${PRACTICE_B}', '${AUTHOR_ID}', 'Practice B', 'practice-b', 'draft', 'submitted', 'music', false, '2026-08-04T09:05:00Z'),
  ('${PRACTICE_NO_EMAIL}', '${AUTHOR_NO_EMAIL_ID}', 'No Email Practice', 'no-email-practice', 'draft', 'submitted', 'practice', true, now()),
  ('${PRACTICE_STALE_RESUBMIT}', '${AUTHOR_ID}', 'Stale Resubmit', 'stale-resubmit', 'draft', 'submitted', 'practice', true, now()),
  ('${PRACTICE_STALE_UNPUBLISH}', '${AUTHOR_ID}', 'Stale Unpublish', 'stale-unpublish', 'published', 'approved', 'practice', true, now()),
  ('${PRACTICE_STALE_DELETE}', '${AUTHOR_ID}', 'Stale Delete', 'stale-delete', 'draft', 'submitted', 'practice', true, now()),
  ('${PRACTICE_RETRY}', '${AUTHOR_ID}', 'Retry Practice', 'retry-practice', 'draft', 'submitted', 'practice', true, now()),
  ('${PRACTICE_RESTRICT}', '${AUTHOR_ID}', 'Restrict Practice', 'restrict-practice', 'draft', 'submitted', 'practice', true, now()),
  ('${PRACTICE_NOOP_ACTIONS}', '${AUTHOR_ID}', 'Noop Actions Practice', 'noop-actions-practice', 'draft', 'submitted', 'practice', true, now());

INSERT INTO public.audio_items (practice_id, title, position) VALUES
  ('${PRACTICE_A}', 'Трек 1', 0),
  ('${PRACTICE_B}', 'Трек 1', 0),
  ('${PRACTICE_B}', 'Трек 2', 1);
`,
  );
}

async function runAssertions() {
  // -------------------------------------------------------------------
  // 1. Enqueue scope: author outcomes + admin submit/resubmit alerts.
  // -------------------------------------------------------------------
  const submittedEventId = logPracticeModerationEvent({
    practiceId: PRACTICE_A,
    authorId: AUTHOR_ID,
    action: "submitted",
    fromModerationStatus: "not_submitted",
    toModerationStatus: "submitted",
  });
  assertEqual(
    scalar(`SELECT count(*)::text FROM public.practice_moderation_email_outbox`),
    "1",
    "submitted must enqueue exactly one admin alert",
  );
  assertEqual(
    scalar(
      `SELECT recipient_email FROM public.practice_moderation_email_outbox WHERE event_id = '${submittedEventId}'`,
    ),
    "authors@audiolad.ru",
    "admin submit alert must go to authors@audiolad.ru",
  );
  assertEqual(
    scalar(
      `SELECT recipient_role FROM public.practice_moderation_email_outbox WHERE event_id = '${submittedEventId}'`,
    ),
    "platform_admin",
  );
  assertEqual(
    scalar(
      `SELECT context->>'admin_review_path' FROM public.practice_moderation_email_outbox WHERE event_id = '${submittedEventId}'`,
    ),
    `/admin/product-moderation/${PRACTICE_A}`,
  );
  assertEqual(
    scalar(
      `SELECT context->>'product_kind_label' FROM public.practice_moderation_email_outbox WHERE event_id = '${submittedEventId}'`,
    ),
    "аудиопрактика",
  );

  const changesEventId = logPracticeModerationEvent({
    practiceId: PRACTICE_A,
    authorId: AUTHOR_ID,
    action: "changes_requested",
    fromModerationStatus: "submitted",
    toModerationStatus: "changes_requested",
    comment: "Поправьте обложку и добавьте описание.",
  });

  assertEqual(
    scalar(`SELECT count(*)::text FROM public.practice_moderation_email_outbox`),
    "2",
    "changes_requested must enqueue one additional author row",
  );
  assertEqual(
    scalar(
      `SELECT status FROM public.practice_moderation_email_outbox WHERE event_id = '${changesEventId}'`,
    ),
    "pending",
    "owner with valid email enqueues as pending",
  );
  assertEqual(
    scalar(
      `SELECT recipient_email FROM public.practice_moderation_email_outbox WHERE event_id = '${changesEventId}'`,
    ),
    "owner-contact@example.test",
    "recipient must be the trimmed, lowercased owner contact_email",
  );
  assertEqual(
    scalar(
      `SELECT context->>'author_dashboard_path' FROM public.practice_moderation_email_outbox WHERE event_id = '${changesEventId}'`,
    ),
    `/author-dashboard/products/${PRACTICE_A}?author=maria`,
    "author_dashboard_path must match the workspace-slug contract",
  );
  assertEqual(
    scalar(
      `SELECT context->>'public_product_path' FROM public.practice_moderation_email_outbox WHERE event_id = '${changesEventId}'`,
    ),
    "/practice/maria/practice-a",
    "public_product_path must match the author-slug/product-slug contract",
  );
  assertEqual(
    scalar(
      `SELECT context->>'moderator_comment' FROM public.practice_moderation_email_outbox WHERE event_id = '${changesEventId}'`,
    ),
    "Поправьте обложку и добавьте описание.",
    "full moderator comment must be snapshotted",
  );

  // Editors are never the recipient even though they are also members.
  assertEqual(
    scalar(
      `SELECT count(*)::text FROM public.practice_moderation_email_outbox WHERE recipient_email = 'editor@example.test'`,
    ),
    "0",
    "editor email must never be used as recipient",
  );

  const publishedEventId = logPracticeModerationEvent({
    practiceId: PRACTICE_B,
    authorId: AUTHOR_ID,
    action: "approved_and_published",
    fromStatus: "draft",
    toStatus: "published",
    fromModerationStatus: "submitted",
    toModerationStatus: "approved",
  });
  assertEqual(
    scalar(
      `SELECT action FROM public.practice_moderation_email_outbox WHERE event_id = '${publishedEventId}'`,
    ),
    "approved_and_published",
  );
  assertEqual(
    scalar(
      `SELECT (context->>'moderator_comment' IS NULL)::text FROM public.practice_moderation_email_outbox WHERE event_id = '${publishedEventId}'`,
    ),
    "true",
    "approved_and_published must never carry a moderator comment",
  );

  const resubmittedEventId = logPracticeModerationEvent({
    practiceId: PRACTICE_B,
    authorId: AUTHOR_ID,
    action: "resubmitted",
    fromModerationStatus: "changes_requested",
    toModerationStatus: "submitted",
  });
  assertEqual(
    scalar(
      `SELECT action FROM public.practice_moderation_email_outbox WHERE event_id = '${resubmittedEventId}'`,
    ),
    "resubmitted",
  );
  assertEqual(
    scalar(
      `SELECT context->>'product_kind_label' FROM public.practice_moderation_email_outbox WHERE event_id = '${resubmittedEventId}'`,
    ),
    "альбом",
    "music with 2+ tracks must be labeled as альбом",
  );
  assertEqual(
    scalar(
      `SELECT context->>'price_label' FROM public.practice_moderation_email_outbox WHERE event_id = '${resubmittedEventId}'`,
    ),
    "платный",
  );
  assertEqual(
    scalar(
      `SELECT (context->>'audio_track_count')::text FROM public.practice_moderation_email_outbox WHERE event_id = '${resubmittedEventId}'`,
    ),
    "2",
  );

  for (const action of [
    "submission_withdrawn",
    "unpublished",
    "republished",
    "edit_mode_started",
    "deleted",
  ]) {
    const before = scalar(`SELECT count(*)::text FROM public.practice_moderation_email_outbox`);
    logPracticeModerationEvent({
      practiceId: PRACTICE_NOOP_ACTIONS,
      authorId: AUTHOR_ID,
      action,
    });
    const after = scalar(`SELECT count(*)::text FROM public.practice_moderation_email_outbox`);
    assertEqual(after, before, `${action} must never enqueue an email`);
  }

  // -------------------------------------------------------------------
  // 2. Missing/invalid recipient email → failed_permanent, lifecycle commits.
  // -------------------------------------------------------------------
  const noEmailEventId = logPracticeModerationEvent({
    practiceId: PRACTICE_NO_EMAIL,
    authorId: AUTHOR_NO_EMAIL_ID,
    action: "changes_requested",
    comment: "Комментарий",
  });
  assertEqual(
    scalar(
      `SELECT status FROM public.practice_moderation_email_outbox WHERE event_id = '${noEmailEventId}'`,
    ),
    "failed_permanent",
    "missing owner email must land as failed_permanent",
  );
  assertEqual(
    scalar(
      `SELECT error_code FROM public.practice_moderation_email_outbox WHERE event_id = '${noEmailEventId}'`,
    ),
    "recipient_missing",
    "error_code must be recipient_missing",
  );
  // The lifecycle event row itself must still be committed (RPC never aborts).
  assertEqual(
    scalar(
      `SELECT count(*)::text FROM public.practice_moderation_events WHERE id = '${noEmailEventId}'`,
    ),
    "1",
    "moderation event must commit even when the email cannot be enqueued as sendable",
  );

  // -------------------------------------------------------------------
  // 3. Claim / claim_token / complete lifecycle.
  // -------------------------------------------------------------------
  const claimed = psql(
    TEST_DB,
    `SELECT event_id, status, claim_token, attempt_count
     FROM public.claim_practice_moderation_email_outbox(10, 300)
     WHERE event_id = '${changesEventId}';`,
  );
  assert(claimed.includes("processing"), "claim must move status to processing");

  const claimToken = scalar(
    `SELECT claim_token::text FROM public.practice_moderation_email_outbox WHERE event_id = '${changesEventId}'`,
  );
  assert(claimToken.length > 0, "claim_token must be set after claim");

  // Wrong token must not complete the row.
  assertEqual(
    scalar(
      `SELECT public.complete_practice_moderation_email_outbox(
        '${changesEventId}'::uuid, gen_random_uuid(), 'sent', NULL, NULL
      )::text`,
    ),
    "false",
    "completion with the wrong claim_token must fail",
  );

  assertEqual(
    scalar(
      `SELECT public.complete_practice_moderation_email_outbox(
        '${changesEventId}'::uuid, '${claimToken}'::uuid, 'sent', NULL, NULL
      )::text`,
    ),
    "true",
    "completion with the correct claim_token must succeed",
  );
  assertEqual(
    scalar(
      `SELECT status FROM public.practice_moderation_email_outbox WHERE event_id = '${changesEventId}'`,
    ),
    "sent",
  );

  // Completing an already-sent row again must fail (no longer processing).
  assertEqual(
    scalar(
      `SELECT public.complete_practice_moderation_email_outbox(
        '${changesEventId}'::uuid, '${claimToken}'::uuid, 'sent', NULL, NULL
      )::text`,
    ),
    "false",
    "double-completion must be rejected",
  );

  expectError(
    `SELECT public.complete_practice_moderation_email_outbox(
      '${changesEventId}'::uuid, gen_random_uuid(), 'bogus_outcome', NULL, NULL
    )`,
    "invalid_outcome",
    "invalid outcome value must be rejected",
  );

  // -------------------------------------------------------------------
  // 4. Retry with backoff, then permanent failure after max_attempts.
  // -------------------------------------------------------------------
  const retryEventId = logPracticeModerationEvent({
    practiceId: PRACTICE_RETRY,
    authorId: AUTHOR_ID,
    action: "changes_requested",
    comment: "Комментарий для повторной отправки.",
  });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const token = scalar(
      `SELECT claim_token::text FROM public.claim_practice_moderation_email_outbox(1, 300)
       WHERE event_id = '${retryEventId}'`,
    );
    assert(token.length > 0, `attempt ${attempt}: row must be claimable`);
    scalar(
      `SELECT public.complete_practice_moderation_email_outbox(
        '${retryEventId}'::uuid, '${token}'::uuid, 'failed', 'smtp_timeout', 'boom'
      )::text`,
    );
    const status = scalar(
      `SELECT status FROM public.practice_moderation_email_outbox WHERE event_id = '${retryEventId}'`,
    );
    if (attempt < 5) {
      assertEqual(status, "retryable", `attempt ${attempt} should remain retryable`);
      // Force the row due immediately so the next loop iteration can claim it.
      psql(
        TEST_DB,
        `UPDATE public.practice_moderation_email_outbox
         SET next_attempt_at = now() - interval '1 second'
         WHERE event_id = '${retryEventId}'`,
      );
    } else {
      assertEqual(status, "failed_permanent", "5th failure must be permanent");
    }
  }
  assertEqual(
    scalar(
      `SELECT error_code FROM public.practice_moderation_email_outbox WHERE event_id = '${retryEventId}'`,
    ),
    "smtp_timeout",
  );

  // -------------------------------------------------------------------
  // 5. Stale-delivery cancellation policy.
  // -------------------------------------------------------------------
  const staleResubmitEventId = logPracticeModerationEvent({
    practiceId: PRACTICE_STALE_RESUBMIT,
    authorId: AUTHOR_ID,
    action: "changes_requested",
    comment: "Будет отменено повторной отправкой.",
  });
  assertEqual(
    scalar(`SELECT public.moderation_email_delivery_is_stale('${staleResubmitEventId}'::uuid)::text`),
    "false",
    "fresh changes_requested delivery is not stale",
  );
  logPracticeModerationEvent({
    practiceId: PRACTICE_STALE_RESUBMIT,
    authorId: AUTHOR_ID,
    action: "resubmitted",
    fromModerationStatus: "changes_requested",
    toModerationStatus: "submitted",
  });
  assertEqual(
    scalar(`SELECT public.moderation_email_delivery_is_stale('${staleResubmitEventId}'::uuid)::text`),
    "true",
    "changes_requested delivery becomes stale after a resubmit",
  );
  psql(
    TEST_DB,
    `SELECT public.claim_practice_moderation_email_outbox(10, 300);`,
  );
  assertEqual(
    scalar(
      `SELECT status FROM public.practice_moderation_email_outbox WHERE event_id = '${staleResubmitEventId}'`,
    ),
    "cancelled",
    "claim must cancel the stale changes_requested delivery instead of sending it",
  );

  const staleUnpublishEventId = logPracticeModerationEvent({
    practiceId: PRACTICE_STALE_UNPUBLISH,
    authorId: AUTHOR_ID,
    action: "approved_and_published",
    fromModerationStatus: "submitted",
    toModerationStatus: "approved",
  });
  psql(
    TEST_DB,
    `UPDATE public.practices SET status = 'unpublished' WHERE id = '${PRACTICE_STALE_UNPUBLISH}'`,
  );
  assertEqual(
    scalar(`SELECT public.moderation_email_delivery_is_stale('${staleUnpublishEventId}'::uuid)::text`),
    "true",
    "approved_and_published delivery becomes stale once the product is no longer published",
  );

  const staleDeleteEventId = logPracticeModerationEvent({
    practiceId: PRACTICE_STALE_DELETE,
    authorId: AUTHOR_ID,
    action: "changes_requested",
    comment: "Будет отменено удалением продукта.",
  });
  psql(
    TEST_DB,
    `UPDATE public.practices SET deleted_at = now() WHERE id = '${PRACTICE_STALE_DELETE}'`,
  );
  assertEqual(
    scalar(`SELECT public.moderation_email_delivery_is_stale('${staleDeleteEventId}'::uuid)::text`),
    "true",
    "delivery becomes stale once the practice is soft-deleted",
  );

  // -------------------------------------------------------------------
  // 6. Concurrent claim: FOR UPDATE SKIP LOCKED must not double-claim.
  // -------------------------------------------------------------------
  const concurrentA = logPracticeModerationEvent({
    practiceId: PRACTICE_A,
    authorId: AUTHOR_ID,
    action: "changes_requested",
    comment: "Конкурентная заявка A.",
  });
  const concurrentB = logPracticeModerationEvent({
    practiceId: PRACTICE_B,
    authorId: AUTHOR_ID,
    action: "changes_requested",
    comment: "Конкурентная заявка B.",
  });

  const bg = spawnPsql(
    TEST_DB,
    `BEGIN;\nSELECT event_id FROM public.claim_practice_moderation_email_outbox(1, 300) WHERE event_id IN ('${concurrentA}', '${concurrentB}');\nSELECT pg_sleep(2);\nCOMMIT;\n`,
  );
  await sleep(900);
  const bgLines = bg
    .output()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  assert(bgLines.length > 0, `background session must have claimed a row (stderr: ${bg.errorOutput()})`);
  const bgClaimed = bgLines[0];
  assert(
    bgClaimed === concurrentA || bgClaimed === concurrentB,
    `background claim must be one of the two seeded rows, got ${bgClaimed}`,
  );

  const secondClaimed = scalar(
    `SELECT event_id::text FROM public.claim_practice_moderation_email_outbox(1, 300)
     WHERE event_id IN ('${concurrentA}', '${concurrentB}')`,
  );
  const otherExpected = bgClaimed === concurrentA ? concurrentB : concurrentA;
  assertEqual(
    secondClaimed,
    otherExpected,
    "SKIP LOCKED must hand the second claimer the other pending row, not the locked one",
  );

  await bg.done;

  // -------------------------------------------------------------------
  // 7. RESTRICT: an event with an outbox row cannot be hard-deleted.
  // -------------------------------------------------------------------
  const restrictEventId = logPracticeModerationEvent({
    practiceId: PRACTICE_RESTRICT,
    authorId: AUTHOR_ID,
    action: "changes_requested",
    comment: "Проверка RESTRICT.",
  });
  expectError(
    `DELETE FROM public.practice_moderation_events WHERE id = '${restrictEventId}'`,
    "foreign key constraint",
    "deleting a moderation event with an outbox row must be blocked by RESTRICT",
  );

  // -------------------------------------------------------------------
  // 8. Defensive CHECK constraints on the outbox table itself. Uses an
  // event id from a no-op action (never auto-enqueued) to avoid colliding
  // with the primary key of an already-enqueued row.
  // -------------------------------------------------------------------
  const noopEventId = logPracticeModerationEvent({
    practiceId: PRACTICE_NOOP_ACTIONS,
    authorId: AUTHOR_ID,
    action: "submission_withdrawn",
  });
  expectError(
    `INSERT INTO public.practice_moderation_email_outbox
       (event_id, practice_id, author_id, action, recipient_role)
     VALUES
       ('${noopEventId}'::uuid, '${PRACTICE_NOOP_ACTIONS}'::uuid, '${AUTHOR_ID}'::uuid, 'draft', 'author_owner')`,
    "practice_moderation_email_outbox_action_check",
    "action CHECK must reject actions outside the author+admin scope",
  );
}

function cleanup() {
  psql("postgres", `DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE);`);
}

async function main() {
  assert(
    CONTAINER !== "supabase-db",
    "moderation email SQL tests must never run against the production supabase-db container",
  );
  bootstrap();
  try {
    await runAssertions();
    console.log("author-product-moderation-email-sql-unit: ok");
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
