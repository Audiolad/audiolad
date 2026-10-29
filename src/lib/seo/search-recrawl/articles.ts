/**
 * Deploy-time recrawl plan for editorial articles.
 *
 * Articles are static files in the repo, so they go live with a deploy, not
 * with a database write. After cutover the deploy writes a small manifest
 * (public path -> content fingerprint) into the release directory and
 * compares it with the previous release's manifest. New and changed article
 * URLs go into search_recrawl_queue, and the existing worker sends them to
 * Yandex Webmaster recrawl and IndexNow.
 *
 * Pure module: no env, no network, no database.
 */
import { createHash } from "node:crypto";

import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";
import { buildArticlePath } from "@/lib/seo/articles/paths";
import { listArticleDefinitions } from "@/lib/seo/articles/registry";
import { listStandaloneArticleDefinitions } from "@/lib/seo/articles/standalone";
import { buildListenPagePath } from "@/lib/seo/listens/paths";
import { listIndexableListenPageDefinitions } from "@/lib/seo/listens/registry";
import { articlePath, listVerticalArticles } from "@/lib/business/vertical-guides/registry";
import { listActiveVerticals } from "@/lib/business/vertical-guides/verticals";

export const ARTICLE_RECRAWL_MANIFEST_FILE = ".article-recrawl-manifest.json";
export const ARTICLE_RECRAWL_MANIFEST_VERSION = 1;
export const ARTICLE_RECRAWL_ENTITY_TYPE = "article";

/**
 * Upper bound for edited articles queued by one deploy. A refactor that
 * touches every article definition must not spend the whole Yandex recrawl
 * quota at once. The rest are deferred to later deploys, not dropped.
 * New articles are always queued.
 */
export const ARTICLE_RECRAWL_MAX_UPDATES_PER_DEPLOY = 20;

export const ARTICLE_RECRAWL_REASONS = {
  article_published: "article_published",
  article_updated: "article_updated",
} as const;

export type ArticleRecrawlReason =
  (typeof ARTICLE_RECRAWL_REASONS)[keyof typeof ARTICLE_RECRAWL_REASONS];

export type ArticleRecrawlKind = "article" | "standalone" | "vertical_guide" | "listen";

export type ArticleRecrawlEntry = {
  path: string;
  kind: ArticleRecrawlKind;
  fingerprint: string;
};

export type ArticleRecrawlManifest = {
  version: typeof ARTICLE_RECRAWL_MANIFEST_VERSION;
  entries: Record<string, string>;
};

export type ArticleRecrawlChange = {
  path: string;
  url: string;
  reason: ArticleRecrawlReason;
};

export type ArticleRecrawlPlan =
  | { state: "seeded"; total: number }
  | {
      state: "diff";
      total: number;
      /** Queued by this deploy. */
      changes: ArticleRecrawlChange[];
      /** Edits over the per-deploy cap, left for a later deploy. */
      deferred: ArticleRecrawlChange[];
    };

export function fingerprintArticleContent(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value) ?? "").digest("hex");
}

type ArticleRecrawlSources = {
  articles?: ReadonlyArray<{ slug: string }>;
  listens?: ReadonlyArray<{ slug: string; indexable?: boolean }>;
  standalone?: ReadonlyArray<{ path: string; indexable?: boolean }>;
  verticalGuides?: ReadonlyArray<{ path: string; content: unknown }>;
};

function defaultVerticalGuides(): Array<{ path: string; content: unknown }> {
  const guides: Array<{ path: string; content: unknown }> = [];
  for (const vertical of listActiveVerticals()) {
    for (const article of listVerticalArticles(vertical.id)) {
      guides.push({ path: articlePath(article), content: article });
    }
  }
  return guides;
}

/** Public articles of the current build: the same set the sitemap lists. */
export function listArticleRecrawlEntries(
  sources: ArticleRecrawlSources = {},
): ArticleRecrawlEntry[] {
  const articles = sources.articles ?? listArticleDefinitions();
  const standalone = sources.standalone ?? listStandaloneArticleDefinitions();
  const verticalGuides = sources.verticalGuides ?? defaultVerticalGuides();
  const listens = sources.listens ?? listIndexableListenPageDefinitions();
  const byPath = new Map<string, ArticleRecrawlEntry>();

  for (const article of articles) {
    const path = buildArticlePath(article.slug);
    byPath.set(path, { path, kind: "article", fingerprint: fingerprintArticleContent(article) });
  }

  for (const article of standalone) {
    if (article.indexable === false) {
      continue;
    }
    byPath.set(article.path, {
      path: article.path,
      kind: "standalone",
      fingerprint: fingerprintArticleContent(article),
    });
  }

  for (const page of listens) {
    if (page.indexable === false) {
      continue;
    }
    const path = buildListenPagePath(page.slug);
    byPath.set(path, { path, kind: "listen", fingerprint: fingerprintArticleContent(page) });
  }

  for (const guide of verticalGuides) {
    byPath.set(guide.path, {
      path: guide.path,
      kind: "vertical_guide",
      fingerprint: fingerprintArticleContent(guide.content),
    });
  }

  return [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function buildArticleRecrawlManifest(
  entries: ReadonlyArray<ArticleRecrawlEntry>,
): ArticleRecrawlManifest {
  const map: Record<string, string> = {};
  for (const entry of entries) {
    map[entry.path] = entry.fingerprint;
  }
  return { version: ARTICLE_RECRAWL_MANIFEST_VERSION, entries: map };
}

/** Returns null for a missing, foreign or damaged manifest. */
export function parseArticleRecrawlManifest(raw: string | null | undefined): ArticleRecrawlManifest | null {
  if (!raw?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { version?: unknown; entries?: unknown };
    if (
      parsed?.version !== ARTICLE_RECRAWL_MANIFEST_VERSION ||
      !parsed.entries ||
      typeof parsed.entries !== "object" ||
      Array.isArray(parsed.entries)
    ) {
      return null;
    }

    const entries: Record<string, string> = {};
    for (const [path, fingerprint] of Object.entries(parsed.entries as Record<string, unknown>)) {
      if (path.startsWith("/") && typeof fingerprint === "string" && fingerprint) {
        entries[path] = fingerprint;
      }
    }
    return { version: ARTICLE_RECRAWL_MANIFEST_VERSION, entries };
  } catch {
    return null;
  }
}

export function buildArticleRecrawlUrl(path: string): string {
  return `${PRODUCTION_APP_ORIGIN}${path}`;
}

/**
 * Without a previous manifest (first deploy with this feature, or a rollback
 * to an older release) nothing is queued: older articles are not resent.
 */
export function planArticleRecrawl(
  previous: ArticleRecrawlManifest | null,
  current: ReadonlyArray<ArticleRecrawlEntry>,
  maxUpdates: number = ARTICLE_RECRAWL_MAX_UPDATES_PER_DEPLOY,
): ArticleRecrawlPlan {
  if (!previous) {
    return { state: "seeded", total: current.length };
  }

  const published: ArticleRecrawlChange[] = [];
  const updated: ArticleRecrawlChange[] = [];

  for (const entry of current) {
    const before = previous.entries[entry.path];
    if (before === entry.fingerprint) {
      continue;
    }
    const change: ArticleRecrawlChange = {
      path: entry.path,
      url: buildArticleRecrawlUrl(entry.path),
      reason: before === undefined
        ? ARTICLE_RECRAWL_REASONS.article_published
        : ARTICLE_RECRAWL_REASONS.article_updated,
    };
    (before === undefined ? published : updated).push(change);
  }

  const limit = Math.max(0, maxUpdates);

  return {
    state: "diff",
    total: current.length,
    changes: [...published, ...updated.slice(0, limit)],
    deferred: updated.slice(limit),
  };
}

/**
 * Manifest to store in the new release. A path that was not confirmed as
 * queued (enqueue failed, env missing, deferred by the cap, or not tried yet)
 * keeps its previous fingerprint, or stays out when it is new, so the next
 * deploy plans it again.
 */
export function buildNextArticleRecrawlManifest(
  previous: ArticleRecrawlManifest | null,
  current: ReadonlyArray<ArticleRecrawlEntry>,
  pending: ReadonlySet<string>,
): ArticleRecrawlManifest {
  const entries: Record<string, string> = {};
  for (const entry of current) {
    if (!pending.has(entry.path)) {
      entries[entry.path] = entry.fingerprint;
      continue;
    }
    const before = previous?.entries[entry.path];
    if (before !== undefined) {
      entries[entry.path] = before;
    }
  }
  return { version: ARTICLE_RECRAWL_MANIFEST_VERSION, entries };
}
