// Writes article data modules into a worktree of Audiolad/audiolad and registers them in
// src/lib/business/vertical-guides/registry.ts (import + ARTICLES entry).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { COFFEE } from "./config.mjs";
import { exportName, toTsModule } from "./assemble.mjs";

/** Pure: registry.ts source + new slugs → updated source. Throws if the layout is unknown. */
export function registerArticles(source, slugs) {
  let out = source;
  const arrayRe = /const ARTICLES: readonly VerticalGuideArticle\[\] = \[([^\]]*)\];/;
  const match = out.match(arrayRe);
  if (!match) throw new Error("registry.ts: не найден массив ARTICLES – формат реестра изменился");
  const names = match[1].split(",").map((name) => name.trim()).filter(Boolean);
  const imports = [];
  for (const slug of slugs) {
    const name = exportName(slug);
    if (names.includes(name)) throw new Error(`registry.ts: статья ${slug} уже зарегистрирована`);
    names.push(name);
    imports.push(`import { ${name} } from "./articles/${slug}";`);
  }
  const lastImport = [...out.matchAll(/^import \{ [A-Z0-9_]+ \} from "\.\/articles\/[a-z0-9-]+";$/gm)].pop();
  if (!lastImport) throw new Error("registry.ts: не найден импорт статей");
  const at = lastImport.index + lastImport[0].length;
  out = `${out.slice(0, at)}\n${imports.join("\n")}${out.slice(at)}`;
  return out.replace(arrayRe, `const ARTICLES: readonly VerticalGuideArticle[] = [${names.join(", ")}];`);
}

export function applyCoffeePack(worktree, { items, packId, model }) {
  const changed = [];
  for (const { article } of items) {
    const file = `${COFFEE.articlesDir}/${article.slug}.ts`;
    writeFileSync(join(worktree, file), toTsModule(article, { packId, model }));
    changed.push(file);
  }
  const registry = join(worktree, COFFEE.registryFile);
  writeFileSync(registry, registerArticles(readFileSync(registry, "utf8"), items.map(({ article }) => article.slug)));
  changed.push(COFFEE.registryFile);
  return { changed };
}
