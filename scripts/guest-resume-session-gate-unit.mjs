#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const provider = readFileSync(
  join(root, "src/components/audio/GlobalAudioPlayerProvider.tsx"),
  "utf8",
);
const restoreBlock = provider.slice(
  provider.indexOf("async function restoreDesktopPlayerSession"),
  provider.indexOf("void restoreDesktopPlayerSession();"),
);

assert.match(restoreBlock, /readDesktopPlayerLastSession\(\)/, "persisted session first");
assert.match(restoreBlock, /hasSupabaseAuthCookie/, "auth cookie gate before resume");
assert.match(restoreBlock, /\/api\/listen\/resume-session/, "auth resume still exists");
assert.match(
  restoreBlock,
  /NEXT_PUBLIC_SUPABASE_URL/,
  "cookie name comes from supabase URL",
);
assert.doesNotMatch(restoreBlock, /x-audiolad-auth/, "no invented auth header");

const api = readFileSync(
  join(root, "src/app/api/listen/resume-session/route.ts"),
  "utf8",
);
assert.match(api, /status: 401/, "API contract unchanged");

console.log("guest-resume-session-gate-unit: ok");
