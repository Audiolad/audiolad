import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const player = read("src/components/business-app/workspace/BusinessCabinetPlayer.tsx");
const route = read("src/app/api/business/point/route.ts");
// 1: public/manual transport checks the server; claimed owner commands keep the raw path.
assert.match(player, /action: "music-change"/);
assert.match(player, /next: deviceNext/);
assert.match(player, /previous: devicePrevious/);
assert.match(player, /playIndex: devicePlayIndex/);
assert.match(player, /nextRef.current = next/);
assert.match(route, /body.action === "music-change"[\s\S]*?pointMusicAllowed\(data\)[\s\S]*?error: POINT_MUSIC_FORBIDDEN }, 403/);
assert.match(read("src/components/business-app/PointDeviceControls.tsx"), /disabled={!player\?\.canChangeMusic}/);
assert.match(read("src/components/business-app/workspace/BusinessWorkspace.tsx"), /previousDisabled={!player.canChangeMusic}/);
assert.match(player, /nextDisabled={pointReports && !pointCanEdit}/);
// 2: confirmations are the only callers of the mutating pairing actions.
const pairing = read("src/components/business-app/PointPairingCard.tsx");
assert.match(pairing, /onClick={\(\) => ask\("revoke"\)}/);
assert.match(pairing, /onNo={\(\) => setConfirm\(null\)}/);
assert.match(pairing, /if \(action === "revoke"\) revoke\(\)/);
const settings = read("src/components/business-app/BusinessPlayerSettings.tsx");
assert.match(settings, /setConfirm\({ text: VENUE_SOUND_CONFIRM, run }\)/);
assert.match(settings, /commitVenue\(\(\) =>/);
assert.match(settings, /cancel: \(\) => resolve\(null\)/);
assert.match(read("src/app/business-app/settings/page.tsx"), /<VenueControlPanel/);
// 3: keepCurrent is unconditional on status and returns before any audio/playhead mutation.
const keep = player.match(/if \(input.keepCurrent\) {([^}]+)}/)?.[1];
assert.ok(keep);
assert.match(keep, /pointKeepCurrentOrder/);
assert.match(keep, /return "applied"/);
assert.doesNotMatch(keep, /playIndex|audio|seekRef|remember|setView|setPlayback/);
// 5/6: both polling and an independent clock timer feed the retrying applier.
assert.match(player, /createPointSoundApplier\(\)/);
assert.match(player, /const clockTimer = window.setInterval/);
assert.match(player, /window.clearInterval\(clockTimer\)/);
assert.doesNotMatch(player, /seenVersion/);
console.log("business-point-device-controls-unit: ok");
