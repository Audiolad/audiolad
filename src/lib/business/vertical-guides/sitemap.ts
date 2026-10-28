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
