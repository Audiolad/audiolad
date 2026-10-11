// Regression for the 2026-10-11 production outage of /admin/ai-company:
// a server page called a function exported from a "use client" module
// ("Attempted to call parseBoardTabParam() from the server ... on the client", digest 3183520246).
// Server files under admin/ai-company must not import runtime values from "use client" modules
// other than as rendered components (default import).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const pageDir = join(root, "src/app/(platform)/admin/ai-company");
const files = readdirSync(pageDir, { recursive: true }).map(String).filter((f) => /\.(tsx?|mts)$/.test(f));
assert.ok(files.includes("page.tsx"));

function resolveAlias(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = join(root, "src", spec.slice(2));
  for (const ext of [".tsx", ".ts"]) {
    try { readFileSync(base + ext); return base + ext; } catch {}
  }
  return null;
}

for (const f of files) {
  const src = readFileSync(join(pageDir, f), "utf8");
  if (/^\s*["']use client["']/.test(src)) continue; // client files may import anything
  const re = /import\s+([^;]*?)\s+from\s+["']([^"']+)["']/g;
  for (const m of src.matchAll(re)) {
    const target = resolveAlias(m[2]);
    if (!target) continue;
    const t = readFileSync(target, "utf8");
    if (!/^\s*["']use client["']/.test(t)) continue;
    const clause = m[1].trim();
    if (clause.startsWith("type ")) continue;
    // Allowed: default import only (a component rendered as JSX). Named value imports are server calls.
    const named = clause.match(/\{([^}]*)\}/)?.[1] ?? "";
    const values = named.split(",").map((x) => x.trim()).filter((x) => x && !x.startsWith("type "));
    assert.deepEqual(values, [], `${f}: server file imports values ${values.join(", ")} from client module ${m[2]}`);
  }
}

import { parseBoardTabParam } from "../src/lib/admin/ai-company-dashboard";
assert.equal(parseBoardTabParam("review"), "review");
assert.equal(parseBoardTabParam("plan"), "plan");
assert.equal(parseBoardTabParam("nonsense"), "working");
assert.equal(parseBoardTabParam(undefined), "working");
assert.equal(parseBoardTabParam(null), "working");
console.log("ai-company server boundary ok");
