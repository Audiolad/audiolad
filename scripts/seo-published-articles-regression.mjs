#!/usr/bin/env node
/**
 * Regression guard: every path in deploy/seo-published-article-urls.baseline.json
 * must return HTTP 200 on the smoke base URL.
 *
 * Run before cutover (candidate) and after cutover (public).
 *
 * Env:
 *   AUDIOLAD_SMOKE_BASE_URL — default https://audiolad.ru
 *   AUDIOLAD_SEO_BASELINE_PATH — optional override for baseline JSON
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const BASE = (process.env.AUDIOLAD_SMOKE_BASE_URL ?? "https://audiolad.ru").replace(
  /\/$/,
  "",
);
const BASELINE_PATH =
  process.env.AUDIOLAD_SEO_BASELINE_PATH ??
  join(ROOT, "deploy/seo-published-article-urls.baseline.json");
const TIMEOUT_MS = Number(process.env.AUDIOLAD_SMOKE_TIMEOUT_MS ?? 30_000);

function loadPaths() {
  const raw = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const paths = Array.isArray(raw.paths) ? raw.paths : [];
  if (paths.length === 0) {
    throw new Error(`Baseline has no paths: ${BASELINE_PATH}`);
  }
  return paths;
}

async function checkPath(path) {
  const url = `${BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "text/html" },
    });
    return { path, url, status: response.status, ok: response.status === 200 };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const paths = loadPaths();
  const results = [];
  for (const path of paths) {
    results.push(await checkPath(path));
  }
  const failed = results.filter((item) => !item.ok);
  console.log(
    JSON.stringify(
      {
        base: BASE,
        baseline: BASELINE_PATH,
        checked: results.length,
        failed: failed.length,
        results,
      },
      null,
      2,
    ),
  );
  if (failed.length > 0) {
    console.error(
      `seo-published-articles-regression: FAIL ${failed.length}/${results.length}`,
    );
    for (const item of failed) {
      console.error(`  ${item.status} ${item.path}`);
    }
    process.exit(1);
  }
  console.error(
    `seo-published-articles-regression: PASS ${results.length}/${results.length}`,
  );
}

main().catch((error) => {
  console.error(
    "seo-published-articles-regression:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
