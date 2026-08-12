import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { listArticleDefinitions } from "../src/lib/seo/articles/index.ts";

type Article = {
  articleId: string | null;
  articleIdStatus: string;
  slug: string;
  productionUrl: string;
  status: string;
};

type Master = {
  articles: Article[];
  nextQueue: Array<{ slug?: string; articleId?: string | null }>;
  practiceForecast: Array<{
    practiceKey: string;
    remainingQueueDependencies: number;
    waitingArticleIds: string[];
  }>;
};

type Audit = {
  entries: Array<{
    slug: string;
    validationStatus: string;
  }>;
};

function readJson<T>(relativePath: string): T {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), relativePath), "utf8"),
  ) as T;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function unique(values: readonly string[]) {
  return new Set(values).size === values.length;
}

const master = readJson<Master>("docs/seo/operational/SEO_OPERATIONAL_MASTER.json");
const audit = readJson<Audit>("docs/seo/operational/VERIFIED_AUDIT.json");
const registrySlugs = listArticleDefinitions().map((article) => article.slug);
const registrySlugSet = new Set(registrySlugs);

assert(master.articles.length === registrySlugs.length, "article count matches registry");
assert(
  unique(master.articles.map((article) => article.slug)),
  "operational article slugs are unique",
);
assert(
  unique(master.articles.map((article) => article.productionUrl)),
  "operational production URLs are unique",
);
assert(
  master.articles.every((article) => registrySlugSet.has(article.slug)),
  "every operational article is in registry",
);
assert(
  registrySlugs.every((slug) =>
    master.articles.some((article) => article.slug === slug),
  ),
  "every registry article is in operational master",
);
assert(
  master.articles.every((article) => article.status === "PUBLISHED"),
  "published articles have published status",
);
assert(
  unique(
    master.articles
      .map((article) => article.articleId)
      .filter((articleId): articleId is string => articleId !== null),
  ),
  "confirmed article IDs are unique",
);
assert(
  master.articles
    .filter((article) => article.articleId === null)
    .every(
      (article) => article.articleIdStatus === "ID_PENDING_RECONCILIATION",
    ),
  "unknown article IDs are explicit",
);
assert(
  master.nextQueue.every((item) => !item.slug || !registrySlugSet.has(item.slug)),
  "next queue contains no published registry article",
);
assert(
  master.practiceForecast.every(
    (item) =>
      item.remainingQueueDependencies === item.waitingArticleIds.length &&
      item.waitingArticleIds.length === 0,
  ),
  "practice forecast has no published-article dependencies",
);
assert(audit.entries.length === registrySlugs.length, "audit covers registry");
assert(
  unique(audit.entries.map((entry) => entry.slug)),
  "audit slugs are unique",
);
assert(
  audit.entries.every(
    (entry) =>
      registrySlugSet.has(entry.slug) &&
      entry.validationStatus === "RECONSTRUCTED_FROM_PRODUCTION",
  ),
  "audit is explicit about reconstructed validation",
);

console.log(
  `seo-operational-master-unit: OK (${master.articles.length} articles, ${master.nextQueue.length} queued)`,
);
