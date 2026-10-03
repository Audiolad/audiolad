import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] ?? "";
}

const lockPath = arg("--lockfile");
const cache = arg("--cache");
if (!lockPath || !cache) {
  process.stderr.write("usage: seed-npm-cache.mjs --lockfile PATH --cache DIR\n");
  process.exit(2);
}

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const packages = Object.values(lock.packages ?? {}).filter(
  (meta) => meta && meta.resolved && meta.integrity,
);

function cacheFile(integrity) {
  return join(cache, "tarballs", integrity.replace(/[^A-Za-z0-9.-]/g, "_"));
}

let written = 0;
for (const meta of packages) {
  const response = await fetch(meta.resolved, { redirect: "error" });
  if (!response.ok) {
    process.stderr.write(`download failed status=${response.status} url=${meta.resolved}\n`);
    process.exit(1);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const match = /^(sha512|sha1)-(.+)$/i.exec(meta.integrity);
  if (!match) {
    process.stderr.write(`unsupported integrity for ${meta.resolved}\n`);
    process.exit(1);
  }
  const digest = createHash(match[1].toLowerCase()).update(bytes).digest("base64");
  if (`${match[1].toLowerCase()}-${digest}` !== meta.integrity) {
    process.stderr.write(`integrity mismatch for ${meta.resolved}\n`);
    process.exit(1);
  }
  const destination = cacheFile(meta.integrity);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bytes);
  written += 1;
}

process.stdout.write(`seeded=${written}\n`);
