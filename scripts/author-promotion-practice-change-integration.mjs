#!/usr/bin/env node
/**
 * SQL integration: campaign stats after practice_id change.
 * Requires allowlisted staging/local DB — never runs against production.
 */
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import {
  TEST_DATABASE_ENV,
  assertFixtureWritesAllowed,
  isTestDatabaseFlagSet,
} from "./lib/fixture-context.mjs";
import {
  FIXTURE_TEST_EMAIL_DOMAIN,
  buildAnalyticsFixturePayload,
  buildPracticeFixtureCoverImage,
} from "./lib/fixture-marker.mjs";
import { FixtureRegistry } from "./lib/fixture-registry.mjs";

const SCRIPT_NAME = "scripts/author-promotion-practice-change-integration.mjs";
const FIXTURE_NAMESPACE = "author-promotion-practice-change";
const DOCKER_CONTAINER =
  process.env.AUDIOLAD_TEST_DOCKER_CONTAINER ?? "supabase-db-staging";

if (!isTestDatabaseFlagSet()) {
  console.log(
    `${SCRIPT_NAME}: skipped (${TEST_DATABASE_ENV} is not set)`,
  );
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

function campaignStatsEventCount(campaignId) {
  return Number(
    sqlScalar(`
      SELECT COALESCE(SUM(event_count), 0)
      FROM (
        SELECT COUNT(*)::bigint AS event_count
        FROM public.analytics_events AS ae
        JOIN public.promotion_campaigns AS pc ON pc.id = '${campaignId}'::uuid
        WHERE ae.practice_id = pc.practice_id
          AND ae.utm_campaign = pc.campaign_key
          AND ae.event_name LIKE 'promo\\_%' ESCAPE '\\'
      ) AS stats
    `),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const registry = new FixtureRegistry({ sqlFile, sqlScalar });

  await registry.runWithCleanup(async () => {
    const suffix = registry.runId;
    const campaignKey = `practice_change_${suffix}`;
    const sessionId = `promo-practice-change-${suffix}`;
    const authorId = randomUUID();
    const practiceA = randomUUID();
    const practiceB = randomUUID();
    const campaignId = randomUUID();
    const userId = randomUUID();
    const markerJson = JSON.stringify(
      buildPracticeFixtureCoverImage(FIXTURE_NAMESPACE, suffix),
    ).replace(/'/g, "''");

    registry.register("auth_user", userId);
    registry.register("author", authorId);
    registry.register("practice", practiceA);
    registry.register("practice", practiceB);
    registry.register("promotion_campaign", campaignId);
    registry.register("analytics_events_by_session", sessionId, { sessionId });
    registry.register("author_member", `${authorId}:${userId}`, {
      authorId,
      userId,
    });

    sqlFile(`
BEGIN;

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at)
VALUES (
  '${userId}',
  'authenticated',
  'authenticated',
  'promo-practice-change-${suffix}${FIXTURE_TEST_EMAIL_DOMAIN}',
  crypt('PromoPracticeChange2026!', gen_salt('bf')),
  now()
);

INSERT INTO public.authors (id, name, slug)
VALUES ('${authorId}', 'Promo Practice Author ${suffix}', 'promo-practice-author-${suffix}');

INSERT INTO public.author_members (author_id, user_id, role)
VALUES ('${authorId}', '${userId}', 'owner');

INSERT INTO public.practices (
  id, author_id, title, slug, status, format, is_free, is_catalog_listed,
  guest_access_enabled, price, cover_image
)
VALUES
  (
    '${practiceA}', '${authorId}', 'Practice A ${suffix}', 'promo-practice-a-${suffix}',
    'draft', 'Медитация', true, false, false, 0, '${markerJson}'::jsonb
  ),
  (
    '${practiceB}', '${authorId}', 'Practice B ${suffix}', 'promo-practice-b-${suffix}',
    'draft', 'Медитация', true, false, false, 0, '${markerJson}'::jsonb
  );

INSERT INTO public.promotion_campaigns (id, author_id, practice_id, name, campaign_key, status, created_by)
VALUES ('${campaignId}', '${authorId}', '${practiceA}', 'Campaign ${suffix}', '${campaignKey}', 'active', '${userId}');

INSERT INTO public.analytics_events (
  event_name,
  practice_id,
  anonymous_session_id,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_content,
  payload
) VALUES (
  'promo_practice_viewed',
  '${practiceA}',
  '${sessionId}',
  'telegram',
  'social',
  '${campaignKey}',
  'main_post',
  '${JSON.stringify(buildAnalyticsFixturePayload(FIXTURE_NAMESPACE, suffix)).replace(/'/g, "''")}'::jsonb
);

COMMIT;
`);

    const statsBefore = campaignStatsEventCount(campaignId);

    sqlFile(`
      UPDATE public.promotion_campaigns
      SET practice_id = '${practiceB}'
      WHERE id = '${campaignId}';
    `);

    const statsAfter = campaignStatsEventCount(campaignId);

    const rawEventsOnOldPractice = Number(
      sqlScalar(`
        SELECT COUNT(*)
        FROM public.analytics_events
        WHERE practice_id = '${practiceA}'
          AND utm_campaign = '${campaignKey}'
          AND event_name = 'promo_practice_viewed';
      `),
    );

    console.log(
      JSON.stringify(
        {
          scenario: "practice_id change with existing promo event",
          campaign_id: campaignId,
          practice_a: practiceA,
          practice_b: practiceB,
          campaign_key: campaignKey,
          stats_event_count_before: statsBefore,
          stats_event_count_after: statsAfter,
          raw_events_on_old_practice: rawEventsOnOldPractice,
          fixture_visibility: "draft/unlisted",
          conclusion:
            statsAfter === 0
              ? "stats disappear from campaign report after practice_id change"
              : "stats remain visible after practice_id change",
        },
        null,
        2,
      ),
    );

    assert(statsBefore === 1, `expected stats before = 1, got ${statsBefore}`);
    assert(
      statsAfter === 0 && rawEventsOnOldPractice === 1,
      `expected stats after = 0 with raw event preserved on old practice, got after=${statsAfter}, raw=${rawEventsOnOldPractice}`,
    );

    console.log(`${SCRIPT_NAME}: ok`);
  });
}

main().catch((error) => {
  console.error(`${SCRIPT_NAME}: failed`, error);
  process.exit(1);
});
