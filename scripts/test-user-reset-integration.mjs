#!/usr/bin/env node
/**
 * Docker SQL integration suite for test user reset cleanup semantics.
 *
 * Mutates audiolad-test-db only. No Supabase JS / production API.
 *
 *   npm run test:test-user-reset:integration
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateTestUserResetBlockers } from "../src/lib/admin/test-user-reset/policy.ts";
import { TEST_USER_RESET_EMAIL } from "../src/lib/admin/test-user-reset/constants.ts";
import { TEST_USER_RESET_BLOCK_CODES } from "../src/lib/admin/test-user-reset/types.ts";
import { LISTENER_ROLE } from "../src/lib/auth/platform-admin.ts";
import {
  ALLOWED_TEST_DB_CONTAINER,
  bootstrapTestUserResetDockerIntegration,
  quoteLiteral,
  runInTransaction,
  sqlFile,
  sqlScalar,
} from "./lib/test-user-reset-docker-db.mjs";
import {
  countAnalyticsEventsForUser,
  countEmailContactsForEmail,
  countOrdersForUser,
  sqlDeleteSyntheticEmailScope,
  sqlScopedAnalyticsEventsDelete,
  sqlScopedAnalyticsSessionsDelete,
} from "./lib/test-user-reset-sql-cleanup.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUN_ID = randomUUID().slice(0, 8);
const FIXTURE_MARKER = `_test_user_reset_sql_${RUN_ID}`;

const MIGRATION_FILES = [
  "20260722180000_test_user_reset_audit_log.sql",
  "20260722190000_admin_operation_log_reconciliation.sql",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function fixtureEmail(label) {
  return `reset-${label}-${RUN_ID}@audiolad.test`;
}

function fixtureNormalizedEmail(label) {
  return fixtureEmail(label).toLowerCase();
}

function insertAuthUser(userId, email) {
  sqlFile(`
SET search_path TO public, extensions, auth;
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
VALUES (
  ${quoteLiteral(userId)},
  'authenticated',
  'authenticated',
  ${quoteLiteral(email)},
  crypt(${quoteLiteral(`Test-Reset-${RUN_ID}`)}, gen_salt('bf')),
  now()
);
`);
}

function deleteAuthUser(userId) {
  sqlFile(`SET search_path TO public, extensions, auth; DELETE FROM auth.users WHERE id = ${quoteLiteral(userId)};`);
}

function readMigration(fileName) {
  return readFileSync(path.join(ROOT, "supabase/migrations", fileName), "utf8");
}

function applyAllMigrations() {
  for (const file of MIGRATION_FILES) {
    sqlFile(readMigration(file));
  }
}

function grantCountFor(role) {
  return Number(
    sqlScalar(
      `SELECT COUNT(*) FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='admin_operation_log' AND grantee='${role}'`,
    ),
  );
}

function assertAdminOperationLogFinalState(label) {
  assert(
    sqlScalar("SELECT to_regclass('public.admin_operation_log') IS NOT NULL") === "t",
    `${label}: table exists`,
  );
  assert(grantCountFor("service_role") > 0, `${label}: service_role grants present`);
  assert(grantCountFor("anon") === 0, `${label}: anon grants revoked`);
  assert(grantCountFor("authenticated") === 0, `${label}: authenticated grants revoked`);
}

function seedDriftedAdminOperationLog() {
  sqlFile(`
BEGIN;
DROP TABLE IF EXISTS public.admin_operation_log CASCADE;
CREATE TABLE public.admin_operation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  actor_user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  target_auth_user_id uuid NULL,
  target_email_hash text NOT NULL,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_operation_log_status_check
    CHECK (status IN ('success', 'partial', 'failed'))
);
CREATE INDEX admin_operation_log_operation_created_at_idx
  ON public.admin_operation_log (operation, created_at DESC);
ALTER TABLE public.admin_operation_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.admin_operation_log TO anon;
GRANT ALL ON TABLE public.admin_operation_log TO authenticated;
GRANT ALL ON TABLE public.admin_operation_log TO service_role;
INSERT INTO public.admin_operation_log (operation, target_email_hash, status)
VALUES ('test_user_reset', 'seed-${FIXTURE_MARKER}', 'success');
COMMIT;
`);
}

function testMigrationScenarios() {
  sqlFile("DROP TABLE IF EXISTS public.admin_operation_log CASCADE;");
  applyAllMigrations();
  assertAdminOperationLogFinalState("clean-db");

  seedDriftedAdminOperationLog();
  assert(grantCountFor("anon") > 0, "drifted seed has anon grants");
  applyAllMigrations();
  assertAdminOperationLogFinalState("drifted-db");
  assert(
    sqlScalar("SELECT COUNT(*) FROM public.admin_operation_log") === "1",
    "drifted-db keeps existing audit row",
  );

  applyAllMigrations();
  assertAdminOperationLogFinalState("reapply");
}

function cleanupLeftoverFixtures() {
  sqlFile(`
SET search_path TO public, extensions, auth;
DELETE FROM public.analytics_events WHERE payload->>'marker' LIKE '_test_user_reset_sql_%' OR event_name LIKE 'test_reset_%';
DELETE FROM public.analytics_sessions WHERE anonymous_id LIKE '%test_user_reset%';
DELETE FROM public.email_outbox WHERE payload->>'marker' LIKE '_test_user_reset_sql_%';
DELETE FROM public.email_contacts WHERE source LIKE '_test_user_reset_sql_%' OR normalized_email LIKE '%@audiolad.test';
DELETE FROM auth.users WHERE email LIKE '%@audiolad.test';
`);
}

function testPreflightCounts() {
  runInTransaction("preflight-counts", (tx) => {
    const userId = randomUUID();
    const email = fixtureEmail("preflight");
    const normalized = fixtureNormalizedEmail("preflight");
    const eventId = randomUUID();
    const sessionId = randomUUID();
    const anonymousId = `anon-${FIXTURE_MARKER}`;

    tx.sql(`
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
VALUES (
  ${tx.quoteLiteral(userId)}, 'authenticated', 'authenticated', ${tx.quoteLiteral(email)},
  crypt(${tx.quoteLiteral(`Test-Reset-${RUN_ID}`)}, gen_salt('bf')), now()
);

INSERT INTO public.analytics_sessions (
  id, anonymous_id, user_id, started_at, last_seen_at, device_type
) VALUES (
  ${tx.quoteLiteral(sessionId)}, ${tx.quoteLiteral(anonymousId)}, ${tx.quoteLiteral(userId)}, now(), now(), 'desktop'
);

INSERT INTO public.analytics_events (
  id, user_id, anonymous_session_id, session_id, event_name, payload, occurred_at
) VALUES (
  ${tx.quoteLiteral(eventId)}, ${tx.quoteLiteral(userId)}, ${tx.quoteLiteral(anonymousId)}, ${tx.quoteLiteral(sessionId)}::uuid,
  'test_reset_preflight', jsonb_build_object('marker', ${tx.quoteLiteral(FIXTURE_MARKER)}), now()
);

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.email_contacts WHERE normalized_email = ${tx.quoteLiteral(normalized)}) < 1 THEN
    RAISE EXCEPTION 'preflight email contact missing';
  END IF;
  IF (SELECT COUNT(*) FROM public.analytics_events WHERE user_id = ${tx.quoteLiteral(userId)}::uuid) <> 1 THEN
    RAISE EXCEPTION 'preflight analytics event missing';
  END IF;
  IF (SELECT COUNT(*) FROM public.orders WHERE user_id = ${tx.quoteLiteral(userId)}::uuid) <> 0 THEN
    RAISE EXCEPTION 'preflight orders must be empty';
  END IF;
END $$;
`);
  });
}

function testBlockersPolicyWithSyntheticCounts() {
  const ordersBlockers = evaluateTestUserResetBlockers({
    resolvedEmail: TEST_USER_RESET_EMAIL,
    profileRole: LISTENER_ROLE,
    counts: {
      userPractices: 0,
      practiceAudioProgress: 0,
      playlists: 0,
      playlistItems: 0,
      emailContacts: 0,
      emailPreferences: 0,
      emailConsents: 0,
      emailOutbox: 0,
      emailDeliveryEvents: 0,
      analyticsSessions: 0,
      analyticsEvents: 0,
      orders: 1,
      payments: 0,
      refundedOrders: 0,
      personalMaterialsCreated: 0,
      personalMaterialsClaimed: 0,
      authorMembers: 0,
      authorApplications: 0,
      promotionCampaigns: 0,
      personalMaterialTemplates: 0,
    },
  });

  assert(
    ordersBlockers.some((row) => row.code === TEST_USER_RESET_BLOCK_CODES.orders),
    "allowlisted email with orders is blocked",
  );

  const syntheticEmail = fixtureEmail("blocker");
  const wrongEmailBlockers = evaluateTestUserResetBlockers({
    resolvedEmail: syntheticEmail,
    profileRole: LISTENER_ROLE,
    counts: {
      userPractices: 0,
      practiceAudioProgress: 0,
      playlists: 0,
      playlistItems: 0,
      emailContacts: 0,
      emailPreferences: 0,
      emailConsents: 0,
      emailOutbox: 0,
      emailDeliveryEvents: 0,
      analyticsSessions: 0,
      analyticsEvents: 0,
      orders: 0,
      payments: 0,
      refundedOrders: 0,
      personalMaterialsCreated: 0,
      personalMaterialsClaimed: 0,
      authorMembers: 0,
      authorApplications: 0,
      promotionCampaigns: 0,
      personalMaterialTemplates: 0,
    },
  });

  assert(
    wrongEmailBlockers.some((row) => row.code === TEST_USER_RESET_BLOCK_CODES.wrong_email_target),
    "non-allowlisted synthetic email stays blocked by policy",
  );
}

function testBlockersSqlSignal() {
  runInTransaction("blockers-sql", (tx) => {
    const userId = randomUUID();
    const email = fixtureEmail("orders");
    const practiceId = sqlScalar("SELECT id FROM public.practices ORDER BY created_at DESC LIMIT 1");
    assert(practiceId, "practice fixture for orders blocker signal");

    tx.sql(`
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
VALUES (
  ${tx.quoteLiteral(userId)}, 'authenticated', 'authenticated', ${tx.quoteLiteral(email)},
  crypt(${tx.quoteLiteral(`Test-Reset-${RUN_ID}`)}, gen_salt('bf')), now()
);

INSERT INTO public.orders (
  id, user_id, practice_id, status, amount_minor, currency,
  practice_title_snapshot, practice_slug_snapshot, price_minor_snapshot, paid_at
) VALUES (
  ${tx.quoteLiteral(randomUUID())}, ${tx.quoteLiteral(userId)}, ${tx.quoteLiteral(practiceId)}, 'paid', 100, 'RUB',
  'reset-test', 'reset-test', 100, now()
);

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.orders WHERE user_id = ${tx.quoteLiteral(userId)}::uuid) <> 1 THEN
    RAISE EXCEPTION 'sql preflight must detect blocking order';
  END IF;
END $$;
`);
  });
}

function testEmailCleanup() {
  const userId = randomUUID();
  const email = fixtureEmail("email");
  const normalized = fixtureNormalizedEmail("email");
  const outboxId = randomUUID();

  try {
    insertAuthUser(userId, email);
    const contactId = sqlScalar(
      `SELECT id FROM public.email_contacts WHERE normalized_email = ${quoteLiteral(normalized)} LIMIT 1`,
    );
    assert(contactId, "trigger-created email contact");

    sqlFile(`
INSERT INTO public.email_outbox (
  id, message_type, contact_id, user_id, to_email, template_key, template_version, payload
) VALUES (
  ${quoteLiteral(outboxId)}, 'transactional', ${quoteLiteral(contactId)}, ${quoteLiteral(userId)},
  ${quoteLiteral(email)}, 'test_reset', '1', jsonb_build_object('marker', ${quoteLiteral(FIXTURE_MARKER)})
);
`);

    assert(countEmailContactsForEmail(normalized) === 1, "email fixture seeded");
    sqlFile(sqlDeleteSyntheticEmailScope(userId, [contactId], normalized));
    assert(countEmailContactsForEmail(normalized) === 0, "email contacts cleaned");
    assert(
      sqlScalar(`SELECT COUNT(*) FROM public.email_outbox WHERE id = ${quoteLiteral(outboxId)}`) === "0",
      "email outbox cleaned",
    );
  } finally {
    deleteAuthUser(userId);
  }
}

function testAnalyticsCleanup() {
  const userId = randomUUID();
  const email = fixtureEmail("analytics");
  const sessionId = randomUUID();
  const eventId = randomUUID();
  const anonymousId = `anon-analytics-${RUN_ID}`;

  try {
    insertAuthUser(userId, email);
    sqlFile(`
INSERT INTO public.analytics_sessions (
  id, anonymous_id, user_id, started_at, last_seen_at, device_type
) VALUES (
  ${quoteLiteral(sessionId)}, ${quoteLiteral(anonymousId)}, ${quoteLiteral(userId)},
  now(), now(), 'desktop'
);

INSERT INTO public.analytics_events (
  id, user_id, anonymous_session_id, session_id, event_name, payload, occurred_at
) VALUES (
  ${quoteLiteral(eventId)}, ${quoteLiteral(userId)}, ${quoteLiteral(anonymousId)},
  ${quoteLiteral(sessionId)}::uuid, 'test_reset_analytics',
  jsonb_build_object('marker', ${quoteLiteral(FIXTURE_MARKER)}), now()
);
`);

    sqlFile(sqlScopedAnalyticsEventsDelete(userId, [anonymousId], [sessionId]));
    sqlFile(sqlScopedAnalyticsSessionsDelete(userId, [anonymousId], [sessionId]));

    assert(countAnalyticsEventsForUser(userId) === 0, "analytics events cleaned");
    assert(
      sqlScalar(
        `SELECT COUNT(*) FROM public.analytics_sessions WHERE user_id = ${quoteLiteral(userId)}`,
      ) === "0",
      "analytics sessions cleaned",
    );
  } finally {
    deleteAuthUser(userId);
  }
}

function testSharedAnonymousIdSafety() {
  runInTransaction("shared-anonymous-id", (tx) => {
    const targetUserId = randomUUID();
    const otherUserId = randomUUID();
    const sharedAnonymous = `shared-anon-${RUN_ID}`;
    const targetEventId = randomUUID();
    const otherEventId = randomUUID();

    tx.sql(`
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
VALUES
  (${tx.quoteLiteral(targetUserId)}, 'authenticated', 'authenticated', ${tx.quoteLiteral(fixtureEmail("target"))}, crypt(${tx.quoteLiteral(`Test-Reset-${RUN_ID}`)}, gen_salt('bf')), now()),
  (${tx.quoteLiteral(otherUserId)}, 'authenticated', 'authenticated', ${tx.quoteLiteral(fixtureEmail("other"))}, crypt(${tx.quoteLiteral(`Test-Reset-${RUN_ID}`)}, gen_salt('bf')), now());

INSERT INTO public.analytics_events (
  id, user_id, anonymous_session_id, event_name, payload, occurred_at
) VALUES
  (${tx.quoteLiteral(targetEventId)}, ${tx.quoteLiteral(targetUserId)}, ${tx.quoteLiteral(sharedAnonymous)}, 'target_event', '{}'::jsonb, now()),
  (${tx.quoteLiteral(otherEventId)}, ${tx.quoteLiteral(otherUserId)}, ${tx.quoteLiteral(sharedAnonymous)}, 'other_event', '{}'::jsonb, now());

DELETE FROM public.analytics_events
WHERE user_id = ${tx.quoteLiteral(targetUserId)}
   OR (
     anonymous_session_id = ${tx.quoteLiteral(sharedAnonymous)}
     AND (user_id IS NULL OR user_id = ${tx.quoteLiteral(targetUserId)})
   );

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM public.analytics_events WHERE id = ${tx.quoteLiteral(otherEventId)}::uuid) <> 1 THEN
    RAISE EXCEPTION 'other registered user analytics event not preserved';
  END IF;
  IF (SELECT COUNT(*) FROM public.analytics_events WHERE id = ${tx.quoteLiteral(targetEventId)}::uuid) <> 0 THEN
    RAISE EXCEPTION 'target analytics event not deleted';
  END IF;
END $$;
`);
  });
}

function testIdempotentCleanup() {
  const userId = randomUUID();
  const email = fixtureEmail("idempotent");
  const normalized = fixtureNormalizedEmail("idempotent");
  const eventId = randomUUID();
  const anonymousId = `anon-idempotent-${RUN_ID}`;

  try {
    insertAuthUser(userId, email);
    const contactId = sqlScalar(
      `SELECT id FROM public.email_contacts WHERE normalized_email = ${quoteLiteral(normalized)} LIMIT 1`,
    );

    sqlFile(`
INSERT INTO public.analytics_events (
  id, user_id, anonymous_session_id, event_name, payload, occurred_at
) VALUES (
  ${quoteLiteral(eventId)}, ${quoteLiteral(userId)}, ${quoteLiteral(anonymousId)},
  'idempotent_event', jsonb_build_object('marker', ${quoteLiteral(FIXTURE_MARKER)}), now()
);
`);

    sqlFile(sqlDeleteSyntheticEmailScope(userId, contactId ? [contactId] : [], normalized));
    sqlFile(sqlScopedAnalyticsEventsDelete(userId, [anonymousId], []));

    assert(countEmailContactsForEmail(normalized) === 0, "first cleanup pass cleared email");
    assert(countAnalyticsEventsForUser(userId) === 0, "first cleanup pass cleared analytics");

    sqlFile(sqlDeleteSyntheticEmailScope(userId, contactId ? [contactId] : [], normalized));
    sqlFile(sqlScopedAnalyticsEventsDelete(userId, [anonymousId], []));

    assert(countEmailContactsForEmail(normalized) === 0, "second cleanup pass remains clean");
    assert(countAnalyticsEventsForUser(userId) === 0, "idempotent analytics cleanup");
  } finally {
    deleteAuthUser(userId);
  }
}

function cleanupCommittedFixtures() {
  sqlFile(`
DELETE FROM public.analytics_events
WHERE payload->>'marker' = ${quoteLiteral(FIXTURE_MARKER)}
   OR event_name LIKE 'test_reset_%';

DELETE FROM public.analytics_sessions
WHERE anonymous_id LIKE ${quoteLiteral(`%${RUN_ID}%`)};

DELETE FROM public.email_outbox
WHERE payload->>'marker' = ${quoteLiteral(FIXTURE_MARKER)};

DELETE FROM public.email_contacts
WHERE source = ${quoteLiteral(FIXTURE_MARKER)}
   OR normalized_email LIKE ${quoteLiteral(`%${RUN_ID}@audiolad.test`)};

DELETE FROM auth.users
WHERE email LIKE ${quoteLiteral(`%${RUN_ID}@audiolad.test`)};
`);
}

function main() {
  assert(ALLOWED_TEST_DB_CONTAINER === "audiolad-test-db", "container constant drift");
  bootstrapTestUserResetDockerIntegration();
  cleanupLeftoverFixtures();

  testMigrationScenarios();
  testPreflightCounts();
  testBlockersPolicyWithSyntheticCounts();
  testBlockersSqlSignal();
  testEmailCleanup();
  testAnalyticsCleanup();
  testSharedAnonymousIdSafety();
  testIdempotentCleanup();
  cleanupCommittedFixtures();

  console.log("test-user-reset-integration: ok");
}

main();
