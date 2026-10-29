/**
 * Post-deploy article recrawl step, with injectable side effects so the
 * failure → retry contract is testable without Supabase.
 *
 * Order: write a conservative manifest (every planned path keeps its
 * previous fingerprint) → enqueue → rewrite the manifest with only the
 * confirmed paths advanced. A crash or timeout at any point therefore leaves
 * a manifest that makes the next deploy plan the same URLs again.
 */
import { closeSync, copyFileSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  ARTICLE_RECRAWL_ENTITY_TYPE,
  ARTICLE_RECRAWL_MANIFEST_FILE,
  buildArticleRecrawlManifest,
  buildNextArticleRecrawlManifest,
  parseArticleRecrawlManifest,
  planArticleRecrawl,
  type ArticleRecrawlEntry,
  type ArticleRecrawlManifest,
} from "@/lib/seo/search-recrawl/articles";
import type {
  EnqueueSearchRecrawlInput,
  EnqueueSearchRecrawlResult,
  SearchRecrawlEngine,
} from "@/lib/seo/search-recrawl/memory";

export const ARTICLE_RECRAWL_ENGINES: readonly SearchRecrawlEngine[] = ["yandex", "indexnow"];

export type ArticleRecrawlStepDeps = {
  entries: ReadonlyArray<ArticleRecrawlEntry>;
  /** Returns false when Supabase env is missing; nothing is enqueued then. */
  prepareEnqueue: () => boolean;
  enqueue: (input: EnqueueSearchRecrawlInput) => Promise<EnqueueSearchRecrawlResult>;
  log: (event: string, fields?: Record<string, unknown>) => void;
  maxUpdates?: number;
};

export type ArticleRecrawlStepOptions = {
  releaseDir: string;
  previousDir: string | null;
  dryRun?: boolean;
};

export type ArticleRecrawlStepResult = {
  state: "seeded" | "dry_run" | "no_changes" | "enqueued" | "env_missing";
  queued: string[];
  failed: string[];
  deferred: string[];
};

function readManifest(dir: string | null): ArticleRecrawlManifest | null {
  if (!dir) {
    return null;
  }
  try {
    return parseArticleRecrawlManifest(readFileSync(path.join(dir, ARTICLE_RECRAWL_MANIFEST_FILE), "utf8"));
  } catch {
    return null;
  }
}

function writeManifest(dir: string, manifest: ArticleRecrawlManifest): void {
  const target = path.join(dir, ARTICLE_RECRAWL_MANIFEST_FILE);
  const temporary = `${target}.tmp-${process.pid}`;
  const fd = openSync(temporary, "wx");
  try {
    try {
      writeFileSync(fd, `${JSON.stringify(manifest, null, 2)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    try {
      copyFileSync(target, `${target}.prev`);
    } catch {
      // First run or backup failure: publishing the manifest must still proceed.
    }
    renameSync(temporary, target);
  } finally {
    try {
      rmSync(temporary, { force: true });
    } catch {
      // Best effort cleanup must not hide the original write/rename error.
    }
  }
}

function isQueued(result: EnqueueSearchRecrawlResult): boolean {
  return result.outcome === "inserted" || result.outcome === "deduped";
}

export async function runArticleRecrawlStep(
  options: ArticleRecrawlStepOptions,
  deps: ArticleRecrawlStepDeps,
): Promise<ArticleRecrawlStepResult> {
  const releaseDir = path.resolve(options.releaseDir);
  const previousDir = options.previousDir ? path.resolve(options.previousDir) : null;
  const dryRun = options.dryRun === true;
  const previous = previousDir && previousDir !== releaseDir ? readManifest(previousDir) : null;
  const plan = planArticleRecrawl(previous, deps.entries, deps.maxUpdates);

  if (plan.state === "seeded") {
    if (!dryRun) {
      writeManifest(releaseDir, buildArticleRecrawlManifest(deps.entries));
    }
    deps.log("seeded_no_previous_manifest", { total: plan.total, dryRun });
    return { state: dryRun ? "dry_run" : "seeded", queued: [], failed: [], deferred: [] };
  }

  const deferred = plan.deferred.map((change) => change.path);
  if (deferred.length > 0) {
    deps.log("updates_deferred", { deferred: deferred.length });
  }
  deps.log("plan", {
    total: plan.total,
    changes: plan.changes.map((change) => ({ url: change.url, reason: change.reason })),
    deferred: deferred.length,
    dryRun,
  });

  if (dryRun) {
    return { state: "dry_run", queued: [], failed: [], deferred };
  }

  const pending = new Set<string>([...deferred, ...plan.changes.map((change) => change.path)]);
  writeManifest(releaseDir, buildNextArticleRecrawlManifest(previous, deps.entries, pending));

  if (plan.changes.length === 0) {
    return { state: "no_changes", queued: [], failed: [], deferred };
  }

  if (!deps.prepareEnqueue()) {
    const failed = plan.changes.map((change) => change.path);
    deps.log("enqueue_skipped_env_missing", { retryNextDeploy: failed.length });
    return { state: "env_missing", queued: [], failed, deferred };
  }

  const queued: string[] = [];
  const failed: string[] = [];
  for (const change of plan.changes) {
    let ok = true;
    for (const engine of ARTICLE_RECRAWL_ENGINES) {
      try {
        const result = await deps.enqueue({
          url: change.url,
          engine,
          reason: change.reason,
          entityType: ARTICLE_RECRAWL_ENTITY_TYPE,
          // entity_id is a uuid column; article URLs are identified by url.
          entityId: null,
        });
        ok = ok && isQueued(result);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      queued.push(change.path);
      pending.delete(change.path);
    } else {
      failed.push(change.path);
    }
  }

  writeManifest(releaseDir, buildNextArticleRecrawlManifest(previous, deps.entries, pending));
  deps.log("done", { queued: queued.length, failed: failed.length, retryNextDeploy: failed });
  return { state: "enqueued", queued, failed, deferred };
}
