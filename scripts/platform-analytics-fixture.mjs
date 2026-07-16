#!/usr/bin/env node
/**
 * Insert controlled platform analytics fixture data for dev verification.
 * Campaign marker: analytics_dev_fixture
 *
 * Usage:
 *   node scripts/platform-analytics-fixture.mjs
 *   node scripts/platform-analytics-fixture.mjs --cleanup
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const FIXTURE_CAMPAIGN = "analytics_dev_fixture";

function loadEnv() {
  try {
    const raw = readFileSync("/var/www/audiolad/.env.local", "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const service = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const FIXTURE_SPEC = [
  { source: "max", visitors: 10, views: 6, starts: 4, completions: 2, signups: 3 },
  { source: "telegram", visitors: 8, views: 5, starts: 3, completions: 1, signups: 2 },
  { source: "vk", visitors: 5, views: 2, starts: 1, completions: 0, signups: 1 },
  { source: "direct", visitors: 4, views: 2, starts: 2, completions: 1, signups: 0 },
  { source: "other", visitors: 3, views: 1, starts: 0, completions: 0, signups: 0 },
];

async function getPracticeId() {
  const { data, error } = await service
    .from("practices")
    .select("id")
    .eq("status", "published")
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error("fixture_practice_missing");
  }

  return data.id;
}

async function getAudioItemId(practiceId) {
  const { data, error } = await service
    .from("audio_items")
    .select("id")
    .eq("practice_id", practiceId)
    .eq("status", "published")
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error("fixture_audio_missing");
  }

  return data.id;
}

async function cleanupFixtures() {
  const { data: sessions, error: sessionError } = await service
    .from("analytics_sessions")
    .select("id")
    .eq("utm_campaign", FIXTURE_CAMPAIGN);

  if (sessionError) {
    throw new Error(`fixture_cleanup_sessions_failed:${sessionError.message}`);
  }

  const sessionIds = (sessions ?? []).map((row) => row.id);

  if (sessionIds.length > 0) {
    const { error: eventsError } = await service
      .from("analytics_events")
      .delete()
      .in("session_id", sessionIds);

    if (eventsError) {
      throw new Error(`fixture_cleanup_events_failed:${eventsError.message}`);
    }
  }

  const { error: deleteSessionsError } = await service
    .from("analytics_sessions")
    .delete()
    .eq("utm_campaign", FIXTURE_CAMPAIGN);

  if (deleteSessionsError) {
    throw new Error(`fixture_cleanup_delete_sessions_failed:${deleteSessionsError.message}`);
  }

  console.log(`fixture_cleanup: removed ${sessionIds.length} sessions`);
}

async function insertFixtures() {
  const practiceId = await getPracticeId();
  const audioItemId = await getAudioItemId(practiceId);
  const baseTime = Date.now() - 3 * 24 * 60 * 60 * 1000;

  let sessionCount = 0;
  let eventCount = 0;

  for (const group of FIXTURE_SPEC) {
    for (let i = 0; i < group.visitors; i += 1) {
      const anonymousId = `fixture-${group.source}-${i}-${randomUUID()}`;
      const startedAt = new Date(baseTime + sessionCount * 60_000).toISOString();
      const sessionId = randomUUID();

      const { error: sessionError } = await service.from("analytics_sessions").insert({
        id: sessionId,
        anonymous_id: anonymousId,
        started_at: startedAt,
        last_seen_at: startedAt,
        utm_source: group.source,
        utm_medium: "social",
        utm_campaign: FIXTURE_CAMPAIGN,
        utm_content: "fixture",
        landing_path: "/",
        device_type: "desktop",
      });

      if (sessionError) {
        throw new Error(`fixture_session_insert_failed:${sessionError.message}`);
      }

      sessionCount += 1;

      const events = [{ event_name: "page_view", path: "/" }];

      if (i < group.views) {
        events.push({ event_name: "practice_view", path: `/practice/x/y`, practice_id: practiceId });
      }

      if (i < group.starts) {
        events.push({
          event_name: "audio_play_started",
          path: "/listen/x/y",
          practice_id: practiceId,
          track_id: audioItemId,
        });
      }

      if (i < group.completions) {
        events.push({
          event_name: "audio_completed",
          path: "/listen/x/y",
          practice_id: practiceId,
          track_id: audioItemId,
        });
      }

      if (i < group.signups) {
        events.push({ event_name: "signup_completed", path: "/auth/sign-up" });
      }

      for (const [eventIndex, event] of events.entries()) {
        const occurredAt = new Date(
          new Date(startedAt).getTime() + (eventIndex + 1) * 1000,
        ).toISOString();

        const { error: eventError } = await service.from("analytics_events").insert({
          session_id: sessionId,
          anonymous_session_id: anonymousId,
          event_name: event.event_name,
          path: event.path ?? null,
          practice_id: event.practice_id ?? null,
          track_id: event.track_id ?? null,
          occurred_at: occurredAt,
          payload: { fixture: true },
        });

        if (eventError) {
          throw new Error(`fixture_event_insert_failed:${eventError.message}`);
        }

        eventCount += 1;
      }

      // Extra noise: duplicate page_view + pause/play should not affect uniques in admin
      if (i === 0) {
        for (let duplicate = 0; duplicate < 2; duplicate += 1) {
          await service.from("analytics_events").insert({
            session_id: sessionId,
            anonymous_session_id: anonymousId,
            event_name: "page_view",
            path: "/catalog",
            occurred_at: new Date(new Date(startedAt).getTime() + 5000 + duplicate * 1000).toISOString(),
            payload: { fixture: true, duplicate: true },
          });
          eventCount += 1;
        }

        if (group.starts > 0) {
          await service.from("analytics_events").insert({
            session_id: sessionId,
            anonymous_session_id: anonymousId,
            event_name: "audio_play_started",
            path: "/listen/x/y",
            practice_id: practiceId,
            track_id: audioItemId,
            occurred_at: new Date(new Date(startedAt).getTime() + 7000).toISOString(),
            payload: { fixture: true, duplicate_play: true },
          });
          eventCount += 1;
        }
      }
    }
  }

  console.log(
    JSON.stringify({
      ok: true,
      campaign: FIXTURE_CAMPAIGN,
      sessions: sessionCount,
      events: eventCount,
    }),
  );
}

async function main() {
  const cleanup = process.argv.includes("--cleanup");

  if (cleanup) {
    await cleanupFixtures();
    return;
  }

  await cleanupFixtures();
  await insertFixtures();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
