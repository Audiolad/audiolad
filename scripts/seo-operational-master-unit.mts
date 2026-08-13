import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { listArticleDefinitions } from "../src/lib/seo/articles/index";

type Article = {
  articleId: string | null;
  articleIdStatus: string;
  slug: string;
  productionUrl: string | null;
  status: string;
};

type Master = {
  articles: Article[];
  nextQueue: Array<{
    position: number;
    slug: string;
    articleId: string;
    status: string;
  }>;
  practiceForecast: Array<{
    practiceKey: string;
    remainingQueueDependencies: number;
    waitingArticleIds: string[];
  }>;
};

type Audit = {
  entries: Array<{
    articleId: string | null;
    slug: string;
    status: string;
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
const publishedArticles = master.articles.filter(
  (article) => article.status === "PUBLISHED",
);
const plannedArticles = master.articles.filter(
  (article) => article.status === "PLANNED",
);
const registryOperationalArticles = master.articles.filter((article) =>
  registrySlugSet.has(article.slug),
);
const articleById = new Map(
  master.articles
    .filter(
      (article): article is Article & { articleId: string } =>
        article.articleId !== null,
    )
    .map((article) => [article.articleId, article]),
);

assert(
  unique(master.articles.map((article) => article.slug)),
  "operational article slugs are unique",
);
assert(
  unique(
    publishedArticles.map((article) => {
      assert(article.productionUrl, "published article has production URL");
      return article.productionUrl;
    }),
  ),
  "published production URLs are unique",
);
assert(
  registryOperationalArticles.length === registrySlugs.length,
  "registered article count matches operational master",
);
assert(
  registryOperationalArticles.every(
    (article) => article.status === "PUBLISHED" || article.status === "PLANNED",
  ),
  "registered operational articles have publication state",
);
assert(
  registrySlugs.every((slug) =>
    registryOperationalArticles.some((article) => article.slug === slug),
  ),
  "every registry article is in operational master",
);
assert(
  plannedArticles.every((article) => article.productionUrl === null),
  "planned articles have no production URL",
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
  master.nextQueue.every((item) => {
    const article = articleById.get(item.articleId);
    return article?.slug === item.slug && article.status !== "PUBLISHED";
  }),
  "next queue contains no published operational article",
);
assert(
  unique(master.nextQueue.map((item) => String(item.position))),
  "next queue positions are unique",
);
assert(
  master.nextQueue.every((item) => {
    const article = articleById.get(item.articleId);
    return (
      article?.slug === item.slug &&
      article.status === "PLANNED" &&
      item.status === "PLANNED"
    );
  }),
  "next queue references planned operational articles",
);
assert(
  master.practiceForecast.every(
    (item) =>
      item.remainingQueueDependencies === item.waitingArticleIds.length &&
      item.waitingArticleIds.every(
        (articleId) => articleById.get(articleId)?.status === "PLANNED",
      ),
  ),
  "practice forecast has only planned-article dependencies",
);
assert(audit.entries.length === master.articles.length, "audit covers master");
assert(
  unique(audit.entries.map((entry) => entry.slug)),
  "audit slugs are unique",
);
assert(
  audit.entries.every(
    (entry) =>
      master.articles.some(
        (article) =>
          article.slug === entry.slug &&
          article.articleId === entry.articleId &&
          article.status === entry.status,
      ) &&
      (entry.status === "PUBLISHED"
        ? entry.validationStatus === "RECONSTRUCTED_FROM_PRODUCTION" ||
          entry.validationStatus === "VALIDATE PASS"
        : entry.validationStatus === "PLANNED"),
  ),
  "audit records the correct validation state",
);

console.log(
  `seo-operational-master-unit: OK (${master.articles.length} articles, ${master.nextQueue.length} queued)`,
);
