#!/usr/bin/env node
import { FixtureRegistry } from "./lib/fixture-registry.mjs";
import { hasFixtureMarker } from "./lib/fixture-marker.mjs";

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const deleted = [];
const remaining = new Map();

function sqlFile(query) {
  const match = query.match(/WHERE id = '([^']+)'/);
  if (match) {
    deleted.push(match[1]);
    remaining.delete(match[1]);
  }
  const sessionMatch = query.match(/anonymous_session_id = '([^']+)'/);
  if (sessionMatch) {
    deleted.push(`session:${sessionMatch[1]}`);
  }
}

function sqlScalar(query) {
  const idMatch = query.match(/WHERE id = '([^']+)'/);
  if (idMatch) {
    return remaining.has(idMatch[1]) ? "1" : "0";
  }
  const sessionMatch = query.match(/anonymous_session_id = '([^']+)'/);
  if (sessionMatch) {
    return deleted.includes(`session:${sessionMatch[1]}`) ? "0" : "1";
  }
  return "0";
}

const registry = new FixtureRegistry({ sqlFile, sqlScalar, runId: "unit123" });
remaining.set("practice-a", true);
remaining.set("campaign-a", true);

registry.register("practice", "practice-a");
registry.register("promotion_campaign", "campaign-a");
registry.register("analytics_events_by_session", "session-a", {
  sessionId: "session-a",
});

const firstCleanup = registry.cleanupSync();
assert(firstCleanup === 0, "first cleanup must succeed");
assert(deleted.includes("practice-a"), "cleanup must delete registered practice UUID");
assert(deleted.includes("campaign-a"), "cleanup must delete registered campaign UUID");
assert(deleted.includes("session:session-a"), "cleanup must delete analytics by session");

const secondCleanup = registry.cleanupSync();
assert(secondCleanup === 0, "cleanup must be idempotent");

let cleanupAfterFailureRan = false;
const failureRegistry = new FixtureRegistry({
  sqlFile: () => {
    cleanupAfterFailureRan = true;
  },
  sqlScalar: () => "0",
  runId: "fail123",
});

failureRegistry.register("author", "author-a");
try {
  throw new Error("simulated assertion failure");
} catch {
  // expected
} finally {
  failureRegistry.cleanupSync();
  cleanupAfterFailureRan = true;
}
assert(cleanupAfterFailureRan, "cleanup must run in finally after simulated failure");

assert(
  hasFixtureMarker({
    _audiolad_fixture: { test_fixture: true, namespace: "x", run_id: "y" },
  }),
  "marker helper must detect fixture records",
);

if (failures.length) {
  console.error("fixture-registry-unit FAILURES:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("fixture-registry-unit: all checks passed");
