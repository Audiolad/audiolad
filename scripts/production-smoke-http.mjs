#!/usr/bin/env node
/**
 * Lightweight HTTP smoke for deploy pipeline (no browser).
 *
 * Env:
 *   AUDIOLAD_SMOKE_BASE_URL — default https://audiolad.ru
 */
const BASE = (process.env.AUDIOLAD_SMOKE_BASE_URL ?? "https://audiolad.ru").replace(
  /\/$/,
  "",
);
const TIMEOUT_MS = Number(process.env.AUDIOLAD_SMOKE_TIMEOUT_MS ?? 30_000);

const results = [];
const pass = (name) => results.push({ name, ok: true });
const fail = (name, detail) => results.push({ name, ok: false, detail });

async function fetchText(path) {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/html,application/json" },
    });
    const body = await response.text();
    return { url, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

async function checkRoute(name, path, { status = 200, includes = [] } = {}) {
  const { url, status: got, body } = await fetchText(path);
  if (got !== status) {
    fail(name, `expected HTTP ${status}, got ${got} for ${url}`);
    return;
  }
  for (const needle of includes) {
    if (!body.includes(needle)) {
      fail(name, `body missing "${needle}" at ${url}`);
      return;
    }
  }
  pass(name);
}

async function main() {
  await checkRoute("health_build", "/api/health/build", { status: 200 });
  await checkRoute("guest_home", "/", {
    status: 200,
    includes: ["Аудио, которое помогает вернуться к себе"],
  });
  await checkRoute("catalog", "/catalog", { status: 200 });
  await checkRoute("privacy", "/privacy", { status: 200 });
  pass("auth_scenario_skipped_http");

  const failed = results.filter((item) => !item.ok);
  console.log(JSON.stringify({ base: BASE, mode: "http", results }, null, 2));

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  fail("smoke_http", error instanceof Error ? error.message : String(error));
  console.log(JSON.stringify({ base: BASE, mode: "http", results }, null, 2));
  process.exit(1);
});
