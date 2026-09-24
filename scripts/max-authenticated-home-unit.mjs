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

assert.match(bridge, /view\.phase === "linked_authenticated"/);
assert.match(bridge, /<MaxAuthenticatedHome/);
assert.match(home, /MAX_CATALOG_PATH/);
assert.match(home, /method: "POST"/);
assert.match(home, /cache: "no-store"/);
assert.match(home, /Загружаем каталог/);
assert.match(home, /В каталоге пока нет опубликованных аудиопродуктов/);
const maxHomeSource = `${bridge}\n${home}`
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
assert.doesNotMatch(
  maxHomeSource,
  /window\.location|openLink|\/practice\/|\/catalog["']|\/my-practices|\/studio|access_token|refresh_token|user_id|max_user_id/,
);

console.log("max-authenticated-home-unit: ok");
