import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return "";
  return process.argv[index + 1] ?? "";
}

function fail(message, extra = {}) {
  const payload = { emergency_build_ready: false, error: message, ...extra };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.stderr.write(`emergency_build_ready=no ${message}\n`);
  process.exit(1);
}

const gitWorkdir = arg("--git-workdir");
const sha = arg("--sha");
const cache = arg("--cache");
const expectedArg = arg("--expected-node-major");

if (!gitWorkdir || !sha || !cache) {
  fail("usage: emergency-build-ready.mjs --git-workdir DIR --sha SHA --cache DIR");
}
if (!/^[0-9a-f]{40}$/.test(sha)) {
  fail("SHA must be 40 lowercase hex characters");
}

function gitShow(path) {
  const result = spawnSync("git", ["-C", gitWorkdir, "show", `${sha}:${path}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) return null;
  return result.stdout;
}

const lockText = gitShow("package-lock.json");
const packageText = gitShow("package.json");
if (!lockText || !packageText) {
  fail("commit is missing package.json or package-lock.json", { sha });
}

let lock;
try {
  lock = JSON.parse(lockText);
} catch {
  fail("package-lock.json is not valid JSON", { sha });
}

const packages = lock.packages ?? {};
const required = [];
const hosts = {};
for (const [name, meta] of Object.entries(packages)) {
  if (!meta || typeof meta !== "object" || !meta.resolved || !meta.integrity) continue;
  let host = "unknown";
  try {
    host = new URL(meta.resolved).host;
  } catch {
    host = "unparsed";
  }
  hosts[host] = (hosts[host] ?? 0) + 1;
  required.push({ name, resolved: meta.resolved, integrity: meta.integrity });
}

if (required.length === 0) {
  fail("package-lock.json has no resolved packages", { sha });
}

function cacheFile(integrity) {
  const safe = integrity.replace(/[^A-Za-z0-9.-]/g, "_");
  return join(cache, "tarballs", safe);
}

function hashName(integrity) {
  const match = /^([a-z0-9]+)-(.+)$/i.exec(integrity);
  if (!match) return null;
  return match[1].toLowerCase();
}

const missing = [];
const corrupt = [];
for (const item of required) {
  const file = cacheFile(item.integrity);
  if (!existsSync(file) || statSync(file).size === 0) {
    missing.push(item.resolved);
    continue;
  }
  const algorithm = hashName(item.integrity);
  if (algorithm !== "sha512" && algorithm !== "sha1") {
    corrupt.push(item.resolved);
    continue;
  }
  const digest = createHash(algorithm).update(readFileSync(file)).digest("base64");
  if (`${algorithm}-${digest}` !== item.integrity) {
    corrupt.push(item.resolved);
  }
}

let expectedNodeMajor = Number(expectedArg);
if (!expectedArg) {
  const inventoryPath = join(scriptDir, "build-dependency-inventory.json");
  if (!existsSync(inventoryPath)) {
    fail("expected node major is not configured");
  }
  expectedNodeMajor = JSON.parse(readFileSync(inventoryPath, "utf8")).expectedNodeMajor;
}
const actualNodeMajor = Number(process.versions.node.split(".")[0]);
const nodeOk = actualNodeMajor === expectedNodeMajor;

const ready = missing.length === 0 && corrupt.length === 0 && nodeOk;
const payload = {
  emergency_build_ready: ready,
  sha,
  packageCount: required.length,
  hosts,
  missingCount: missing.length,
  corruptCount: corrupt.length,
  missingSample: missing.slice(0, 20),
  node: { expected: expectedNodeMajor, actual: actualNodeMajor, ok: nodeOk },
  networkAccess: "none",
};
process.stdout.write(`${JSON.stringify(payload)}\n`);
process.stderr.write(
  `emergency_build_ready=${ready ? "yes" : "no"} packages=${required.length} missing=${missing.length} node=${actualNodeMajor}/${expectedNodeMajor}\n`,
);
process.exit(ready ? 0 : 1);
