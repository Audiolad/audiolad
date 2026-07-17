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

function testGuestHomeWiring() {
  const guestHome = readFileSync(
    "/var/www/audiolad/src/components/home/GuestHome.tsx",
    "utf8",
  );
  const provider = readFileSync(
    "/var/www/audiolad/src/components/audio/GlobalAudioPlayerProvider.tsx",
    "utf8",
  );

  assert(guestHome.includes("GuestHomePlayerSeed"), "GuestHome mounts seed");
  assert(guestHome.includes("pickGuestDefaultListenTarget"), "GuestHome picks first free product");
  assert(!guestHome.includes("Женские деньги"), "GuestHome does not hardcode product title");
  assert(provider.includes("peekGuestPlayerFallbackTarget"), "provider reads guest fallback");
  assert(
    provider.includes("GUEST_PLAYER_FALLBACK_REGISTERED_EVENT"),
    "provider listens for late guest fallback registration",
  );
  assert(provider.includes("applyGuestPlayerFallback"), "provider applies guest fallback on demand");
  assert(provider.includes("fetchListenSessionPayload"), "provider loads guest session payload");
  assert(provider.includes("requestAutoplay: false"), "guest restore does not autoplay");
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

testGuestHomeWiring();
testSharedPlayerState();

console.log("guest-player-bootstrap-unit: ok");
