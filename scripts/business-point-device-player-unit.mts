/**
 * Paired venue device opens the venue player, never the guest preview (follow-up to #1064).
 * Bug: a device paired while another account (or none) was signed in landed on
 * «Настройте звучание вашей кофейни» (/guest/coffee) instead of the venue player.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { businessNavHref, resolveBusinessAccess } from "../src/lib/business-app/access";
import type { BusinessOwnerHomeContext } from "../src/lib/business-app/domain";
import {
  POINT_DEVICE_PLAYER_PATH,
  businessMusicRoute,
  pointDeviceHomeRedirect,
  pointDeviceWorkspaceAccess,
} from "../src/lib/business-app/point-device";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// /music: device session wins; only a visitor with neither session nor device gets the guest preview.
assert.equal(POINT_DEVICE_PLAYER_PATH, "/music");
assert.equal(businessMusicRoute({ signedIn: false, pointDevice: true }), "player", "no account + device -> venue player");
assert.equal(businessMusicRoute({ signedIn: true, pointDevice: true }), "player", "other account + device -> venue player");
assert.equal(businessMusicRoute({ signedIn: true, pointDevice: false }), "player");
assert.equal(businessMusicRoute({ signedIn: false, pointDevice: false }), "guest");

// Home: the device opens its player unless the signed-in account manages this same venue.
const venue = { locationId: "loc-a" };
assert.equal(pointDeviceHomeRedirect(null, null), null);
assert.equal(pointDeviceHomeRedirect(null, "loc-b"), null);
assert.equal(pointDeviceHomeRedirect(venue, null), "/music", "no account / non-member account");
assert.equal(pointDeviceHomeRedirect(venue, "loc-b"), "/music", "member of another venue");
assert.equal(pointDeviceHomeRedirect(venue, "loc-a"), null, "owner of the same venue keeps Home");

// Venue owner's access drives the device player; nothing ever maps to the guest «anonymous».
assert.deepEqual(pointDeviceWorkspaceAccess({ mode: "trial", endsAt: "2026-11-28T00:00:00.000Z" }), {
  status: "trial", endsAt: "2026-11-28T00:00:00.000Z", playbackUntil: "2026-11-28T00:00:00.000Z",
});
assert.deepEqual(
  pointDeviceWorkspaceAccess({ mode: "grace", endsAt: "2026-11-28T00:00:00.000Z", graceEndsAt: "2026-11-30T00:00:00.000Z" }),
  { status: "grace", endsAt: "2026-11-28T00:00:00.000Z", playbackUntil: "2026-11-30T00:00:00.000Z" },
);
assert.equal(pointDeviceWorkspaceAccess({ mode: "none", endsAt: null }).status, "unavailable");
assert.equal(pointDeviceWorkspaceAccess({ mode: "offer", endsAt: "2026-10-01T00:00:00.000Z" }).status, "offer");
for (const mode of ["none", "trial", "paid", "grace", "offer"] as const) {
  assert.notEqual(pointDeviceWorkspaceAccess({ mode, endsAt: null }).status, "anonymous");
}

// Chrome: the Music link of a device goes to the player, not to /guest/coffee.
const anonymous = { status: "anonymous" } as BusinessOwnerHomeContext;
const otherAccount = { status: "authenticated", organizationId: null, location: null } as unknown as BusinessOwnerHomeContext;
const musicItem = { href: "/music", guestHref: "/guest/coffee" };
assert.equal(businessNavHref(musicItem, resolveBusinessAccess(anonymous)), "/guest/coffee", "plain guest unchanged");
assert.equal(businessNavHref(musicItem, resolveBusinessAccess(anonymous, true)), "/music");
assert.equal(businessNavHref(musicItem, resolveBusinessAccess(otherAccount, true)), "/music");
assert.equal(resolveBusinessAccess(otherAccount, true).pointDevice, true);
assert.equal(resolveBusinessAccess(otherAccount).pointDevice, undefined);

// Static contracts on the server routes.
const music = read("src/app/business-app/music/page.tsx");
assert.match(music, /loadPointDeviceVenue\(\)/);
assert.match(music, /businessMusicRoute\(\{ signedIn: Boolean\(user\), pointDevice \}\) === "guest"\) redirect\("\/guest\/coffee"\)/);
assert.doesNotMatch(music, /if \(!user\) redirect/, "no account alone must not send a device to the guest page");

const home = read("src/app/business-app/page.tsx");
assert.match(home, /pointDeviceHomeRedirect\(await loadPointDeviceVenue\(\), locationId\)/);

const loader = read("src/lib/business-workspace/load.server.ts");
const page = loader.slice(loader.indexOf("export async function loadWorkspacePage"));
assert.ok(
  page.indexOf("loadPointDeviceVenue()") > 0 && page.indexOf("loadPointDeviceVenue()") < page.indexOf("auth.getUser()"),
  "player page: device session is checked before the signed-in account",
);
const actor = loader.slice(loader.indexOf("export async function loadWorkspaceActor"));
assert.ok(
  actor.indexOf("loadPointDeviceVenue()") > 0 && actor.indexOf("loadPointDeviceVenue()") < actor.indexOf("auth.getUser()"),
  "player APIs: device session is checked before the signed-in account",
);
const devicePage = loader.slice(
  loader.indexOf("async function loadPointDeviceWorkspacePage"),
  loader.indexOf("export async function loadWorkspacePage"),
);
assert.doesNotMatch(devicePage, /activateBusinessTrial|recordAccessActivity|readPlayback/, "device never issues a gift or writes analytics");
assert.match(devicePage, /locationId: venue\.locationId/);

const deviceServer = read("src/lib/business-app/point-device.server.ts");
assert.match(deviceServer, /^import "server-only";/);
assert.match(deviceServer, /"get_business_point_sound_settings", \{ p_token: token \}/);
assert.match(deviceServer, /isPointToken\(token\)/);
assert.match(deviceServer, /status !== "active"/);
assert.match(deviceServer, /peekBusinessAccessFor\(/);
assert.doesNotMatch(deviceServer, /activateBusinessTrial|insertGrant|console\./);

const state = read("src/app/api/business/workspace/state/route.ts");
assert.match(state, /const account = actor\.ok && !actor\.device \? actor : null;/);
assert.doesNotMatch(state, /userId: actor\.userId,\n\s*spaceId/, "device playback is not saved under the signed-in account");

const point = read("src/app/business-app/point/page.tsx");
assert.match(point, /window\.location\.assign\(POINT_DEVICE_PLAYER_PATH\)/, "after the code the device opens the player");
assert.match(point, /Открыть плеер/);
assert.doesNotMatch(point, /guest\/coffee/);

const shell = read("src/components/business-app/BusinessAppShell.tsx");
assert.match(shell, /resolveBusinessAccess\(useBusinessDomain\(\), pointReports\)/);
assert.match(shell, /!access\.pointDevice/);
assert.match(read("src/components/business-app/BusinessBottomNav.tsx"), /resolveBusinessAccess\(useBusinessDomain\(\), pointMode\)/);
assert.match(read("src/components/business-app/BusinessSidebar.tsx"), /resolveBusinessAccess\(domain, pointMode\)/);

for (const source of [music, home, point, deviceServer]) assert.doesNotMatch(source, /\u2014/, "en dash only");

console.log("business-point-device-player-unit: ok");
