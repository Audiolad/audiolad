#!/usr/bin/env node
// Offline inventory of a package-lock.json closure.
// Reads local files only. Does not contact a registry.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function fail(message) {
  process.stderr.write(`ERROR: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { lockfile: "", cache: "", packageRoot: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--lockfile") {
      args.lockfile = argv[i + 1] ?? "";
      i += 1;
    } else if (token === "--cache") {
      args.cache = argv[i + 1] ?? "";
      i += 1;
    } else if (token === "--package-root") {
      args.packageRoot = argv[i + 1] ?? "";
      i += 1;
    } else {
      fail(`unknown argument ${token}`);
    }
  }
  if (!args.lockfile) {
    fail("--lockfile is required");
  }
  return args;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function integrityContentPath(cacheDir, integrity) {
  const match = /^sha512-(.+)$/.exec(integrity);
  if (!match) {
    return null;
  }
  const hex = Buffer.from(match[1], "base64").toString("hex");
  if (hex.length < 4) {
    return null;
  }
  const relative = join(
    "content-v2",
    "sha512",
    hex.slice(0, 2),
    hex.slice(2, 4),
    hex.slice(4),
  );
  return [
    join(cacheDir, "_cacache", relative),
    join(cacheDir, relative),
  ];
}

function cacheHas(cacheDir, integrity) {
  if (!cacheDir) {
    return false;
  }
  const paths = integrityContentPath(cacheDir, integrity);
  if (!paths) {
    return false;
  }
  return paths.some((path) => existsSync(path));
}

const args = parseArgs(process.argv.slice(2));
const lock = JSON.parse(readFileSync(args.lockfile, "utf8"));
const packages = lock.packages ?? {};
const hosts = {};
let resolvedHttps = 0;
let resolvedFile = 0;
let missingHttps = 0;
let missingFile = 0;
let integrityMissing = 0;

for (const [, entry] of Object.entries(packages)) {
  if (!entry || typeof entry !== "object") {
    continue;
  }
  const resolved = typeof entry.resolved === "string" ? entry.resolved : "";
  const fileDependency = resolved.startsWith("file:") || (entry.link === true && resolved && !/^[a-z][a-z0-9+.-]*:\/\//i.test(resolved));
  if (fileDependency) {
    resolvedFile += 1;
    const relative = resolved.startsWith("file:")
      ? resolved.slice("file:".length).replace(/^\.?\//, "")
      : resolved;
    const packageJson = args.packageRoot
      ? join(args.packageRoot, relative, "package.json")
      : "";
    if (!packageJson || !existsSync(packageJson)) {
      missingFile += 1;
    }
    continue;
  }
  if (!resolved) {
    continue;
  }
  if (!/^https?:\/\//.test(resolved)) {
    continue;
  }
  resolvedHttps += 1;
  const host = hostOf(resolved);
  if (host) {
    hosts[host] = (hosts[host] ?? 0) + 1;
  }
  const integrity = typeof entry.integrity === "string" ? entry.integrity : "";
  if (!integrity) {
    integrityMissing += 1;
    missingHttps += 1;
    continue;
  }
  if (!cacheHas(args.cache, integrity)) {
    missingHttps += 1;
  }
}

const root = packages[""] ?? {};
const topLevel = {
  ...root.dependencies,
  ...root.devDependencies,
};

const summary = {
  lockfileVersion: lock.lockfileVersion ?? null,
  packageEntries: Object.keys(packages).length,
  resolvedHttps,
  resolvedFile,
  missingHttps,
  missingFile,
  integrityMissing,
  hosts,
  topLevel,
  readyNpm: missingHttps === 0 && missingFile === 0 && resolvedHttps + resolvedFile > 0,
};

process.stdout.write(`${JSON.stringify(summary)}\n`);
