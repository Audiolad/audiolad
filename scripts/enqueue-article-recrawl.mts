/**
 * One-shot post-deploy step: queue new and changed article URLs for
 * Yandex Webmaster recrawl and IndexNow.
 *
 *   tsx scripts/enqueue-article-recrawl.mts --release-dir <dir> [--previous-dir <dir>] [--dry-run]
 *
 * deploy.sh runs it after cutover with cwd = the new release. The manifest
 * in the release only advances for URLs that were actually queued, so a
 * failed or interrupted run is retried by the next deploy. The search
 * recrawl worker delivers the rows; this script never calls Yandex or
 * IndexNow itself and logs no secret values.
 *
 * Exit codes: 0 ok (including nothing to do), 2 some URLs not queued (env
 * missing or enqueue failed), 1 unexpected error. deploy.sh treats any
 * non-zero code as a warning only.
 */
import path from "node:path";

import { runArticleRecrawlStep } from "../src/lib/seo/search-recrawl/article-deploy-step";
import { listArticleRecrawlEntries } from "../src/lib/seo/search-recrawl/articles";
import { enqueueSearchRecrawl } from "../src/lib/seo/search-recrawl/enqueue";
import {
  bootstrapSearchRecrawlWorkerEnv,
  redactSearchRecrawlSecrets,
} from "../src/lib/seo/search-recrawl/worker-env";

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

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const releaseDir = path.resolve(readArg(args, "--release-dir") ?? process.cwd());

  const result = await runArticleRecrawlStep(
    {
      releaseDir,
      previousDir: readArg(args, "--previous-dir"),
      dryRun: args.includes("--dry-run"),
    },
    {
      entries: listArticleRecrawlEntries(),
      prepareEnqueue: () => {
        const presence = bootstrapSearchRecrawlWorkerEnv({ dir: releaseDir });
        if (!presence.hasSupabaseUrl || !presence.hasServiceRoleKey) {
          log("env_missing", {
            hasSupabaseUrl: presence.hasSupabaseUrl,
            hasServiceRoleKey: presence.hasServiceRoleKey,
          });
          return false;
        }
        return true;
      },
      enqueue: enqueueSearchRecrawl,
      log,
    },
  );

  return result.failed.length > 0 ? 2 : 0;
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
