#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  classifyResumeHistoryResponse,
  shouldLoadWelcomeSession,
  shouldSkipInitialSessionRestore,
} from "../src/lib/listen/initial-session-policy.ts";
import {
  DEFAULT_WELCOME_PRACTICE,
  getDefaultWelcomeListenTarget,
} from "../src/lib/listen/welcome-practice.ts";

assert.deepEqual(getDefaultWelcomeListenTarget(), {
  authorSlug: "sergey-and-zoya",
  productSlug: "klyuch-k-izobiliyu",
});

assert.equal(DEFAULT_WELCOME_PRACTICE.authorSlug, "sergey-and-zoya");
assert.equal(DEFAULT_WELCOME_PRACTICE.practiceSlug, "klyuch-k-izobiliyu");

assert.equal(
  classifyResumeHistoryResponse({ status: 401, reason: "unauthenticated" }),
  "no_history",
);

assert.equal(
  classifyResumeHistoryResponse({ status: 404, reason: "no_history" }),
  "no_history",
);

assert.equal(classifyResumeHistoryResponse({ status: 500 }), "failed");

const base = {
  phase: "no-history",
  hasActiveSession: false,
  explicitProductRequested: false,
  hasPersistedDesktopSession: false,
  hasGuestProgress: false,
  resumeHistoryResult: "no_history",
};

assert.equal(shouldLoadWelcomeSession(base), true);
assert.equal(shouldLoadWelcomeSession({ ...base, hasGuestProgress: true }), false);
assert.equal(
  shouldLoadWelcomeSession({ ...base, hasPersistedDesktopSession: true }),
  false,
);
assert.equal(shouldSkipInitialSessionRestore({ explicitProductRequested: true }), true);

console.log("welcome-session-unit: ok");
