#!/usr/bin/env node
/**
 * MAX linked shell loads the isolated catalog view, not apex navigation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bridge = readFileSync(
  join(repoRoot, "src/components/max/MaxBridgeScript.tsx"),
  "utf8",
);
const home = readFileSync(
  join(repoRoot, "src/components/max/MaxAuthenticatedHome.tsx"),
  "utf8",
);
const catalogSearch = readFileSync(
  join(repoRoot, "src/components/max/MaxCatalogSearch.tsx"),
  "utf8",
);

assert.match(bridge, /view\.phase === "linked_authenticated"/);
assert.match(bridge, /<MaxAuthenticatedHome/);
assert.match(home, /<MaxCatalogSearch/);
assert.match(catalogSearch, /MAX_CATALOG_PATH/);
assert.match(home, /MAX_PLAYBACK_PREVIEW_PATH/);
assert.match(home, /Предпрослушивание пока недоступно/);
assert.match(home, /method: "POST"/);
assert.match(catalogSearch, /method: "POST"/);
assert.match(home, /cache: "no-store"/);
assert.match(catalogSearch, /cache: "no-store"/);
assert.match(catalogSearch, /Загружаем каталог/);
assert.match(catalogSearch, /В каталоге пока нет опубликованных аудиопродуктов/);
assert.match(catalogSearch, /grid-cols-2/);
assert.match(catalogSearch, /gap-\[6px\]/);
assert.match(catalogSearch, /-mx-4/);
assert.match(catalogSearch, /px-\[6px\]/);
assert.match(catalogSearch, /aspect-square w-full/);
assert.match(catalogSearch, /h-full w-full object-cover/);
assert.match(catalogSearch, /flex-col/);
assert.match(catalogSearch, /rounded-\[20px\]/);
assert.match(catalogSearch, /!product\.isFree/);
assert.match(catalogSearch, /px-2\.5 pb-2\.5 pt-2/);
assert.match(catalogSearch, /line-clamp-2 min-h-10 text-\[14px\]/);
assert.match(catalogSearch, /min-h-5/);
assert.match(catalogSearch, /whitespace-nowrap text-xs/);
const catalogStart = catalogSearch.indexOf('<ul className="mt-5 -mx-4 grid grid-cols-2 gap-[6px] px-[6px]">');
const readyStart = home.indexOf('{detail.status === "ready" ?');
assert.ok(catalogStart >= 0 && readyStart >= 0, "catalog grid and detail both exist");
const catalogBlock = catalogSearch.slice(catalogStart);
assert.doesNotMatch(catalogBlock, /product\.subtitle/);
assert.match(home.slice(readyStart), /detail\.product\.subtitle/);
assert.doesNotMatch(catalogSearch, /flex min-h-28/);
assert.doesNotMatch(catalogSearch, /w-24 shrink-0/);
assert.doesNotMatch(`${home}\n${catalogSearch}`, /Подарок|Бесплатно/);
assert.doesNotMatch(`${home}\n${catalogSearch}`, /CatalogProductHeart|CatalogProductPlay/);
const maxHomeSource = `${bridge}\n${home}\n${catalogSearch}`
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
assert.doesNotMatch(
  maxHomeSource,
  /window\.location|openLink|\/practice\/|\/catalog["']|\/my-practices|\/studio|access_token|refresh_token|user_id|max_user_id/,
);

console.log("max-authenticated-home-unit: ok");
