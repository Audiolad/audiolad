import { listActiveVerticals } from "./verticals";
import { articlePath, listVerticalArticles } from "./registry";

/** Active section indexes plus published guide articles. Planned verticals stay out. */
export function listVerticalGuideSitemapPaths(): string[] {
  const paths: string[] = [];
  for (const vertical of listActiveVerticals()) {
    paths.push(vertical.path);
    for (const article of listVerticalArticles(vertical.id)) {
      paths.push(articlePath(article));
    }
  }
  return paths;
}

/** Same paths with lastmod: article updatedAt, the index takes the newest article date. */
export function listVerticalGuideSitemapEntries(): Array<{ path: string; lastModified?: string }> {
  const entries: Array<{ path: string; lastModified?: string }> = [];
  for (const vertical of listActiveVerticals()) {
    const articles = listVerticalArticles(vertical.id);
    const newest = articles.map((article) => article.updatedAt).sort().at(-1);
    entries.push({ path: vertical.path, ...(newest ? { lastModified: newest } : {}) });
    for (const article of articles) {
      entries.push({ path: articlePath(article), lastModified: article.updatedAt });
    }
  }
  return entries;
}
