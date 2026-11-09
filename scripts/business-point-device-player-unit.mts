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
  businessGuestCoffeeHallRedirect,
  businessMusicRoute,
  pointDeviceWorkspaceAccess,
} from "../src/lib/business-app/point-device";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// /music: device session wins; only a visitor with neither session nor device gets the guest preview.
assert.equal(POINT_DEVICE_PLAYER_PATH, "/music");
assert.equal(businessMusicRoute({ signedIn: false, pointDevice: true }), "player", "no account + device -> venue player");
assert.equal(businessMusicRoute({ signedIn: true, pointDevice: true }), "player", "other account + device -> venue player");
assert.equal(businessMusicRoute({ signedIn: true, pointDevice: false }), "player");
assert.equal(businessMusicRoute({ signedIn: false, pointDevice: false }), "guest");
assert.equal(businessMusicRoute({ signedIn: false, pointDevice: false, hallDevice: false, hallLocked: false }), "guest", "plain guest unchanged");

// t1299u: a hall device whose cookie is revoked or unchecked (venue not loaded) never gets the guest demo.
for (const signedIn of [false, true]) {
  assert.notEqual(businessMusicRoute({ signedIn, pointDevice: false, hallDevice: true, hallLocked: true }), "guest");
  assert.equal(businessMusicRoute({ signedIn, pointDevice: false, hallDevice: true, hallLocked: true }), "hall_reconnect", "locked hall -> reconnect");
  assert.equal(businessMusicRoute({ signedIn, pointDevice: true, hallDevice: true, hallLocked: true }), "player", "alive hall -> venue player");
}
assert.equal(businessMusicRoute({ signedIn: false, pointDevice: false, hallDevice: true }), "hall_reconnect", "cookie without account -> reconnect");
assert.equal(businessMusicRoute({ signedIn: true, pointDevice: false, hallDevice: true, hallLocked: false }), "player", "owner unlock on the hall device -> owner player");
for (const hallDevice of [false, true]) for (const hallLocked of [false, true]) for (const signedIn of [false, true]) {
  if (hallDevice || hallLocked) assert.notEqual(businessMusicRoute({ signedIn, pointDevice: false, hallDevice, hallLocked }), "guest");
}

// Guest coffee page (and coffee host `/`): a hall device is sent to the venue player.
assert.equal(businessGuestCoffeeHallRedirect(true), "/music");
assert.equal(businessGuestCoffeeHallRedirect(false), null, "a real guest keeps the 12-track intro");

// Home on the device is the hall home (cabinet-mode.ts), whatever account is signed in; see the home check below.

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
// t1299u: unsigned hall device with a revoked / unchecked cookie (pointReports false, side venue).
const shellPointFlag = (pointReports: boolean, side: "owner" | "venue") => pointReports || side === "venue";
assert.equal(businessNavHref(musicItem, resolveBusinessAccess(anonymous, shellPointFlag(false, "venue"))), "/music", "revoked hall -> /music");
assert.equal(businessNavHref(musicItem, resolveBusinessAccess(anonymous, shellPointFlag(false, "owner"))), "/guest/coffee", "no cookie -> guest coffee");

// Static contracts on the server routes.
const music = read("src/app/business-app/music/page.tsx");
assert.match(music, /loadPointDeviceVenue\(\)/);
assert.match(music, /hallDevice: cabinet\.pointAlive,/);
assert.match(music, /hallLocked: cabinet\.mode === "point",/);
assert.match(music, /if \(route === "guest"\) redirect\("\/guest\/coffee"\);/);
assert.match(music, /if \(route === "hall_reconnect"\) return <BusinessHallReconnect revoked=\{cabinet\.deviceStatus === "revoked"\} \/>;/);
assert.ok(music.indexOf("loadBusinessCabinetMode()") < music.indexOf('redirect("/guest/coffee")'), "hall check before the guest redirect");

const guestCoffee = read("src/app/business-app/guest/coffee/page.tsx");
const guestBody = guestCoffee.slice(guestCoffee.indexOf("export default async function BusinessGuestCoffeePage"));
assert.ok(
  guestBody.indexOf("businessGuestCoffeeHallRedirect(await businessHallDeviceCookie())") > 0 &&
    guestBody.indexOf("businessGuestCoffeeHallRedirect(") < guestBody.indexOf("<BusinessMusicSection"),
  "hall cookie is checked before the guest studio renders",
);
assert.match(guestBody, /if \(hallRedirect\) redirect\(hallRedirect\);/);

const reconnect = read("src/components/business-app/BusinessHallReconnect.tsx");
assert.match(reconnect, /href="\/point"/);
assert.doesNotMatch(reconnect, /BusinessSoundStudio|BusinessMusicSection|Собрать атмосферу|799|7 дней|guest\/coffee/);
assert.doesNotMatch(reconnect, />\s*[A-Za-z][A-Za-z ,.!?]*\s*</, "no English text on screen");

const layout = read("src/app/business-app/layout.tsx");
assert.match(layout, /!cabinet\.pointAlive && resolveBusinessAccess\(domain\)\.level === "guest"/, "no guest limit strip on any hall device");
assert.doesNotMatch(music, /if \(!user\) redirect/, "no account alone must not send a device to the guest page");

const home = read("src/app/business-app/page.tsx");
assert.match(home, /if \(cabinet\.mode === "point"\) return <BusinessHomePage pointLinked=\{null\} \/>;/);
assert.doesNotMatch(home, /redirect\(/, "the device stays on Home, it does not jump to the player");

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
assert.match(shell, /resolveBusinessAccess\(useBusinessDomain\(\), pointReports \|\| cabinet\.side === "venue"\)/);
assert.match(shell, /!access\.pointDevice/);
assert.match(read("src/components/business-app/BusinessBottomNav.tsx"), /resolveBusinessAccess\(useBusinessDomain\(\), cabinet\.side === "venue"\)/);
assert.match(read("src/components/business-app/BusinessSidebar.tsx"), /resolveBusinessAccess\(domain, cabinet\.side === "venue"\)/);

for (const source of [music, home, point, deviceServer, guestCoffee, reconnect]) assert.doesNotMatch(source, /\u2014/, "en dash only");

console.log("business-point-device-player-unit: ok");
