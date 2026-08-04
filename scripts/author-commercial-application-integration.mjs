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
BEGIN;
SELECT set_config('audiolad.allow_practice_publish', 'on', true);
SELECT set_config('audiolad.allow_practice_moderation_update', 'on', true);
SELECT set_config('audiolad.allow_practice_soft_delete', 'on', true);
SELECT set_config('audiolad.allow_moderated_content_update', 'on', true);
DELETE FROM public.audio_items
WHERE practice_id IN (SELECT id FROM public.practices WHERE author_id IN (${authors}));
DELETE FROM public.practices
WHERE author_id IN (${authors});
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
COMMIT;
`);
}

function applyMigration() {
  for (const relativePath of [
    "supabase/migrations/20260725230000_author_commercial_applications.sql",
    "supabase/migrations/20260727180000_commercial_onboarding_access_statuses.sql",
    "supabase/migrations/20260804090000_commercial_application_free_product_gate.sql",
  ]) {
    const sql = readFileSync(path.join(ROOT, relativePath), "utf8");
    sqlFile(sql);
  }
}

function insertPractice(input) {
  const {
    id,
    authorId,
    title,
    slug,
    status = "draft",
    isFree = true,
    price = 0,
    productKind = "practice",
    format = "Медитация",
    moderationStatus = "not_submitted",
    deletedAt = null,
    musicUsage = null,
  } = input;

  const deletedSql = deletedAt ? `'${deletedAt}'::timestamptz` : "NULL";
  const musicSql =
    musicUsage === null ? "NULL" : `'${musicUsage.replace(/'/g, "''")}'`;

  sqlFile(`
BEGIN;
SELECT set_config('audiolad.allow_practice_moderation_update', 'on', true);
SELECT set_config('audiolad.allow_practice_publish', 'on', true);
INSERT INTO public.practices (
  id, author_id, title, slug, description, format, price, is_free, status,
  product_kind, music_usage_permission, moderation_status, deleted_at, published_at
) VALUES (
  '${id}'::uuid,
  '${authorId}'::uuid,
  '${title.replace(/'/g, "''")}',
  '${slug}',
  'Описание тестового продукта для commercial gate.',
  '${format}',
  ${price},
  ${isFree ? "true" : "false"},
  '${status}',
  '${productKind}',
  ${musicSql},
  '${moderationStatus}',
  ${deletedSql},
  ${status === "published" ? "now()" : "NULL"}
);
COMMIT;
`);
}

function replacePractice(input) {
  sqlFile(`
BEGIN;
DELETE FROM public.audio_items WHERE practice_id = '${input.id}'::uuid;
DELETE FROM public.practices WHERE id = '${input.id}'::uuid;
COMMIT;
`);
  insertPractice(input);
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
    const freePracticeId = randomUUID();
    const otherFreePracticeId = randomUUID();
    const musicAlbumId = randomUUID();
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

      // Gate rejects: 0 products
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
        "submit without products",
      );

      // Draft allowed without published free product
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

      // Draft submit still gated
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
              'комментарий'
            )::text`,
          ),
        "draft submit without free product",
      );

      // Reject: draft free only
      insertPractice({
        id: freePracticeId,
        authorId,
        title: "Draft free",
        slug: `draft-free-${suffix}`,
        status: "draft",
        isFree: true,
        price: 0,
      });
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
        "draft free rejects",
      );

      // Reject: free submitted / changes_requested
      replacePractice({
        id: freePracticeId,
        authorId,
        title: "Submitted free",
        slug: `submitted-free-${suffix}`,
        status: "draft",
        isFree: true,
        price: 0,
        moderationStatus: "submitted",
      });
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
        "submitted free rejects",
      );
      replacePractice({
        id: freePracticeId,
        authorId,
        title: "Changes requested free",
        slug: `changes-free-${suffix}`,
        status: "draft",
        isFree: true,
        price: 0,
        moderationStatus: "changes_requested",
      });
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
        "changes_requested free rejects",
      );

      // Reject: published paid
      sqlFile(`
UPDATE public.authors
SET access_status = 'commercial_active'
WHERE id = '${authorId}'::uuid;
`);
      replacePractice({
        id: freePracticeId,
        authorId,
        title: "Published paid",
        slug: `paid-pub-${suffix}`,
        status: "published",
        isFree: false,
        price: 990,
        moderationStatus: "approved",
      });
      sqlFile(`
UPDATE public.authors
SET access_status = 'free'
WHERE id = '${authorId}'::uuid;
`);
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
        "published paid rejects",
      );

      // Reject: soft-deleted published free
      replacePractice({
        id: freePracticeId,
        authorId,
        title: "Deleted free",
        slug: `deleted-free-${suffix}`,
        status: "published",
        isFree: true,
        price: 0,
        moderationStatus: "approved",
        deletedAt: "2026-08-04T06:00:00Z",
      });
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
        "soft-deleted free rejects",
      );

      // Reject: published free of another author
      insertPractice({
        id: otherFreePracticeId,
        authorId: otherAuthorId,
        title: "Other free",
        slug: `other-free-${suffix}`,
        status: "published",
        isFree: true,
        price: 0,
        moderationStatus: "approved",
      });
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
        "other author product rejects",
      );

      // Accept: published free practice
      replacePractice({
        id: freePracticeId,
        authorId,
        title: "Published free practice",
        slug: `pub-free-${suffix}`,
        status: "published",
        isFree: true,
        price: 0,
        moderationStatus: "approved",
      });
      assert.equal(
        sqlScalar(
          `SELECT CASE WHEN public.author_has_published_free_product_for_commercial_gate('${authorId}'::uuid) THEN 't' ELSE 'f' END`,
        ),
        "t",
        "gate helper true for published free practice",
      );

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

      // 9. Resubmit after needs_changes — exempt from free-product gate
      replacePractice({
        id: freePracticeId,
        authorId,
        title: "Deleted after submit",
        slug: `deleted-after-${suffix}`,
        status: "published",
        isFree: true,
        price: 0,
        moderationStatus: "approved",
        deletedAt: "2026-08-04T06:10:00Z",
      });
      assert.equal(
        sqlScalar(
          `SELECT CASE WHEN public.author_has_published_free_product_for_commercial_gate('${authorId}'::uuid) THEN 't' ELSE 'f' END`,
        ),
        "f",
        "no published free before needs_changes resubmit",
      );
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

      // Existing commercial project is not affected / cannot re-submit
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
        "commercial_onboarding blocks new submit",
      );

      // Music album (multi-track) counts for gate helper
      insertPractice({
        id: musicAlbumId,
        authorId: otherAuthorId,
        title: "Free music album",
        slug: `music-album-${suffix}`,
        status: "published",
        isFree: true,
        price: 0,
        productKind: "music",
        format: "Музыка",
        moderationStatus: "approved",
        musicUsage: "listen_only",
      });
      const trackA = randomUUID();
      const trackB = randomUUID();
      sqlFile(`
BEGIN;
SELECT set_config('audiolad.allow_practice_publish', 'on', true);
INSERT INTO public.audio_items (id, practice_id, title, position, status, audio_path, duration_seconds)
VALUES
  ('${trackA}'::uuid, '${musicAlbumId}'::uuid, 'Track 1', 1, 'published', 'practices/${musicAlbumId}/1.mp3', 120),
  ('${trackB}'::uuid, '${musicAlbumId}'::uuid, 'Track 2', 2, 'published', 'practices/${musicAlbumId}/2.mp3', 130);
COMMIT;
`);
      // otherFreePracticeId already published; music album also valid
      assert.equal(
        sqlScalar(
          `SELECT CASE WHEN public.author_has_published_free_product_for_commercial_gate('${otherAuthorId}'::uuid) THEN 't' ELSE 'f' END`,
        ),
        "t",
        "music album counts as published free",
      );

      // Reject path on a second author (has published free)
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
