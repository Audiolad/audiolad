#!/usr/bin/env node
/**
 * Synthetic load probe for the pure popularity aggregator (mirrors SQL shape).
 * Not production data; measures JS aggregation cost for ~200 products × ~120 sessions.
 */
import assert from "node:assert/strict";

import { countQualifiedListenSessionsByPractice } from "../src/lib/catalog/sort-metrics-pure.ts";

const PRACTICE_COUNT = 220;
const SESSIONS_PER_PRACTICE = 120;

function buildSyntheticFacts() {
  const rows = [];

  for (let practiceIndex = 0; practiceIndex < PRACTICE_COUNT; practiceIndex += 1) {
    const practiceId = `practice-${practiceIndex}`;

    for (let sessionIndex = 0; sessionIndex < SESSIONS_PER_PRACTICE; sessionIndex += 1) {
      const listenedMs = sessionIndex % 17 === 0 ? 75_000 : 12_000;
      rows.push({
        practiceId,
        sessionId: `session-${practiceIndex}-${sessionIndex}`,
        listeningKey: `${practiceId}:track:${sessionIndex}:${Date.now()}`,
        listenedMs,
      });
    }
  }

  return rows;
}

const facts = buildSyntheticFacts();
const started = performance.now();
const counts = countQualifiedListenSessionsByPractice(facts);
const elapsedMs = performance.now() - started;

assert.equal(counts.size, PRACTICE_COUNT, "every practice gets a count");
assert.ok(elapsedMs < 2_000, `synthetic aggregation stayed <2s (${elapsedMs.toFixed(1)} ms)`);

console.log(
  `catalog-sort-rpc-perf-unit: ${facts.length} fact rows, ${counts.size} practices, ${elapsedMs.toFixed(1)} ms`,
);