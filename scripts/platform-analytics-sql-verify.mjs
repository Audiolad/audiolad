#!/usr/bin/env node
/**
 * SQL-side aggregates for platform analytics fixture verification.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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

const service = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchFixtureSessions() {
  const { data, error } = await service
    .from("analytics_sessions")
    .select("id, anonymous_id, user_id, utm_source, started_at")
    .eq("utm_campaign", FIXTURE_CAMPAIGN);

  if (error) throw error;
  return data ?? [];
}

async function fetchFixtureEvents(sessionIds) {
  if (sessionIds.length === 0) return [];

  const { data, error } = await service
    .from("analytics_events")
    .select("session_id, event_name, user_id, anonymous_session_id, practice_id")
    .in("session_id", sessionIds);

  if (error) throw error;
  return data ?? [];
}

function aggregate(sessions, events) {
  const visitorSet = new Set(sessions.map((s) => s.user_id ?? s.anonymous_id));

  const countEvents = (name) => events.filter((e) => e.event_name === name).length;

  const playStarts = countEvents("audio_play_started");
  const completions = countEvents("audio_completed");
  const registrations = countEvents("signup_completed");

  const listenerSet = new Set();
  for (const event of events) {
    if (event.event_name === "audio_play_started") {
      const session = sessions.find((s) => s.id === event.session_id);
      listenerSet.add(session?.user_id ?? session?.anonymous_id ?? event.anonymous_session_id);
    }
  }

  return {
    visits: sessions.length,
    visitors: visitorSet.size,
    practiceViews: countEvents("practice_view"),
    playStarts,
    uniqueListeners: listenerSet.size,
    completions,
    registrations,
    registrationRate: visitorSet.size
      ? Math.round((registrations / visitorSet.size) * 100)
      : 0,
    completionRate: playStarts ? Math.round((completions / playStarts) * 100) : 0,
  };
}

async function main() {
  const sessions = await fetchFixtureSessions();
  const events = await fetchFixtureEvents(sessions.map((s) => s.id));
  const totals = aggregate(sessions, events);

  const bySource = {};
  for (const source of ["max", "telegram", "vk", "direct", "other"]) {
    const sourceSessions = sessions.filter((s) => s.utm_source === source);
    const sourceEvents = events.filter((e) =>
      sourceSessions.some((s) => s.id === e.session_id),
    );
    bySource[source] = aggregate(sourceSessions, sourceEvents);
  }

  console.log(JSON.stringify({ totals, bySource }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
