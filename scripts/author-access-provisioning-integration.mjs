#!/usr/bin/env node
/**
 * DB integration: author application approval + access_status guards.
 * Requires allowlisted staging/local DB — never runs against production.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TEST_DATABASE_ENV,
  assertFixtureWritesAllowed,
  isTestDatabaseFlagSet,
} from "./lib/fixture-context.mjs";
import { FIXTURE_TEST_EMAIL_DOMAIN } from "./lib/fixture-marker.mjs";
import { FixtureRegistry } from "./lib/fixture-registry.mjs";

const SCRIPT_NAME = "scripts/author-access-provisioning-integration.mjs";
const DOCKER_CONTAINER =
  process.env.AUDIOLAD_TEST_DOCKER_CONTAINER ?? "audiolad-test-db";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (!isTestDatabaseFlagSet()) {
  console.log(`${SCRIPT_NAME}: skipped (${TEST_DATABASE_ENV} is not set)`);
  process.exit(0);
}

assertFixtureWritesAllowed({
  scriptName: SCRIPT_NAME,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
  dockerExec: true,
  dockerContainer: DOCKER_CONTAINER,
});

function sqlFile(content) {
  return execSync(
    `docker exec -i ${DOCKER_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1`,
    { input: content, encoding: "utf8" },
  );
}

function sqlScalar(query) {
  const oneLine = query.replace(/\s+/g, " ").trim();
  return execSync(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d postgres -tAc ${JSON.stringify(oneLine)}`,
    { encoding: "utf8" },
  ).trim();
}

function bootstrapTestDatabaseRoles() {
  sqlFile(`
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto SCHEMA extensions;
SET search_path TO public, extensions, auth;
DO $$ BEGIN CREATE ROLE authenticated NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOINHERIT BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
`);
}

function applyPendingMigrations() {
  bootstrapTestDatabaseRoles();

  for (const file of [
    "20260722100000_author_access_foundation.sql",
    "20260722101000_author_provisioning_rpcs.sql",
    "20260722102000_author_access_guards.sql",
    "20260722103000_operational_email_deliveries.sql",
    "20260722104000_author_application_staff_guard_fix.sql",
  ]) {
    const sql = readFileSync(path.join(ROOT, "supabase/migrations", file), "utf8");
    try {
      sqlFile(sql);
    } catch (error) {
      const message = String(error?.stderr ?? error?.message ?? error);
      if (
        message.includes("already exists") ||
        message.includes("duplicate")
      ) {
        continue;
      }
      throw error;
    }
  }
}

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

function setLocalAuthUser(userId) {
  sqlFile(`SELECT set_config('request.jwt.claim.sub', '${userId}', false);`);
  sqlFile(`SELECT set_config('request.jwt.claim.role', 'authenticated', false);`);
}

function sqlScalarAsUser(userId, query) {
  const oneLine = query.replace(/\s+/g, " ").trim();
  return execSync(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d postgres -tAc ${JSON.stringify(
      `SELECT set_config('request.jwt.claim.sub', '${userId}', true); SELECT set_config('request.jwt.claim.role', 'authenticated', true); ${oneLine}`,
    )}`,
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .pop()
    ?.trim();
}

function expectSqlFailure(fn, label) {
  try {
    fn();
    throw new Error(`${label}: expected failure`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("expected failure")) {
      throw error;
    }
    return true;
  }
}

async function main() {
  applyPendingMigrations();

  const registry = new FixtureRegistry({ sqlFile, sqlScalar });

  await registry.runWithCleanup(async () => {
    const suffix = registry.runId;
    const applicantId = randomUUID();
    const staffId = randomUUID();
    const ownerStaffId = randomUUID();
    const existingAuthorId = randomUUID();
    const applicationId = randomUUID();
    const password = "AuthorAccessTest2026!";

    registry.register("auth_user", applicantId);
    registry.register("auth_user", staffId);
    registry.register("auth_user", ownerStaffId);
    registry.register("author", existingAuthorId);
    registry.register("author_application", applicationId);

    sqlFile(`
BEGIN;
SET search_path TO public, extensions, auth;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
VALUES
  (
    '${applicantId}',
    'authenticated',
    'authenticated',
    'author-applicant-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}',
    crypt('${password}', gen_salt('bf')),
    now()
  ),
  (
    '${staffId}',
    'authenticated',
    'authenticated',
    'author-staff-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}',
    crypt('${password}', gen_salt('bf')),
    now()
  ),
  (
    '${ownerStaffId}',
    'authenticated',
    'authenticated',
    'author-owner-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}',
    crypt('${password}', gen_salt('bf')),
    now()
  );

INSERT INTO public.profiles (id, email, role)
VALUES
  ('${applicantId}', 'author-applicant-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}', 'listener'),
  ('${staffId}', 'author-staff-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}', 'platform_admin'),
  ('${ownerStaffId}', 'author-owner-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}', 'platform_owner')
ON CONFLICT (id) DO UPDATE
SET role = EXCLUDED.role;

INSERT INTO public.authors (id, name, slug, access_status)
VALUES ('${existingAuthorId}', 'Existing Author ${suffix}', 'existing-author-${suffix}', 'commercial');

INSERT INTO public.author_members (author_id, user_id, role)
VALUES ('${existingAuthorId}', '${applicantId}', 'owner');

INSERT INTO public.author_applications (
  id,
  user_id,
  status,
  display_name,
  direction,
  about,
  planned_content,
  consent_personal_data,
  submitted_at,
  contact_email
) VALUES (
  '${applicationId}',
  '${applicantId}',
  'submitted',
  'Новый Автор ${suffix}',
  'Медитации',
  'Описание автора достаточной длины для интеграционного теста.',
  'Планирую публиковать бесплатные медитации для слушателей платформы.',
  true,
  now(),
  'author-applicant-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}'
);

COMMIT;
`);

    assertOk(
      sqlScalarAsUser(
        staffId,
        `SELECT public.take_author_application_in_review('${applicationId}'::uuid)::text`,
      ).includes('"ok": true'),
      "take in review ok",
    );
    assert.equal(
      sqlScalar(
        `SELECT status FROM public.author_applications WHERE id = '${applicationId}'::uuid`,
      ),
      "in_review",
    );

    assertOk(
      sqlScalarAsUser(
        staffId,
        `SELECT public.request_author_application_changes('${applicationId}'::uuid, 'Пожалуйста, дополните описание.', NULL)::text`,
      ).includes('"ok": true'),
      "needs_changes ok",
    );
    assert.equal(
      sqlScalar(
        `SELECT status FROM public.author_applications WHERE id = '${applicationId}'::uuid`,
      ),
      "needs_changes",
    );

    assertOk(
      sqlScalarAsUser(
        staffId,
        `SELECT public.return_author_application_to_review('${applicationId}'::uuid, NULL)::text`,
      ).includes('"ok": true'),
      "return to review ok",
    );
    assert.equal(
      sqlScalar(
        `SELECT status FROM public.author_applications WHERE id = '${applicationId}'::uuid`,
      ),
      "in_review",
    );

    const approveResult = sqlScalarAsUser(
      staffId,
      `SELECT public.approve_author_application('${applicationId}'::uuid)::text`,
    );
    assertOk(approveResult.includes('"idempotent": false'), "first approve not idempotent");

    const newAuthorId = sqlScalar(
      `SELECT author_id::text FROM public.author_applications WHERE id = '${applicationId}'::uuid`,
    );
    assertOk(newAuthorId, "application linked to author");

    assert.equal(
      sqlScalar(
        `SELECT access_status FROM public.authors WHERE id = '${newAuthorId}'::uuid`,
      ),
      "free",
    );

    assert.equal(
      Number(
        sqlScalar(
          `SELECT COUNT(*) FROM public.author_members WHERE author_id = '${newAuthorId}'::uuid AND user_id = '${applicantId}'::uuid`,
        ),
      ),
      1,
    );

    assertOk(
      sqlScalar(
        `SELECT approved_at IS NOT NULL AND approved_by IS NOT NULL FROM public.author_applications WHERE id = '${applicationId}'::uuid`,
      ) === "t",
      "approved_at/by set",
    );

    assert.equal(
      Number(
        sqlScalar(
          `SELECT COUNT(*) FROM public.author_application_status_events WHERE application_id = '${applicationId}'::uuid`,
        ),
      ),
      4,
      "application status events journaled",
    );

    assert.equal(
      Number(
        sqlScalar(
          `SELECT COUNT(*) FROM public.author_access_status_events WHERE author_id = '${newAuthorId}'::uuid`,
        ),
      ),
      1,
      "access status event journaled",
    );

    const approveAgain = sqlScalarAsUser(
      staffId,
      `SELECT public.approve_author_application('${applicationId}'::uuid)::text`,
    );
    assertOk(approveAgain.includes('"idempotent": true'), "second approve idempotent");

    assert.equal(
      Number(
        sqlScalar(
          `SELECT COUNT(*) FROM public.authors a JOIN public.author_applications aa ON aa.author_id = a.id WHERE aa.id = '${applicationId}'::uuid`,
        ),
      ),
      1,
    );

    const practiceId = randomUUID();
    registry.register("practice", practiceId);

    sqlFile(`
INSERT INTO public.practices (
  id, author_id, title, slug, description, format, price, is_free, status, currency
) VALUES (
  '${practiceId}',
  '${newAuthorId}',
  'Free Product',
  'free-product-${suffix}',
  'Описание бесплатного продукта достаточной длины.',
  'Медитация',
  0,
  true,
  'draft',
  'RUB'
);
`);

    expectSqlFailure(
      () =>
        sqlFile(`
UPDATE public.practices
SET is_free = false, price = 99
WHERE id = '${practiceId}'::uuid;
`),
      "free author paid update",
    );

    sqlFile(`
UPDATE public.practices
SET status = 'published', published_at = now()
WHERE id = '${practiceId}'::uuid;
`);

    sqlFile(`
UPDATE public.authors
SET access_status = 'commercial_pending'
WHERE id = '${newAuthorId}'::uuid;
`);

    expectSqlFailure(
      () =>
        sqlFile(`
UPDATE public.practices
SET is_free = false, price = 199
WHERE id = '${practiceId}'::uuid;
`),
      "commercial_pending paid update",
    );

    sqlFile(`
UPDATE public.authors
SET access_status = 'commercial'
WHERE id = '${newAuthorId}'::uuid;
`);

    sqlFile(`
UPDATE public.practices
SET is_free = false, price = 199
WHERE id = '${practiceId}'::uuid;
`);

    assert.equal(
      sqlScalar(
        `SELECT is_free::text FROM public.practices WHERE id = '${practiceId}'::uuid`,
      ),
      "false",
      "commercial author can set paid",
    );

    assertOk(
      sqlScalarAsUser(
        staffId,
        `SELECT public.suspend_author_access('${newAuthorId}'::uuid, 'integration test suspend')::text`,
      ).includes('"ok": true'),
      "suspend ok",
    );

    expectSqlFailure(
      () =>
        sqlFile(`
UPDATE public.practices
SET title = 'Blocked while suspended'
WHERE id = '${practiceId}'::uuid;
`),
      "suspended mutation blocked",
    );

    assert.equal(
      sqlScalar(
        `SELECT title FROM public.practices WHERE id = '${practiceId}'::uuid`,
      ),
      "Free Product",
      "read preserved while suspended",
    );

    assertOk(
      sqlScalarAsUser(
        staffId,
        `SELECT public.restore_author_access('${newAuthorId}'::uuid, 'integration test restore')::text`,
      ).includes('"ok": true'),
      "restore ok",
    );

    assert.equal(
      sqlScalar(
        `SELECT access_status FROM public.authors WHERE id = '${newAuthorId}'::uuid`,
      ),
      "commercial",
      "restore returns previous working status",
    );

    sqlFile(`
INSERT INTO public.operational_email_deliveries (
  dedup_key, message_type, application_id, recipient_email, status, last_error
) VALUES (
  'author_access_granted:${applicationId}',
  'author_access_granted',
  '${applicationId}',
  'author-applicant-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}',
  'failed',
  'smtp_mock_failure'
);
`);

    assert.equal(
      sqlScalar(
        `SELECT status FROM public.operational_email_deliveries WHERE dedup_key = 'author_access_granted:${applicationId}'`,
      ),
      "failed",
    );

    sqlFile(`
UPDATE public.operational_email_deliveries
SET status = 'sent', sent_at = now(), last_error = NULL
WHERE dedup_key = 'author_access_granted:${applicationId}';
`);

    assert.equal(
      sqlScalar(
        `SELECT status FROM public.operational_email_deliveries WHERE dedup_key = 'author_access_granted:${applicationId}'`,
      ),
      "sent",
      "manual resend simulation",
    );

    expectSqlFailure(
      () =>
        sqlScalarAsUser(
          applicantId,
          `SELECT public.approve_author_application('${applicationId}'::uuid)::text`,
        ),
      "listener cannot approve",
    );

    const ownerRpc = sqlScalarAsUser(
      ownerStaffId,
      `SELECT public.approve_author_application('${applicationId}'::uuid)::text`,
    );
    assertOk(
      ownerRpc.includes('"idempotent": true'),
      "platform_owner can call admin RPC",
    );

    assert.equal(
      sqlScalar(
        `SELECT access_status FROM public.authors WHERE id = '${existingAuthorId}'::uuid`,
      ),
      "commercial",
      "existing authors remain commercial",
    );

    console.log(`${SCRIPT_NAME}: ok`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
