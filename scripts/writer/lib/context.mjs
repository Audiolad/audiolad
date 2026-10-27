// Repository context for a run: existing articles, operational master, renderer capabilities.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const MASTER_PATH = "docs/seo/operational/SEO_OPERATIONAL_MASTER.json";
export const AUDIT_PATH = "docs/seo/operational/VERIFIED_AUDIT.json";
export const REGISTRY_PATH = "src/lib/seo/articles/registry.ts";
export const TYPES_PATH = "src/lib/seo/articles/types.ts";

/** Loads the article registry of the given checkout. The runner must be tsx: `node scripts/writer/writer-unit.mjs` re-invokes tsx, and `npm run writer` already uses it. */
export async function loadContext(repoDir) {
  const registry = await import(pathToFileURL(join(repoDir, REGISTRY_PATH)).href);
  const articles = registry.listArticleDefinitions().map((article) => ({
    slug: article.slug,
    title: article.title,
    breadcrumbTitle: article.breadcrumbTitle,
    metaTitle: article.metaTitle,
    articleType: article.productContinuation?.kind ?? null,
    primaryPracticeKey: article.primaryPractice?.practiceKey ?? null,
  }));
  const master = JSON.parse(readFileSync(join(repoDir, MASTER_PATH), "utf8"));
  const types = readFileSync(join(repoDir, TYPES_PATH), "utf8");
  return {
    repoDir,
    articles,
    articleBySlug: new Map(articles.map((article) => [article.slug, article])),
    masterArticles: master.articles ?? [],
    // Table blocks exist only once the renderer and types support them (see PR #958).
    supportsTable: /kind:\s*"table"/.test(types),
  };
}

export function sourceRepoFile(repoDir, relativePath) {
  return readFileSync(join(repoDir, relativePath), "utf8");
}
