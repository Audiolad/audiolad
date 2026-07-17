#!/usr/bin/env node

import { readFileSync } from "node:fs";

import {
  classifyResumeHistoryResponse,
  shouldLoadWelcomeSession,
  shouldSkipInitialSessionRestore,
} from "../src/lib/listen/initial-session-policy.ts";

const ROOT = "/tmp/audiolad-default-welcome-practice";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testClassifyResumeHistoryResponse() {
  assert(
    classifyResumeHistoryResponse({ status: 200 }) === "restored",
    "200 means restored history",
  );
  assert(
    classifyResumeHistoryResponse({
      status: 401,
      reason: "unauthenticated",
    }) === "no_history",
    "expected guest resume 401 means no history",
  );
  assert(
    classifyResumeHistoryResponse({ status: 401, reason: "unauthorized" }) ===
      "failed",
    "unexpected 401 reason means failed",
  );
  assert(
    classifyResumeHistoryResponse({ status: 404, reason: "no_history" }) ===
      "no_history",
    "404 no_history means no history",
  );
  assert(
    classifyResumeHistoryResponse({ status: 500 }) === "failed",
    "500 means failed check",
  );
  assert(
    classifyResumeHistoryResponse({ status: 403 }) === "failed",
    "unexpected status means failed",
  );
}

function testShouldLoadWelcomeSession() {
  const base = {
    phase: "no-history",
    hasActiveSession: false,
    explicitProductRequested: false,
    hasPersistedDesktopSession: false,
    hasGuestProgress: false,
    resumeHistoryResult: "no_history",
  };

  assert(
    shouldLoadWelcomeSession(base),
    "no history at no-history phase loads welcome",
  );

  assert(
    !shouldLoadWelcomeSession({ ...base, hasActiveSession: true }),
    "active session blocks welcome",
  );

  assert(
    !shouldLoadWelcomeSession({ ...base, explicitProductRequested: true }),
    "explicit product blocks welcome",
  );

  assert(
    !shouldLoadWelcomeSession({ ...base, hasPersistedDesktopSession: true }),
    "persisted desktop session blocks welcome",
  );

  assert(
    !shouldLoadWelcomeSession({ ...base, hasGuestProgress: true }),
    "guest progress blocks welcome",
  );

  assert(
    !shouldLoadWelcomeSession({ ...base, resumeHistoryResult: "restored" }),
    "restored auth history blocks welcome",
  );

  assert(
    !shouldLoadWelcomeSession({ ...base, resumeHistoryResult: "failed" }),
    "failed history check blocks welcome",
  );

  assert(
    !shouldLoadWelcomeSession({ ...base, phase: "restoring" }),
    "pending restore phase blocks welcome",
  );

  assert(
    !shouldLoadWelcomeSession({ ...base, phase: "pending" }),
    "pending phase blocks welcome",
  );
}

function testSkipInitialSessionRestore() {
  assert(
    shouldSkipInitialSessionRestore({ explicitProductRequested: true }),
    "listen path skips restore",
  );
  assert(
    !shouldSkipInitialSessionRestore({ explicitProductRequested: false }),
    "home path allows restore",
  );
}

function testWelcomePracticeConfig() {
  const source = readFileSync(
    `${ROOT}/src/lib/listen/welcome-practice.ts`,
    "utf8",
  );

  assert(source.includes('authorSlug: "sergey-and-zoya"'), "author slug configured");
  assert(
    source.includes('practiceSlug: "klyuch-k-izobiliyu"'),
    "practice slug configured",
  );
}

function testWelcomeSessionApiRoute() {
  const route = readFileSync(
    `${ROOT}/src/app/api/listen/welcome-session/route.ts`,
    "utf8",
  );

  assert(route.includes("loadListenSessionPayload"), "uses shared session loader");
  assert(route.includes("DEFAULT_WELCOME_PRACTICE"), "uses welcome config");
  assert(route.includes("isWelcomeSession: true"), "marks welcome session");
  assert(route.includes("forceStartAtBeginning: true"), "welcome starts at beginning");
  assert(!route.includes("payload.url"), "does not return signed audio URLs");
  assert(!route.includes("service_role"), "does not expose service role");
}

function testLoadSessionPayloadUsesExplicitFk() {
  const loader = readFileSync(
    `${ROOT}/src/lib/listen/load-session-payload.ts`,
    "utf8",
  );

  assert(
    loader.includes("authors!practices_author_id_fkey"),
    "session loader uses explicit author FK",
  );
}

function testGlobalPlayerProviderWelcomeFlow() {
  const provider = readFileSync(
    `${ROOT}/src/components/audio/GlobalAudioPlayerProvider.tsx`,
    "utf8",
  );

  assert(
    provider.includes("/api/listen/welcome-session"),
    "provider fetches welcome session API",
  );
  assert(
    provider.includes("requestAutoplay: false"),
    "welcome loads without autoplay",
  );
  assert(
    provider.includes("shouldLoadWelcomeSession"),
    "provider uses welcome policy helper",
  );
  assert(
    provider.includes("session.isWelcomeSession"),
    "provider respects welcome session flag",
  );
  assert(
    provider.includes('setDesktopPlayerRestoreState("failed")'),
    "failed restore does not fall through to welcome blindly",
  );
  assert(
    provider.includes('setDesktopPlayerRestoreState("no-history")'),
    "no-history phase is explicit before welcome fetch",
  );
}

function testDesktopPlayerBarStates() {
  const bar = readFileSync(
    `${ROOT}/src/components/listener/DesktopPlayerBar.tsx`,
    "utf8",
  );

  assert(bar.includes("DesktopPlayerPreviewState"), "preview state exists");
  assert(
    bar.includes('desktopPlayerRestoreState === "no-history"'),
    "no-history shows restoring skeleton",
  );
  assert(
    bar.includes("Выберите практику, чтобы начать слушать"),
    "empty fallback preserved",
  );
}

function testWelcomeSessionDoesNotAutoplay() {
  const provider = readFileSync(
    `${ROOT}/src/components/audio/GlobalAudioPlayerProvider.tsx`,
    "utf8",
  );

  const welcomeLoadBlock = provider.slice(
    provider.indexOf("welcomeData.ok && welcomeData.session"),
    provider.indexOf("welcome_session_fetch_failed"),
  );

  assert(
    welcomeLoadBlock.includes("requestAutoplay: false"),
    "welcome session loaded with requestAutoplay false",
  );
  assert(
    welcomeLoadBlock.includes("forceStartAtBeginning: true"),
    "welcome starts at beginning",
  );
}

function testWelcomePersistenceGuard() {
  const provider = readFileSync(
    `${ROOT}/src/components/audio/GlobalAudioPlayerProvider.tsx`,
    "utf8",
  );

  assert(
    provider.includes("welcomePlaybackStartedRef"),
    "welcome playback gate for desktop persistence",
  );
  assert(
    provider.includes("welcomePlaybackStarted"),
    "welcome mini-player waits for first playback",
  );
  assert(
    provider.includes("if (session.isWelcomeSession) {\n      return;\n    }"),
    "welcome session skips immediate desktop persistence",
  );
}

function testExplicitProductClearsWelcomeFlag() {
  const provider = readFileSync(
    `${ROOT}/src/components/audio/GlobalAudioPlayerProvider.tsx`,
    "utf8",
  );

  assert(
    provider.includes("isWelcomeSession: input.isWelcomeSession === true"),
    "explicit load clears welcome session flag by default",
  );
}

function run() {
  testClassifyResumeHistoryResponse();
  testShouldLoadWelcomeSession();
  testSkipInitialSessionRestore();
  testWelcomePracticeConfig();
  testWelcomeSessionApiRoute();
  testLoadSessionPayloadUsesExplicitFk();
  testGlobalPlayerProviderWelcomeFlow();
  testDesktopPlayerBarStates();
  testWelcomeSessionDoesNotAutoplay();
  testWelcomePersistenceGuard();
  testExplicitProductClearsWelcomeFlag();
  console.log("welcome-session-unit: ok");
}

run();
