#!/usr/bin/env node
/**
 * DB integration: commercial applications + access_status sync.
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

const SCRIPT_NAME = "scripts/author-commercial-application-integration.mjs";
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

function sqlScalarAsUser(userId, query) {
  const oneLine = query.replace(/\s+/g, " ").trim();
  return execSync(
    `docker exec ${DOCKER_CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -tAc ${JSON.stringify(
      `SELECT set_config('request.jwt.claim.sub', '${userId}', true); SELECT set_config('request.jwt.claim.role', 'authenticated', true); SET LOCAL ROLE authenticated; ${oneLine}`,
    )}`,
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .pop()
    ?.trim();
}

function cleanupAuthors(authorIds, userIds) {
  const authors = authorIds.map((id) => `'${id}'::uuid`).join(", ");
  const users = userIds.map((id) => `'${id}'::uuid`).join(", ");
  sqlFile(`
DELETE FROM public.author_access_status_events
WHERE author_id IN (${authors}) OR changed_by IN (${users});
DELETE FROM public.author_commercial_application_status_events
WHERE application_id IN (
  SELECT id FROM public.author_commercial_applications WHERE author_id IN (${authors})
);
DELETE FROM public.author_commercial_applications
WHERE author_id IN (${authors});
DELETE FROM public.author_members
WHERE author_id IN (${authors});
`);
}

function applyMigration() {
  for (const relativePath of [
    "supabase/migrations/20260725230000_author_commercial_applications.sql",
    "supabase/migrations/20260727180000_commercial_onboarding_access_statuses.sql",
  ]) {
    const sql = readFileSync(path.join(ROOT, relativePath), "utf8");
    sqlFile(sql);
  }
}

function expectFailure(fn, label) {
  try {
    fn();
    throw new Error(`${label}: expected failure`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("expected failure")) {
      throw error;
    }
  }
}

const PLANNED =
  "Планирую размещать платные медитации на сон и практики для утреннего настроя.";
const TOPICS = "Сон, спокойствие";
const FORMAT = "Отдельные практики";

async function main() {
  applyMigration();

  assert.equal(
    sqlScalar(
      "SELECT to_regclass('public.author_commercial_applications') IS NOT NULL",
    ),
    "t",
    "table exists",
  );

  const registry = new FixtureRegistry({ sqlFile, sqlScalar });

  await registry.runWithCleanup(async () => {
    const suffix = registry.runId;
    const authorUserId = randomUUID();
    const otherUserId = randomUUID();
    const staffId = randomUUID();
    const authorId = randomUUID();
    const otherAuthorId = randomUUID();
    const password = "CommercialAppTest2026!";

    registry.register("auth_user", authorUserId);
    registry.register("auth_user", otherUserId);
    registry.register("auth_user", staffId);
    registry.register("author", authorId);
    registry.register("author", otherAuthorId);

    try {
      sqlFile(`
BEGIN;
SET search_path TO public, extensions, auth;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
VALUES
  ('${authorUserId}', 'authenticated', 'authenticated', 'commercial-author-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}', crypt('${password}', gen_salt('bf')), now()),
  ('${otherUserId}', 'authenticated', 'authenticated', 'commercial-other-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}', crypt('${password}', gen_salt('bf')), now()),
  ('${staffId}', 'authenticated', 'authenticated', 'commercial-staff-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}', crypt('${password}', gen_salt('bf')), now());

INSERT INTO public.profiles (id, email, role)
VALUES
  ('${authorUserId}', 'commercial-author-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}', 'listener'),
  ('${otherUserId}', 'commercial-other-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}', 'listener'),
  ('${staffId}', 'commercial-staff-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}', 'platform_admin')
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

INSERT INTO public.authors (id, name, slug, access_status)
VALUES
  ('${authorId}', 'Commercial Author ${suffix}', 'commercial-author-${suffix}', 'free'),
  ('${otherAuthorId}', 'Other Author ${suffix}', 'other-author-${suffix}', 'free');

INSERT INTO public.author_members (author_id, user_id, role)
VALUES
  ('${authorId}', '${authorUserId}', 'owner'),
  ('${otherAuthorId}', '${otherUserId}', 'owner');

COMMIT;
`);

      // 3. Draft
      const draftResult = sqlScalarAsUser(
        authorUserId,
        `SELECT public.save_author_commercial_application_draft(
          '${authorId}'::uuid,
          'черновик планируемых продуктов',
          'сон',
          '${FORMAT}',
          false,
          NULL
        )::text`,
      );
      assert.ok(draftResult.includes('"ok": true'), "draft ok");
      assert.ok(draftResult.includes('"status": "draft"'), "draft status");

      const applicationId = sqlScalar(
        `SELECT id::text FROM public.author_commercial_applications WHERE author_id = '${authorId}'::uuid`,
      );
      assert.ok(applicationId, "application id");

      assert.equal(
        sqlScalar(
          `SELECT access_status FROM public.authors WHERE id = '${authorId}'::uuid`,
        ),
        "free",
        "draft keeps free",
      );

      // 4. Submit
      const submitResult = sqlScalarAsUser(
        authorUserId,
        `SELECT public.submit_author_commercial_application(
          '${authorId}'::uuid,
          '${PLANNED}',
          '${TOPICS}',
          '${FORMAT}',
          true,
          'комментарий'
        )::text`,
      );
      assert.ok(submitResult.includes('"ok": true'), "submit ok");
      assert.ok(submitResult.includes('"status": "submitted"'), "submitted");
      assert.ok(
        submitResult.includes('"access_status": "commercial_pending"'),
        "pending after submit",
      );
      assert.equal(
        sqlScalar(
          `SELECT access_status FROM public.authors WHERE id = '${authorId}'::uuid`,
        ),
        "commercial_pending",
      );

      // 5. Duplicate active submit forbidden
      expectFailure(
        () =>
          sqlScalarAsUser(
            authorUserId,
            `SELECT public.submit_author_commercial_application(
              '${authorId}'::uuid,
              '${PLANNED}',
              '${TOPICS}',
              '${FORMAT}',
              true,
              NULL
            )::text`,
          ),
        "duplicate submit",
      );

      // 15. Other author cannot read via RLS
      const otherSelect = sqlScalarAsUser(
        otherUserId,
        `SELECT count(*)::text FROM public.author_commercial_applications WHERE id = '${applicationId}'::uuid`,
      );
      assert.equal(otherSelect, "0", "other author cannot select");

      // 16. Client cannot approve
      expectFailure(
        () =>
          sqlScalarAsUser(
            authorUserId,
            `SELECT public.approve_author_commercial_application('${applicationId}'::uuid)::text`,
          ),
        "author cannot approve",
      );

      // 7. In review
      assert.ok(
        sqlScalarAsUser(
          staffId,
          `SELECT public.take_author_commercial_application_in_review('${applicationId}'::uuid, 'note')::text`,
        ).includes('"ok": true'),
        "take in review",
      );
      assert.equal(
        sqlScalar(
          `SELECT status FROM public.author_commercial_applications WHERE id = '${applicationId}'::uuid`,
        ),
        "in_review",
      );

      // 8. Needs changes
      assert.ok(
        sqlScalarAsUser(
          staffId,
          `SELECT public.request_author_commercial_application_changes(
            '${applicationId}'::uuid,
            'Уточните тематику.',
            NULL
          )::text`,
        ).includes('"ok": true'),
        "needs changes",
      );
      assert.equal(
        sqlScalar(
          `SELECT review_comment FROM public.author_commercial_applications WHERE id = '${applicationId}'::uuid`,
        ),
        "Уточните тематику.",
      );

      // 9. Resubmit after needs_changes
      const resubmit = sqlScalarAsUser(
        authorUserId,
        `SELECT public.submit_author_commercial_application(
          '${authorId}'::uuid,
          '${PLANNED} Дополнено.',
          '${TOPICS}, энергия',
          '${FORMAT}',
          true,
          NULL
        )::text`,
      );
      assert.ok(resubmit.includes('"status": "submitted"'), "resubmit ok");

      assert.ok(
        sqlScalarAsUser(
          staffId,
          `SELECT public.take_author_commercial_application_in_review('${applicationId}'::uuid, NULL)::text`,
        ).includes('"ok": true'),
        "take in review again",
      );

      // 10–11. Approve → commercial_onboarding (paid still closed)
      const approve = sqlScalarAsUser(
        staffId,
        `SELECT public.approve_author_commercial_application('${applicationId}'::uuid, 'ok')::text`,
      );
      assert.ok(approve.includes('"status": "approved"'), "approved");
      assert.ok(
        approve.includes('"access_status": "commercial_onboarding"'),
        "commercial_onboarding",
      );
      assert.equal(
        sqlScalar(
          `SELECT access_status FROM public.authors WHERE id = '${authorId}'::uuid`,
        ),
        "commercial_onboarding",
      );
      assert.equal(
        sqlScalar(
          `SELECT public.author_access_allows_paid_products('commercial_onboarding')`,
        ),
        "f",
      );
      assert.equal(
        sqlScalar(
          `SELECT public.author_access_allows_paid_products('commercial_active')`,
        ),
        "t",
      );

      const approveAgain = sqlScalarAsUser(
        staffId,
        `SELECT public.approve_author_commercial_application('${applicationId}'::uuid, 'ok')::text`,
      );
      assert.ok(
        approveAgain.includes('"idempotent": true'),
        "idempotent approve",
      );

      // Reject path on a second author
      const draft2 = sqlScalarAsUser(
        otherUserId,
        `SELECT public.submit_author_commercial_application(
          '${otherAuthorId}'::uuid,
          '${PLANNED}',
          '${TOPICS}',
          '${FORMAT}',
          true,
          NULL
        )::text`,
      );
      assert.ok(draft2.includes('"ok": true'), "second submit");
      const app2 = sqlScalar(
        `SELECT id::text FROM public.author_commercial_applications WHERE author_id = '${otherAuthorId}'::uuid`,
      );

      // 12. Reject → free
      const reject = sqlScalarAsUser(
        staffId,
        `SELECT public.reject_author_commercial_application(
          '${app2}'::uuid,
          'Пока недостаточно материалов.',
          NULL
        )::text`,
      );
      assert.ok(reject.includes('"status": "rejected"'), "rejected");
      assert.equal(
        sqlScalar(
          `SELECT access_status FROM public.authors WHERE id = '${otherAuthorId}'::uuid`,
        ),
        "free",
      );

      // No re-submit after reject (unique non-withdrawn)
      expectFailure(
        () =>
          sqlScalarAsUser(
            otherUserId,
            `SELECT public.submit_author_commercial_application(
              '${otherAuthorId}'::uuid,
              '${PLANNED}',
              '${TOPICS}',
              '${FORMAT}',
              true,
              NULL
            )::text`,
          ),
        "reject blocks resubmit",
      );
    } finally {
      cleanupAuthors(
        [authorId, otherAuthorId],
        [authorUserId, otherUserId, staffId],
      );
    }
  });

  // Idempotent re-apply migration
  applyMigration();
  assert.equal(
    sqlScalar(
      "SELECT to_regclass('public.author_commercial_applications') IS NOT NULL",
    ),
    "t",
  );

  console.log(`${SCRIPT_NAME}: ok`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
