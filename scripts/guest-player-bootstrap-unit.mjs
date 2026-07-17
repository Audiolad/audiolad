#!/usr/bin/env node
/**
 * Guest desktop player bootstrap contract checks.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testProviderWiring() {
  const provider = readFileSync(
    "/var/www/audiolad/src/components/audio/GlobalAudioPlayerProvider.tsx",
    "utf8",
  );
  const guestHome = readFileSync(
    "/var/www/audiolad/src/components/home/GuestHome.tsx",
    "utf8",
  );
  const welcomePractice = readFileSync(
    "/var/www/audiolad/src/lib/listen/welcome-practice.ts",
    "utf8",
  );

  assert(!guestHome.includes("GuestHomePlayerSeed"), "GuestHome no longer seeds via client registry");
  assert(!guestHome.includes("pickGuestDefaultListenTarget"), "GuestHome does not pick freeProducts[0]");
  assert(provider.includes("/api/listen/welcome-session"), "provider loads welcome session API");
  assert(provider.includes("applyWelcomeSession"), "provider applies welcome session");
  assert(provider.includes("shouldLoadWelcomeSession"), "provider gates welcome load");
  assert(provider.includes("hasAnyGuestPracticeProgress"), "provider respects guest progress");
  assert(welcomePractice.includes("klyuch-k-izobiliyu"), "welcome practice uses stable slug");
  assert(!welcomePractice.includes("Женские деньги"), "welcome practice is not hardcoded by title");
}

function testSharedPlayerState() {
  const sidebar = readFileSync(
    "/var/www/audiolad/src/components/listener/NowPlayingPanel.tsx",
    "utf8",
  );
  const bar = readFileSync(
    "/var/www/audiolad/src/components/listener/DesktopPlayerBar.tsx",
    "utf8",
  );

  assert(sidebar.includes("useGlobalAudioPlayer"), "sidebar uses global player session");
  assert(bar.includes("useGlobalAudioPlayer"), "desktop bar uses global player session");
}

testProviderWiring();
testSharedPlayerState();

console.log("guest-player-bootstrap-unit: ok");
