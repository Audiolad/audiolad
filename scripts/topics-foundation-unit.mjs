#!/usr/bin/env node
/**
 * Topics foundation unit checks (no DB).
 */
import { readFileSync } from "node:fs";

import {
  assertPublishedTopicMinimum,
  assertTopicCountWithinLimit,
  DEFAULT_AUTHOR_TOPIC_LIMIT,
} from "../src/lib/topics/limits.ts";
import { extractTopicErrorCode, mapTopicRpcError } from "../src/lib/topics/errors.ts";

function isSetPracticeTopicsResult(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return (
    typeof value.practice_id === "string" &&
    Array.isArray(value.topic_keys) &&
    value.topic_keys.every((key) => typeof key === "string") &&
    typeof value.topic_count === "number" &&
    typeof value.topic_limit === "number"
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(DEFAULT_AUTHOR_TOPIC_LIMIT === 3, "default limit is 3");

const within = assertTopicCountWithinLimit(3, 3);
assert(within.ok === true, "3 of 3 allowed");

const exceeded = assertTopicCountWithinLimit(4, 3);
assert(exceeded.ok === false && exceeded.code === "topic_limit_exceeded", "4 of 3 rejected");

const minOk = assertPublishedTopicMinimum(1);
assert(minOk.ok === true, "one topic satisfies publish minimum");

const minFail = assertPublishedTopicMinimum(0);
assert(minFail.ok === false && minFail.code === "topic_min_required", "zero topics rejected for publish");

assert(
  isSetPracticeTopicsResult({
    practice_id: "abc",
    topic_keys: ["money"],
    topic_count: 1,
    topic_limit: 3,
  }),
  "valid rpc result shape",
);

assert(
  !isSetPracticeTopicsResult({ practice_id: "abc", topic_keys: ["money"] }),
  "invalid rpc result rejected",
);

const mapped = mapTopicRpcError("topic_not_found");
assert(mapped.status === 404 && mapped.code === "topic_not_found", "maps topic_not_found");

assert(extractTopicErrorCode("ERROR: topic_limit_exceeded") === "topic_limit_exceeded", "extract code");

const migration = readFileSync(
  "/var/www/audiolad/supabase/migrations/20260717140000_topics_foundation.sql",
  "utf8",
);

assert(migration.includes("CREATE TABLE IF NOT EXISTS public.topics"), "topics table");
assert(migration.includes("CREATE TABLE IF NOT EXISTS public.practice_topics"), "join table");
assert(migration.includes("show_on_home"), "show_on_home column");
assert(migration.includes("set_practice_topics"), "rpc");
assert(migration.includes("topic_min_required"), "publish gate");
assert(
  !migration.includes("CONSTRAINT practice_topics") ||
    !migration.includes("practice_topics_topic_count"),
  "no named schema constraint on practice topic count",
);

console.log("topics-foundation-unit: ok");
