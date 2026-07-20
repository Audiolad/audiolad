#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADMIN_INTERACTIVE_SCRIPTS,
  GUARDED_WRITE_SCRIPTS,
  READ_ONLY_SQL_SCRIPTS,
  REQUIRED_ADMIN_MARKERS,
  REQUIRED_GUARD_MARKERS,
  UNIT_MOCK_WRITE_SCRIPTS,
} from "./lib/fixture-write-scripts.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptsDir = path.join(__dirname);
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function readScript(relativePath) {
  return readFileSync(path.join(scriptsDir, "..", relativePath), "utf8");
}

function hasAnyMarker(source, markers) {
  return markers.some((marker) => source.includes(marker));
}

for (const relativePath of GUARDED_WRITE_SCRIPTS) {
  const source = readScript(relativePath);
  assert(
    hasAnyMarker(source, REQUIRED_GUARD_MARKERS),
    `${relativePath} must import fixture write guard before writes`,
  );
  assert(
    !source.includes("ALLOW_PRODUCTION_TEST_FIXTURES=true") ||
      source.includes("does NOT bypass") ||
      source.includes("deprecated"),
    `${relativePath} must not document production override as allowed`,
  );
}

for (const relativePath of ADMIN_INTERACTIVE_SCRIPTS) {
  const source = readScript(relativePath);
  assert(
    hasAnyMarker(source, REQUIRED_ADMIN_MARKERS),
    `${relativePath} must require admin interactive confirmation`,
  );
}

for (const relativePath of READ_ONLY_SQL_SCRIPTS) {
  const source = readScript(relativePath);
  assert(
    !source.includes(".insert(") && !source.includes("createUser("),
    `${relativePath} must remain read-only`,
  );
}

for (const relativePath of UNIT_MOCK_WRITE_SCRIPTS) {
  const source = readScript(relativePath);
  assert(
    source.includes("mock") || source.includes("Mock") || source.includes("unit"),
    `${relativePath} must stay unit/mock-only`,
  );
}

const writePattern =
  /createUser\(|auth\.admin\.createUser|INSERT INTO|docker exec supabase-db|\.from\([^)]+\)\.insert\(/;

function scanDirectory(dir, base = "scripts") {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = `${base}/${entry}`;
    if (statSync(full).isDirectory()) {
      if (entry === "lib" || entry === "screenshots" || entry === "fixtures") continue;
      scanDirectory(full, rel);
      continue;
    }
    if (!entry.endsWith(".mjs")) continue;
    if (entry.endsWith("-unit.mjs")) continue;
    if (entry.endsWith("-audit-unit.mjs")) continue;
    const source = readFileSync(full, "utf8");
    if (!writePattern.test(source)) continue;

    const inventory = [
      ...GUARDED_WRITE_SCRIPTS,
      ...READ_ONLY_SQL_SCRIPTS,
      ...ADMIN_INTERACTIVE_SCRIPTS,
      ...UNIT_MOCK_WRITE_SCRIPTS,
    ];
    if (inventory.includes(rel)) continue;

    assert(false, `${rel} contains write patterns but is not in fixture inventory`);
  }
}

scanDirectory(scriptsDir);

if (failures.length) {
  console.error("fixture-write-scripts-audit-unit FAILURES:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("fixture-write-scripts-audit-unit: all checks passed");
