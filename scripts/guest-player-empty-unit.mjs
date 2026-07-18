#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

const root = "/var/www/audiolad";

assert.equal(existsSync(`${root}/src/app/api/listen/welcome-session/route.ts`), false);
assert.equal(existsSync(`${root}/src/lib/listen/welcome-practice.ts`), false);
assert.equal(existsSync(`${root}/src/lib/listen/initial-session-policy.ts`), false);

const provider = read(`${root}/src/components/audio/GlobalAudioPlayerProvider.tsx`);
const guestHome = read(`${root}/src/components/home/GuestHome.tsx`);
const desktopBar = read(`${root}/src/components/listener/DesktopPlayerBar.tsx`);
const miniPlayer = read(`${root}/src/components/audio/GlobalMiniPlayer.tsx`);

assert(!provider.includes("welcome-session"), "provider does not fetch welcome session");
assert(!provider.includes("applyWelcomeSession"), "provider has no welcome bootstrap");
assert(!provider.includes("shouldLoadWelcomeSession"), "provider has no welcome gate");
assert(!guestHome.includes("GuestHomePlayerSeed"), "GuestHome has no client seed");
assert(!guestHome.includes("pickGuestDefaultListenTarget"), "GuestHome has no fallback picker");

const restoreBlock = provider.slice(
  provider.indexOf("async function restoreDesktopPlayerSession"),
  provider.indexOf("void restoreDesktopPlayerSession();"),
);
assert.match(restoreBlock, /readDesktopPlayerLastSession\(\)/, "restore tries persisted session first");
assert.match(restoreBlock, /\/api\/listen\/resume-session/, "restore tries auth resume second");
assert.doesNotMatch(restoreBlock, /welcome-session/, "restore never loads welcome session");
assert.match(restoreBlock, /clearDesktopPlayerLastSession\(\)/, "invalid persisted session is cleared");

assert.match(desktopBar, /return null;/, "desktop bar hidden when session is empty");
assert.match(miniPlayer, /if \(!showMiniPlayer \|\| !session\)/, "mini-player hidden without session");

assert.match(provider, /requestAutoplay: false/, "restore does not autoplay");

console.log("guest-player-empty-unit: ok");
