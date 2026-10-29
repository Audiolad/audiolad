/**
 * One-shot post-deploy step: queue new and changed article URLs for
 * Yandex Webmaster recrawl and IndexNow.
 *
 *   tsx scripts/enqueue-article-recrawl.mts --release-dir <dir> [--previous-dir <dir>] [--dry-run]
 *
 * deploy.sh runs it after cutover with cwd = the new release. It writes the
 * article manifest into the release first, then queues the diff against the
 * previous release's manifest. The search recrawl worker delivers the rows.
 * It never sends to Yandex or IndexNow itself, and logs no secret values.
 * Exit code is 0 unless arguments are wrong or the manifest cannot be written;
 * deploy.sh treats any failure as a warning.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  ARTICLE_RECRAWL_ENTITY_TYPE,
  ARTICLE_RECRAWL_MANIFEST_FILE,
  buildArticleRecrawlManifest,
  listArticleRecrawlEntries,
  parseArticleRecrawlManifest,
  planArticleRecrawl,
} from "../src/lib/seo/search-recrawl/articles";
import { enqueueSearchRecrawl } from "../src/lib/seo/search-recrawl/enqueue";
import type { SearchRecrawlEngine } from "../src/lib/seo/search-recrawl/memory";
import {
  bootstrapSearchRecrawlWorkerEnv,
  redactSearchRecrawlSecrets,
} from "../src/lib/seo/search-recrawl/worker-env";

const ENGINES: SearchRecrawlEngine[] = ["yandex", "indexnow"];

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.info(`[article-recrawl] ${new Date().toISOString()} ${event}`, JSON.stringify(fields));
}

function readArg(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) {
    return null;
  }
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

function readManifest(dir: string | null) {
  if (!dir) {
    return null;
  }
  try {
    return parseArticleRecrawlManifest(readFileSync(path.join(dir, ARTICLE_RECRAWL_MANIFEST_FILE), "utf8"));
  } catch {
    return null;
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const releaseDir = path.resolve(readArg(args, "--release-dir") ?? process.cwd());
  const previousArg = readArg(args, "--previous-dir");
  const previousDir = previousArg ? path.resolve(previousArg) : null;
  const dryRun = args.includes("--dry-run");

  const entries = listArticleRecrawlEntries();
  const manifestPath = path.join(releaseDir, ARTICLE_RECRAWL_MANIFEST_FILE);

  if (!dryRun) {
    writeFileSync(manifestPath, `${JSON.stringify(buildArticleRecrawlManifest(entries), null, 2)}\n`);
  }

  const samePrevious = previousDir !== null && previousDir === releaseDir;
  const plan = planArticleRecrawl(samePrevious ? null : readManifest(previousDir), entries);

  if (plan.state === "seeded") {
    log("seeded_no_previous_manifest", { total: plan.total, dryRun });
    return 0;
  }

  if (plan.skippedUpdates > 0) {
    log("mass_update_skipped", { skippedUpdates: plan.skippedUpdates });
  }

  log("plan", {
    total: plan.total,
    changes: plan.changes.map((change) => ({ url: change.url, reason: change.reason })),
    dryRun,
  });

  if (dryRun || plan.changes.length === 0) {
    return 0;
  }

  const presence = bootstrapSearchRecrawlWorkerEnv({ dir: releaseDir });
  if (!presence.hasSupabaseUrl || !presence.hasServiceRoleKey) {
    log("enqueue_skipped_env_missing", {
      hasSupabaseUrl: presence.hasSupabaseUrl,
      hasServiceRoleKey: presence.hasServiceRoleKey,
    });
    return 0;
  }

  let failed = 0;
  for (const change of plan.changes) {
    for (const engine of ENGINES) {
      const result = await enqueueSearchRecrawl({
        url: change.url,
        engine,
        reason: change.reason,
        entityType: ARTICLE_RECRAWL_ENTITY_TYPE,
        // entity_id is a uuid column; article URLs are identified by url.
        entityId: null,
      });
      if (result.outcome !== "inserted" && result.outcome !== "deduped") {
        failed += 1;
      }
    }
  }

  log("done", { queued: plan.changes.length * ENGINES.length - failed, failed });
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    const raw = error instanceof Error ? error.message : "unknown_error";
    console.error("[article-recrawl] failed", redactSearchRecrawlSecrets(raw));
    process.exitCode = 1;
  });
