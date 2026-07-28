#!/usr/bin/env node
/**
 * IndexNow submit CLI — dry-run by default.
 *
 * Usage:
 *   npx tsx scripts/indexnow-submit.mjs [--url URL]...
 *   npx tsx scripts/indexnow-submit.mjs --from-sitemap [--articles] [--topics]
 *   npx tsx scripts/indexnow-submit.mjs --live ...   # requires all production gates
 *
 * Never auto-invoked from deploy. Live submit is explicit and gated.
 */
import { getIndexNowConfig } from "../src/lib/seo/indexnow/config.ts";
import {
  buildIndexNowPayload,
  redactIndexNowPayload,
} from "../src/lib/seo/indexnow/client.ts";
import { notifyIndexNowUrls } from "../src/lib/seo/indexnow/notify.ts";
import { normalizeIndexNowUrls } from "../src/lib/seo/indexnow/urls.ts";

function printHelp() {
  console.log(`IndexNow CLI (dry-run by default)

Articles and topic hubs are code-first (appear after deploy). They are NOT
wired to runtime hooks — submit them explicitly via --url (repeatable).

Options:
  --url <url>          Add one URL or path (repeatable; articles/hubs/manual)
  --from-sitemap       Load URLs from https://audiolad.ru/sitemap.xml
  --articles           With --from-sitemap: only /articles/*
  --topics             With --from-sitemap: only /topics/*
  --live               Attempt real submit (requires INDEXNOW_ENABLED + key + prod indexing gate)
  --help               Show help

Examples:
  npm run indexnow:dry-run -- --url https://audiolad.ru/articles/kak-razvit-lyubov-k-sebe
  npm run indexnow:dry-run -- --url /articles/a --url /topics/b
  npm run indexnow:dry-run -- --from-sitemap --articles
`);
}

function parseArgs(argv) {
  const urls = [];
  let fromSitemap = false;
  let articlesOnly = false;
  let topicsOnly = false;
  let live = false;
  let help = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--live") {
      live = true;
      continue;
    }

    if (arg === "--from-sitemap") {
      fromSitemap = true;
      continue;
    }

    if (arg === "--articles") {
      articlesOnly = true;
      continue;
    }

    if (arg === "--topics") {
      topicsOnly = true;
      continue;
    }

    if (arg === "--url") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--url requires a value");
      }
      urls.push(value);
      i += 1;
      continue;
    }

    if (arg.startsWith("--url=")) {
      urls.push(arg.slice("--url=".length));
      continue;
    }

    // Positional URL/path
    if (!arg.startsWith("-")) {
      urls.push(arg);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { urls, fromSitemap, articlesOnly, topicsOnly, live, help };
}

async function loadSitemapUrls() {
  const response = await fetch("https://audiolad.ru/sitemap.xml", {
    headers: { Accept: "application/xml,text/xml,*/*" },
  });

  if (!response.ok) {
    throw new Error(`sitemap fetch failed: HTTP ${response.status}`);
  }

  const xml = await response.text();
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  return matches.map((match) => match[1].trim());
}

function filterSitemapUrls(urls, { articlesOnly, topicsOnly }) {
  if (!articlesOnly && !topicsOnly) {
    return urls;
  }

  return urls.filter((url) => {
    try {
      const path = new URL(url).pathname;
      if (articlesOnly && path.startsWith("/articles/")) return true;
      if (topicsOnly && path.startsWith("/topics/")) return true;
      return false;
    } catch {
      return false;
    }
  });
}

function assertNoKeyLeak(text) {
  const key = process.env.INDEXNOW_KEY?.trim();
  if (key && key.length >= 8 && text.includes(key)) {
    throw new Error("refusing to print output that contains INDEXNOW_KEY");
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  let candidates = [...parsed.urls];

  if (parsed.fromSitemap) {
    const sitemapUrls = await loadSitemapUrls();
    candidates.push(
      ...filterSitemapUrls(sitemapUrls, {
        articlesOnly: parsed.articlesOnly,
        topicsOnly: parsed.topicsOnly,
      }),
    );
  }

  if (candidates.length === 0) {
    printHelp();
    console.error("\nNo URLs provided.");
    process.exit(1);
  }

  const { accepted, rejected } = normalizeIndexNowUrls(candidates);
  const config = getIndexNowConfig();

  const report = {
    mode: parsed.live ? "live" : "dry-run",
    gates: {
      INDEXNOW_ENABLED: config.enabledFlag,
      keyConfigured: config.keyValid,
      indexingEnabled: config.indexingEnabled,
      originIsProduction: config.originIsProduction,
      canSubmit: config.canSubmit,
    },
    accepted,
    rejected: rejected.map((item) => ({
      input: item.input,
      reason: item.reason,
    })),
    redactedPayload: accepted.length
      ? config.keyValid && config.key
        ? redactIndexNowPayload(buildIndexNowPayload(config.key, accepted))
        : {
            host: config.host,
            keyLocation: config.keyLocation
              ? "https://audiolad.ru/<redacted>.txt"
              : "(key not configured)",
            urlList: accepted,
            urlCount: accepted.length,
          }
      : null,
  };

  const json = JSON.stringify(report, null, 2);
  assertNoKeyLeak(json);
  console.log(json);

  if (!parsed.live) {
    console.error(
      `\nDry-run only. Accepted ${accepted.length}, rejected ${rejected.length}. No network submit.`,
    );
    process.exit(0);
  }

  if (!config.canSubmit) {
    console.error(
      "\n--live requested but gates are not satisfied. No submit performed.",
    );
    process.exit(2);
  }

  const result = await notifyIndexNowUrls(accepted, "cli_live", {
    dryRun: false,
  });

  const liveReport = {
    status: result.status,
    batchResults: result.batchResults.map((batch) => ({
      urlCount: batch.urlCount,
      urls: batch.urls,
      http: {
        ok: batch.http.ok,
        status: batch.http.status,
        retried: batch.http.retried,
        errorCode: batch.http.errorCode ?? null,
      },
    })),
  };

  const liveJson = JSON.stringify(liveReport, null, 2);
  assertNoKeyLeak(liveJson);
  console.log(liveJson);

  process.exit(result.status === "submitted" ? 0 : 3);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
