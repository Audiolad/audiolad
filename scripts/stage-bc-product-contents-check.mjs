#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const SINGLE_SLUG = "e2e-test-odinochnyy-audioprodukt";
const PROGRAM_SLUG = "e2e-test-programma-3-audio";
const PROGRAM_ID = "c6d62fce-06ef-47cb-bb74-544ba8064fca";
const PROGRAM_AUDIO_ORDER = [
  { position: 1, title: "Третья чакра" },
  { position: 2, title: "Первая чакра" },
  { position: 3, title: "Вторая чакра" },
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeDurationSeconds(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.floor(value);
}

function formatAudioDuration(seconds) {
  const normalized = normalizeDurationSeconds(seconds);

  if (normalized === null) {
    return null;
  }

  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const secs = normalized % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatProductDuration(totalSeconds, fallbackMinutes) {
  const normalized = normalizeDurationSeconds(totalSeconds);

  let totalMinutes = null;

  if (normalized !== null) {
    totalMinutes = Math.ceil(normalized / 60);
  } else if (
    typeof fallbackMinutes === "number" &&
    Number.isFinite(fallbackMinutes) &&
    fallbackMinutes > 0
  ) {
    totalMinutes = Math.ceil(fallbackMinutes);
  }

  if (totalMinutes === null) {
    return null;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    if (minutes > 0) {
      return `${hours} ч ${minutes} мин`;
    }

    return `${hours} ч`;
  }

  return `${totalMinutes} мин`;
}

function formatProductMeta(input) {
  const trimmedFormat =
    typeof input.format === "string" ? input.format.trim() : "";
  const duration = formatProductDuration(
    input.totalDurationSeconds,
    input.durationMinutesFallback,
  );

  let productPart = null;

  if (input.audioCount >= 2) {
    const parts = [`${input.audioCount} аудио`];

    if (duration) {
      parts.push(duration);
    }

    productPart = parts.join(" · ");
  } else if (duration) {
    productPart = duration;
  }

  if (trimmedFormat && productPart) {
    return `${trimmedFormat} · ${productPart}`;
  }

  if (trimmedFormat) {
    return trimmedFormat;
  }

  return productPart;
}

function testDurationHelpers() {
  assert(formatAudioDuration(null) === null, "null track duration");
  assert(formatAudioDuration(0) === null, "zero track duration");
  assert(formatAudioDuration(522) === "08:42", "short track duration");
  assert(formatAudioDuration(4355) === "1:12:35", "long track duration");

  assert(formatProductDuration(null, null) === null, "null product duration");
  assert(formatProductDuration(480) === "8 мин", "8 minutes product");
  assert(formatProductDuration(1740) === "29 мин", "29 minutes product");
  assert(formatProductDuration(3900) === "1 ч 5 мин", "1h5m product");
  assert(formatProductDuration(8400) === "2 ч 20 мин", "2h20m product");
  assert(formatProductDuration(1690) === "29 мин", "ceil seconds to minutes");
  assert(formatProductDuration(0, 12) === "12 мин", "fallback minutes");

  assert(
    formatProductMeta({
      format: "Медитация",
      audioCount: 1,
      totalDurationSeconds: 720,
    }) === "Медитация · 12 мин",
    "single product meta",
  );

  const multiMeta = formatProductMeta({
    format: "Программа",
    audioCount: 3,
    totalDurationSeconds: 1740,
  });

  assert(
    multiMeta === "Программа · 3 аудио · 29 мин",
    `multi product meta (got "${multiMeta}")`,
  );
}

async function getAuthorClient(env) {
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
    email: "1@audiolad.ru",
  });

  if (error || !linkData?.properties?.hashed_token) {
    throw new Error(`session_failed:${error?.message ?? "no_token"}`);
  }

  const { data, error: verifyError } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  if (verifyError || !data.session) {
    throw new Error(`verify_failed:${verifyError?.message ?? "no_session"}`);
  }

  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      },
    },
  );
}

async function main() {
  testDurationHelpers();

  const env = loadEnv();
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const authorClient = await getAuthorClient(env);

  const { data: programPractice } = await admin
    .from("practices")
    .select("slug, status")
    .eq("id", PROGRAM_ID)
    .maybeSingle();

  assert(programPractice?.status === "published", "program is published");
  assert(programPractice?.slug === PROGRAM_SLUG, "program slug");

  const { data: audioItems } = await admin
    .from("audio_items")
    .select("title, position, duration_seconds")
    .eq("practice_id", PROGRAM_ID)
    .order("position", { ascending: true });

  assert(audioItems?.length === 3, "program has 3 audio items");

  for (const [index, expected] of PROGRAM_AUDIO_ORDER.entries()) {
    assert(audioItems[index]?.position === expected.position, `position ${expected.position}`);
    assert(audioItems[index]?.title === expected.title, `title ${expected.title}`);
  }

  const totalSeconds = audioItems.reduce(
    (sum, item) => sum + (item.duration_seconds ?? 0),
    0,
  );
  assert(totalSeconds > 0, "program total duration from seconds");

  const { data: anonProgram } = await createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
    .from("practices")
    .select("id")
    .eq("slug", PROGRAM_SLUG)
    .maybeSingle();

  assert(anonProgram?.id === PROGRAM_ID, "published program visible to public");

  const { data: authorProgram } = await authorClient
    .from("practices")
    .select("id, status")
    .eq("slug", PROGRAM_SLUG)
    .maybeSingle();

  assert(authorProgram?.id === PROGRAM_ID, "author can read published program");

  const { data: authorAudioItems } = await authorClient
    .from("audio_items")
    .select("id, title, position, duration_seconds")
    .eq("practice_id", PROGRAM_ID)
    .order("position", { ascending: true });

  assert(authorAudioItems?.length === 3, "author can read published audio items");

  const { data: singlePractice } = await admin
    .from("practices")
    .select("slug, status")
    .eq("slug", SINGLE_SLUG)
    .maybeSingle();

  assert(singlePractice?.status === "published", "single E2E product published");

  const { data: firstCourse } = await admin
    .from("practices")
    .select("price")
    .eq("slug", "first-audio-course")
    .maybeSingle();

  assert(firstCourse?.price === 99, "first-audio-course remains 99 RUB");

  const catalog = await fetch(`${BASE}/catalog`, { redirect: "manual" });
  assert([200, 307, 308].includes(catalog.status), "catalog reachable");

  const singlePracticePage = await fetch(`${BASE}/practice/${SINGLE_SLUG}`, {
    redirect: "manual",
  });
  assert([200, 307, 308].includes(singlePracticePage.status), "single practice page reachable");

  const singleHtml = await singlePracticePage.text();
  assert(!singleHtml.includes("Содержание"), "single product has no contents block");

  const programPracticePage = await fetch(`${BASE}/practice/${PROGRAM_SLUG}`, {
    redirect: "manual",
  });

  assert(
    [200, 307, 308].includes(programPracticePage.status),
    "published program visible on public practice page",
  );

  const programHtml = await programPracticePage.text();
  assert(programHtml.includes("Содержание"), "program shows contents block");
  assert(programHtml.includes("3 аудио"), "program shows audio count meta");

  console.log("stage-bc checks passed");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
