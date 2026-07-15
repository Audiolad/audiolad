#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const SINGLE_SLUG = "e2e-test-odinochnyy-audioprodukt";
const PROGRAM_SLUG = "e2e-test-programma-3-audio";
const PROGRAM_ID = "c6d62fce-06ef-47cb-bb74-544ba8064fca";
const PROGRAM_AUDIO = [
  "447ac56a-ed8e-4b72-8377-e6ebe209df1b",
  "d25e2b43-6df4-473e-894f-cab08eb95d08",
  "fac2e77b-e8eb-49f3-bf41-ff25c4fe1071",
];

function loadEnv() {
  return Object.fromEntries(
    readFileSync("/var/www/audiolad/.env.local", "utf8")
      .split("\n")
      .filter((line) => line && line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

async function getSession(env, email) {
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const pub = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error || !linkData?.properties?.hashed_token) {
    throw new Error(`session_failed:${email}`);
  }

  const { data, error: verifyError } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  if (verifyError || !data.session?.access_token) {
    throw new Error(`verify_failed:${email}`);
  }

  return data.session.access_token;
}

async function api(path, token, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { status: response.status, body };
}

async function main() {
  const env = loadEnv();
  const ownerToken = await getSession(env, "1@audiolad.ru");
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const results = [];
  const pass = (name) => results.push({ name, ok: true });
  const fail = (name, detail) => results.push({ name, ok: false, detail });

  const singleListen = await fetch(`${BASE}/listen/${SINGLE_SLUG}`, {
    headers: { Cookie: "" },
    redirect: "manual",
  });

  if ([200, 307, 308].includes(singleListen.status)) {
    pass("single_listen_page_reachable");
  } else {
    fail("single_listen_page_reachable", String(singleListen.status));
  }

  const programListen = await fetch(`${BASE}/listen/${PROGRAM_SLUG}`, {
    redirect: "manual",
  });

  if ([200, 307, 308].includes(programListen.status)) {
    pass("program_listen_page_reachable");
  } else {
    fail("program_listen_page_reachable", String(programListen.status));
  }

  const { data: singleItems } = await admin
    .from("audio_items")
    .select("id")
    .eq("practice_id", "dafda0a3-c2c1-4d8d-b5bf-686046bb862a")
    .order("position", { ascending: true })
    .limit(1);

  const singleAudioId = singleItems?.[0]?.id;

  if (singleAudioId) {
    const signed = await api(
      `/api/listen/${SINGLE_SLUG}/audio/${singleAudioId}`,
      ownerToken,
    );

    if (signed.status === 200 && signed.body?.url?.includes("/storage/")) {
      pass("single_signed_url");
    } else {
      fail("single_signed_url", `status=${signed.status}`);
    }
  } else {
    fail("single_signed_url", "no_audio_item");
  }

  for (const [index, audioId] of PROGRAM_AUDIO.entries()) {
    const signed = await api(
      `/api/listen/${PROGRAM_SLUG}/audio/${audioId}`,
      ownerToken,
    );

    if (signed.status === 200 && signed.body?.url) {
      pass(`program_signed_url_${index + 1}`);
    } else {
      fail(`program_signed_url_${index + 1}`, `status=${signed.status}`);
    }
  }

  const foreign = await api(
    `/api/listen/${PROGRAM_SLUG}/audio/00000000-0000-0000-0000-000000000000`,
    ownerToken,
  );

  if (foreign.status === 404) {
    pass("foreign_audio_id_rejected");
  } else {
    fail("foreign_audio_id_rejected", `status=${foreign.status}`);
  }

  const noAuth = await api(
    `/api/listen/${SINGLE_SLUG}/audio/${singleAudioId}`,
    null,
  );

  if (noAuth.status === 401) {
    pass("unsigned_user_rejected");
  } else {
    fail("unsigned_user_rejected", `status=${noAuth.status}`);
  }

  const progressSave = await api(`/api/listen/${PROGRAM_SLUG}/progress`, ownerToken, {
    method: "PUT",
    body: JSON.stringify({
      audio_item_id: PROGRAM_AUDIO[0],
      position_seconds: 42,
      completed: false,
    }),
  });

  if (progressSave.status === 200) {
    pass("progress_save");
  } else {
    fail("progress_save", `status=${progressSave.status}`);
  }

  const progressGet = await api(`/api/listen/${PROGRAM_SLUG}/progress`, ownerToken);

  if (
    progressGet.status === 200 &&
    progressGet.body?.progress?.some(
      (row) =>
        row.audioItemId === PROGRAM_AUDIO[0] && row.positionSeconds === 42,
    )
  ) {
    pass("progress_restore");
  } else {
    fail("progress_restore", JSON.stringify(progressGet.body));
  }

  const progressReset = await api(`/api/listen/${PROGRAM_SLUG}/progress`, ownerToken, {
    method: "DELETE",
  });

  if (progressReset.status === 200) {
    pass("progress_reset");
  } else {
    fail("progress_reset", `status=${progressReset.status}`);
  }

  const { data: singlePractice } = await admin
    .from("practices")
    .select("status, price")
    .eq("id", "dafda0a3-c2c1-4d8d-b5bf-686046bb862a")
    .maybeSingle();

  if (singlePractice?.status === "published") {
    pass("single_still_published");
  } else {
    fail("single_still_published", singlePractice?.status);
  }

  const { data: firstCourse } = await admin
    .from("practices")
    .select("price")
    .eq("slug", "first-audio-course")
    .maybeSingle();

  if (firstCourse?.price === 99) {
    pass("first_audio_course_price");
  } else {
    fail("first_audio_course_price", String(firstCourse?.price));
  }

  const { data: programPractice } = await admin
    .from("practices")
    .select("status")
    .eq("id", PROGRAM_ID)
    .maybeSingle();

  if (programPractice?.status === "published") {
    pass("multi_audio_publish_enabled");
  } else {
    const publishAllowed = await api(
      `/api/author/products/${PROGRAM_ID}/publish`,
      ownerToken,
      { method: "POST" },
    );

    if (publishAllowed.status === 200) {
      pass("multi_audio_publish_enabled");
    } else {
      fail(
        "multi_audio_publish_enabled",
        publishAllowed.body?.error ?? String(publishAllowed.status),
      );
    }
  }

  console.log("RESULTS:");
  for (const item of results) {
    console.log(
      `${item.ok ? "PASS" : "FAIL"} ${item.name}${item.detail ? ` (${item.detail})` : ""}`,
    );
  }

  if (results.some((item) => !item.ok)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
