#!/usr/bin/env node
/**
 * Client error sanitization and classification unit checks.
 */
import { readFileSync } from "node:fs";

// 800fae57 introduced production-root paths; inspect this checkout in any worktree.
const read = (path, encoding) => readFileSync(new URL(`../${path}`, import.meta.url), encoding);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadSanitizeModule() {
  const source = read(
    "src/lib/client-errors/sanitize.ts",
    "utf8",
  );

  assert(source.includes("classifyClientErrorType"), "classifier exists");
  assert(source.includes("sanitizeClientErrorReport"), "sanitizer exists");
  assert(source.includes("buildClientErrorDedupeKey"), "dedupe key exists");
}

function testReporterAvoidsSensitiveFields() {
  const reporter = read(
    "src/lib/client-errors/reporter.ts",
    "utf8",
  );
  const route = read(
    "src/app/api/client-errors/route.ts",
    "utf8",
  );

  assert(!reporter.includes("localStorage"), "reporter does not read localStorage");
  assert(!reporter.includes("access_token"), "reporter does not read access token");
  assert(!route.includes("cookie"), "route does not mention cookies");
}

function testClassificationPatterns() {
  const source = read(
    "src/lib/client-errors/sanitize.ts",
    "utf8",
  );

  assert(source.includes("ChunkLoadError"), "chunk load pattern");
  assert(source.includes("Failed to fetch dynamically imported module"), "dynamic import pattern");
  assert(source.includes("Failed to find Server Action"), "server action pattern");
  assert(source.includes("hydration"), "hydration pattern");
}

const tests = [
  ["sanitize module contract", loadSanitizeModule],
  ["reporter avoids sensitive fields", testReporterAvoidsSensitiveFields],
  ["classification patterns", testClassificationPatterns],
];

let failed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}:`, error instanceof Error ? error.message : error);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`\n${tests.length} client error checks passed`);
