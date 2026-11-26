#!/usr/bin/env node
/**
 * Regression: linked MAX listen heartbeats must not be suppressed by apex
 * Supabase cookies (desktop MAX web often has both initData and site cookies).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MAX_LISTEN_STATS_PATH } from "../src/lib/max/host.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const listenClient = readFileSync(
  join(repoRoot, "src/lib/max/listen-client.ts"),
  "utf8",
);

assert.match(listenClient, /reportMaxLinkedListenSample/);
assert.match(listenClient, /readMaxInitData/);
assert.match(listenClient, /MAX_LISTEN_STATS_PATH/);
assert.doesNotMatch(
  listenClient,
  /readListenStatsClientAuthenticated/,
  "linked MAX listen must not skip when apex Supabase cookies are present",
);

const guestListenClient = readFileSync(
  join(repoRoot, "src/lib/ratings/guest/listen-client.ts"),
  "utf8",
);
assert.match(
  guestListenClient,
  /readListenStatsClientAuthenticated/,
  "guest listen still skips when a site session exists",
);

console.log("max-listen-client-unit: ok");