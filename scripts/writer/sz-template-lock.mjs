#!/usr/bin/env node
// SHA-256 lock of the approved «Сергей и Зоя» (--site sz) template. The coffee template must never
// change these files. `node scripts/writer/sz-template-lock.mjs --write` refreshes the lock (only in
// a PR that deliberately changes the sz template); coffee-unit.mjs verifies it.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const WRITER = dirname(fileURLToPath(import.meta.url));
export const LOCK_FILE = join(WRITER, "sz-template.lock.json");
export const SZ_PATHS = ["lib/sites/sz", "sz-unit.mjs", "fixtures/sz"];

function walk(path) {
  const stat = statSync(path);
  if (!stat.isDirectory()) return [path];
  return readdirSync(path).sort().flatMap((name) => walk(join(path, name)));
}

export function szHashes() {
  const out = {};
  for (const path of SZ_PATHS.flatMap((p) => walk(join(WRITER, p)))) {
    out[relative(WRITER, path)] = createHash("sha256").update(readFileSync(path)).digest("hex");
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--write")) {
    writeFileSync(LOCK_FILE, `${JSON.stringify({ note: "Approved sz template (sergey-zoya.ru). Do not edit by hand; see sz-template-lock.mjs.", files: szHashes() }, null, 2)}\n`);
    console.log(`записан ${LOCK_FILE}`);
  } else {
    console.log(JSON.stringify(szHashes(), null, 2));
  }
}
