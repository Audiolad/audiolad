#!/usr/bin/env node
/**
 * HTTP/API integration checks for platform analytics (no browser required).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";

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

const baseUrl = process.env.ANALYTICS_HTTP_BASE_URL ?? process.env.BASE_URL ?? "http://127.0.0.1:3001";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sql(query) {
  return execSync(
    `docker exec supabase-db psql -U postgres -d postgres -tAc ${JSON.stringify(query)}`,
    { encoding: "utf8" },
  ).trim();
}

async function post(path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let json = null;

  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  return { status: response.status, json, text };
}

async function testSessionLifecycle() {
  const anonymousId = randomUUID();

  const created = await post("/api/analytics/session", {
    anonymous_id: anonymousId,
    landing_path: "/",
    utm_source: "max",
    utm_medium: "social",
    utm_campaign: "analytics_dev_test",
    utm_content: "browser_e2e",
    device_type: "desktop",
  });

  assert(created.status === 200, `session create status ${created.status}`);
  const sessionId = created.json?.session_id;
  assert(sessionId, "session_id returned");

  const refreshed = await post("/api/analytics/session", {
    session_id: sessionId,
    anonymous_id: anonymousId,
    landing_path: "/catalog",
    utm_source: "telegram",
    utm_medium: "social",
    utm_campaign: "other",
    device_type: "desktop",
  });

  assert(refreshed.status === 200, "session refresh ok");
  assert(refreshed.json?.session_id === sessionId, "same session refreshed");

  const source = sql(
    `SELECT utm_source FROM public.analytics_sessions WHERE id='${sessionId}'`,
  );
  assert(source === "max", "first-touch utm preserved");

  const track = await post("/api/analytics/track", {
    session_id: sessionId,
    anonymous_id: anonymousId,
    event_name: "page_view",
    path: "/",
  });

  assert(track.status === 201, `track status ${track.status}`);

  const invalid = await post("/api/analytics/track", {
    session_id: sessionId,
    anonymous_id: anonymousId,
    event_name: "evil_event",
    path: "/",
  });

  assert(invalid.status === 400, "invalid event rejected");

  console.log("ok session lifecycle");
}

async function testDelayedSignupCompletion() {
  const service = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = `analytics-delayed-${Date.now()}@audiolad.ru`;
  const password = "DelayedSignupPass123!";

  const { data: createdUser, error: createError } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: "Delayed", last_name: "Signup" },
    });

  assert(!createError && createdUser.user?.id, `create user failed: ${createError?.message}`);
  const userId = createdUser.user.id;

  const anonymousId = randomUUID();
  const sessionId = sql(
    `SELECT public.upsert_analytics_session(NULL, '${anonymousId}', '/auth/sign-up', 'max', 'social', 'analytics_dev_test', 'email_confirm', NULL, 'desktop');`,
  );

  const anon = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: signInData, error: signInError } =
    await anon.auth.signInWithPassword({ email, password });

  assert(!signInError && signInData.session?.access_token, "sign in failed");

  const { data, error } = await anon.rpc("record_platform_signup_completed", {
    p_session_id: sessionId,
    p_anonymous_id: anonymousId,
  });

  assert(!error, `signup rpc failed: ${error?.message}`);
  assert(data?.recorded === true, "signup_completed recorded");

  const duplicate = await anon.rpc("record_platform_signup_completed", {
    p_session_id: sessionId,
    p_anonymous_id: anonymousId,
  });

  assert(duplicate.data?.recorded === false, "duplicate signup blocked");

  const count = Number(
    sql(
      `SELECT COUNT(*) FROM public.analytics_events WHERE event_name='signup_completed' AND user_id='${userId}';`,
    ),
  );
  assert(count === 1, "single signup_completed row");

  const linked = Number(
    sql(
      `SELECT COUNT(*) FROM public.analytics_events WHERE session_id='${sessionId}' AND user_id='${userId}';`,
    ),
  );
  assert(linked >= 1, "session events linked to user");

  const sessionSource = sql(
    `SELECT utm_source FROM public.analytics_sessions WHERE id='${sessionId}'`,
  );
  assert(sessionSource === "max", "signup session keeps max source");

  console.log("ok delayed signup completion");
}

async function main() {
  assert(url && anonKey && serviceKey, "env not configured");
  await testSessionLifecycle();
  await testDelayedSignupCompletion();
  console.log("platform-analytics-http-e2e: ok");
}

main().catch((error) => {
  console.error("platform-analytics-http-e2e failed:", error.message);
  process.exit(1);
});
