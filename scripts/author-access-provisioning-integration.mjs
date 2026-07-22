#!/usr/bin/env node
/**
 * DB integration: author application approval + access_status guards.
 * Requires allowlisted staging/local DB — never runs against production.
 */
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
  process.env.AUDIOLAD_TEST_DOCKER_CONTAINER ?? "supabase-db";
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

function applyPendingMigrations() {
  for (const file of [
    "20260722100000_author_access_foundation.sql",
    "20260722101000_author_provisioning_rpcs.sql",
    "20260722102000_author_access_guards.sql",
  ]) {
    const sql = readFileSync(path.join(ROOT, "supabase/migrations", file), "utf8");
    sqlFile(sql);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function setLocalAuthUser(userId) {
  sqlFile(`SELECT set_config('request.jwt.claim.sub', '${userId}', true);`);
  sqlFile(`SELECT set_config('request.jwt.claim.role', 'authenticated', true);`);
}

async function main() {
  applyPendingMigrations();

  const registry = new FixtureRegistry({ sqlFile, sqlScalar });

  await registry.runWithCleanup(async () => {
    const suffix = registry.runId;
    const applicantId = randomUUID();
    const staffId = randomUUID();
    const existingAuthorId = randomUUID();
    const applicationId = randomUUID();
    const password = "AuthorAccessTest2026!";

    registry.register("auth_user", applicantId);
    registry.register("auth_user", staffId);
    registry.register("author", existingAuthorId);
    registry.register("author_application", applicationId);

    sqlFile(`
BEGIN;

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
  );

INSERT INTO public.profiles (id, email, role)
VALUES
  ('${applicantId}', 'author-applicant-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}', 'listener'),
  ('${staffId}', 'author-staff-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}', 'platform_admin')
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

    setLocalAuthUser(staffId);

    const takeResult = sqlScalar(
      `SELECT public.take_author_application_in_review('${applicationId}'::uuid)::text`,
    );
    assert(takeResult.includes('"ok": true'), "take in review ok");

    const statusAfterTake = sqlScalar(
      `SELECT status FROM public.author_applications WHERE id = '${applicationId}'::uuid`,
    );
    assert.equal(statusAfterTake, "in_review");

    const approveResult = sqlScalar(
      `SELECT public.approve_author_application('${applicationId}'::uuid)::text`,
    );
    assert(approveResult.includes('"idempotent": false'), "first approve not idempotent");

    const newAuthorId = sqlScalar(
      `SELECT author_id::text FROM public.author_applications WHERE id = '${applicationId}'::uuid`,
    );
    assert(newAuthorId, "application linked to author");

    const newAccessStatus = sqlScalar(
      `SELECT access_status FROM public.authors WHERE id = '${newAuthorId}'::uuid`,
    );
    assert.equal(newAccessStatus, "free");

    const membershipCount = Number(
      sqlScalar(
        `SELECT COUNT(*) FROM public.author_members WHERE author_id = '${newAuthorId}'::uuid AND user_id = '${applicantId}'::uuid`,
      ),
    );
    assert.equal(membershipCount, 1);

    const authorCountForApplicant = Number(
      sqlScalar(
        `SELECT COUNT(*) FROM public.author_members WHERE user_id = '${applicantId}'::uuid`,
      ),
    );
    assert.equal(authorCountForApplicant, 2, "applicant keeps existing + new workspace");

    const approveAgain = sqlScalar(
      `SELECT public.approve_author_application('${applicationId}'::uuid)::text`,
    );
    assert(approveAgain.includes('"idempotent": true'), "second approve idempotent");

    const authorRowsAfterRepeat = Number(
      sqlScalar(
        `SELECT COUNT(*) FROM public.authors a JOIN public.author_applications aa ON aa.author_id = a.id WHERE aa.id = '${applicationId}'::uuid`,
      ),
    );
    assert.equal(authorRowsAfterRepeat, 1);

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

    let paidBlocked = false;
    try {
      sqlFile(`
UPDATE public.practices
SET is_free = false, price = 99
WHERE id = '${practiceId}'::uuid;
`);
    } catch {
      paidBlocked = true;
    }
    assert.equal(paidBlocked, true, "free author cannot set paid price");

    const existingCommercialStatus = sqlScalar(
      `SELECT access_status FROM public.authors WHERE id = '${existingAuthorId}'::uuid`,
    );
    assert.equal(existingCommercialStatus, "commercial");

    setLocalAuthUser(applicantId);
    let listenerBlocked = false;
    try {
      sqlScalar(
        `SELECT public.approve_author_application('${applicationId}'::uuid)::text`,
      );
    } catch {
      listenerBlocked = true;
    }
    assert.equal(listenerBlocked, true, "listener cannot approve");

    console.log(`${SCRIPT_NAME}: ok`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
