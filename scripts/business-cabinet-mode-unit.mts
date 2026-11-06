/**
 * One permission table for the owner and the hall device (Sergey 03.11.2026 16:57).
 * Pure table checks plus wiring: nav, sidebar, screens and server guards read the same rows.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BUSINESS_CABINET_PERMISSIONS,
  BUSINESS_OWNER_UNLOCK_PATH,
  BUSINESS_OWNER_UNLOCK_SECONDS,
  BUSINESS_VENUE_FALLBACK_PATH,
  businessCabinetCan,
  businessCabinetSections,
  businessCabinetSide,
  businessOwnerUnlockUntil,
  businessPointReports,
  isBusinessOwnerOnlyPath,
  resolveBusinessCabinetMode,
  safeBusinessNextPath,
} from "../src/lib/business-app/cabinet-mode";
import { BUSINESS_PUBLIC_PATH_REWRITES } from "../src/lib/business-app/host";
import { businessNavItemsForSections } from "../src/lib/business-app/nav";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Sides: preview reads exactly the hall device's column.
assert.equal(businessCabinetSide("owner"), "owner");
assert.equal(businessCabinetSide("point"), "venue");
assert.equal(businessCabinetSide("preview"), "venue");
for (const permission of Object.keys(BUSINESS_CABINET_PERMISSIONS) as (keyof typeof BUSINESS_CABINET_PERMISSIONS)[]) {
  for (const pointCanEdit of [true, false]) {
    assert.equal(
      businessCabinetCan({ mode: "preview", pointCanEdit }, permission),
      businessCabinetCan({ mode: "point", pointCanEdit }, permission),
      `preview = point for ${permission}`,
    );
  }
}

// Menus.
assert.deepEqual(businessCabinetSections({ mode: "owner" }), ["home", "music", "settings", "documents", "profile"]);
assert.deepEqual(businessCabinetSections({ mode: "point", pointCanEdit: true }), ["home", "music", "settings", "documents", "help"]);
assert.deepEqual(businessCabinetSections({ mode: "point", pointCanEdit: false }), ["home", "music", "documents", "help"]);
assert.deepEqual(businessCabinetSections({ mode: "owner", pointCanEdit: false }), ["home", "music", "settings", "documents", "profile"], "the switch is for the device only");
assert.deepEqual(
  businessNavItemsForSections(businessCabinetSections({ mode: "point" })).map((item) => item.title),
  ["Главная", "Музыка", "Настройка", "Документы", "Помощь"],
);

// Hidden on the venue side.
for (const permission of [
  "accessCard", "accessLine", "payLink", "offerAccept", "sectionProfile", "sectionOnboarding", "trackRatings",
  "daypartSettings", "atmosphereRebuild", "venueRemote", "deviceManagement", "stickerDownload", "ownerChecklist", "profileEdit", "signOut",
] as const) {
  assert.equal(businessCabinetCan({ mode: "point" }, permission), false, `point: no ${permission}`);
  assert.equal(businessCabinetCan({ mode: "owner" }, permission), true, `owner: ${permission}`);
}
// Shown on the venue side.
for (const permission of ["inspectorCard", "inspectorQr", "playbackReport", "playPause", "hallControls", "disconnectThisDevice", "sectionHelp"] as const) {
  assert.equal(businessCabinetCan({ mode: "point" }, permission), true, `point: ${permission}`);
}
assert.equal(businessCabinetCan({ mode: "owner" }, "disconnectThisDevice"), false);
assert.equal(businessCabinetCan({ mode: "point", pointCanEdit: false }, "atmosphereSettings"), false);
assert.equal(businessCabinetCan({ mode: "point" }, "atmosphereSettings"), true, "missing switch stays allowed");

assert.ok(isBusinessOwnerOnlyPath("/profile"));
assert.ok(isBusinessOwnerOnlyPath("/onboarding/x"));
assert.ok(!isBusinessOwnerOnlyPath("/profiles"));
assert.equal(BUSINESS_VENUE_FALLBACK_PATH, "/music");

// Mode resolution.
const facts = { pointAlive: false, ownerUnlocked: false, previewChosen: false, canPreview: true };
assert.equal(resolveBusinessCabinetMode(facts), "owner");
assert.equal(resolveBusinessCabinetMode({ ...facts, previewChosen: true }), "preview");
assert.equal(resolveBusinessCabinetMode({ ...facts, previewChosen: true, canPreview: false }), "owner", "no account, no preview");
assert.equal(resolveBusinessCabinetMode({ ...facts, pointAlive: true }), "point", "a signed-in owner on the device is still the point");
assert.equal(resolveBusinessCabinetMode({ ...facts, pointAlive: true, previewChosen: true }), "point");
assert.equal(resolveBusinessCabinetMode({ ...facts, pointAlive: true, ownerUnlocked: true }), "owner", "fresh password opens the owner cabinet");
assert.equal(businessPointReports({ pointAlive: true }), true, "the hall keeps reporting during an owner unlock");
assert.equal(businessPointReports({ pointAlive: false }), false, "preview never reports as the hall device");

// Owner unlock from verified claims (amr password time).
const now = 1_800_000_000;
assert.equal(BUSINESS_OWNER_UNLOCK_SECONDS, 900);
assert.equal(businessOwnerUnlockUntil({ amr: [{ method: "password", timestamp: now - 60 }] }, now), now - 60 + 900);
assert.equal(businessOwnerUnlockUntil({ amr: [{ method: "password", timestamp: now - 901 }] }, now), null, "15 minutes, then the point again");
assert.equal(businessOwnerUnlockUntil({ amr: [{ method: "otp", timestamp: now }] }, now), null, "only a password entry unlocks");
assert.equal(businessOwnerUnlockUntil({ amr: [{ method: "password", timestamp: now + 3600 }] }, now), null, "future time is not trusted");
assert.equal(businessOwnerUnlockUntil({ amr: [{ method: "password", timestamp: "x" }] }, now), null);
assert.equal(businessOwnerUnlockUntil({}, now), null);
assert.equal(businessOwnerUnlockUntil(null, now), null);
assert.equal(
  businessOwnerUnlockUntil({ amr: [{ method: "oauth", timestamp: now }, { method: "password", timestamp: now - 10 }] }, now),
  now - 10 + 900,
);

// Safe next.
assert.equal(safeBusinessNextPath("/profile"), "/profile");
assert.equal(safeBusinessNextPath("/documents?at=1"), "/documents?at=1");
for (const bad of ["https://evil.example", "//evil.example", "/\\evil", "profile", "", undefined, 5, "/a\nb", `/${"x".repeat(600)}`]) {
  assert.equal(safeBusinessNextPath(bad), "/", `unsafe next: ${String(bad).slice(0, 20)}`);
}
assert.equal(BUSINESS_PUBLIC_PATH_REWRITES[BUSINESS_OWNER_UNLOCK_PATH], "/business-app/owner");

// Wiring: nav, sidebar, screens and server guards read the same table.
const nav = read("src/components/business-app/BusinessBottomNav.tsx");
assert.match(nav, /businessNavItemsForSections\(cabinet\.sections\)/);
const sidebar = read("src/components/business-app/BusinessSidebar.tsx");
assert.match(sidebar, /cabinet\.sections/);
const server = read("src/lib/business-app/cabinet-mode.server.ts");
assert.match(server, /^import "server-only";/);
assert.match(server, /getClaims\(\)/, "unlock reads verified claims, not a cookie of our own");
assert.match(server, /redirect\(BUSINESS_VENUE_FALLBACK_PATH\)/);
assert.match(read("src/app/business-app/profile/page.tsx"), /requireBusinessCabinetPermission\("sectionProfile"\)/);
assert.match(read("src/app/business-app/onboarding/page.tsx"), /requireBusinessCabinetPermission\("sectionOnboarding"\)/);
assert.match(read("src/app/business-app/settings/page.tsx"), /businessCabinetCan\(\{ mode: cabinet\.mode, pointCanEdit \}, "sectionSettings"\)\) redirect\(BUSINESS_VENUE_FALLBACK_PATH\)/);
const route = read("src/app/api/business/point/route.ts");
assert.match(route, /OWNER_ACTIONS = new Set\(\["create", "revoke", "link", "permission", "enqueue"\]\)/);
assert.match(route, /OWNER_ACTIONS\.has\(body\.action\) && \(await businessHallDeviceLocked\(\)\)/);
assert.match(route, /body\.action === "disconnect-self"/);
assert.match(route, /\.eq\("token_hash", `\\\\x\$\{pointTokenHashHex\(token\)\}`\)/, "disconnect closes only this device's session");
for (const path of [
  "src/app/business-app/actions.ts",
  "src/app/business-app/sound-settings-actions.ts",
  "src/app/business-app/profile/actions.ts",
  "src/app/api/business/venue-licence/sticker/route.ts",
]) {
  assert.match(read(path), /businessHallDeviceLocked\(\)/, `${path}: owner action guarded on the hall device`);
}
// «Пересобрать атмосферу» (04.11.2026): owner only, refused on the hall device and in the preview.
assert.equal(businessCabinetCan({ mode: "owner" }, "atmosphereRebuild"), true);
assert.equal(businessCabinetCan({ mode: "preview" }, "atmosphereRebuild"), false);
assert.equal(businessCabinetCan({ mode: "point", pointCanEdit: true }, "atmosphereRebuild"), false, "the hall switch never unlocks a rebuild");
{
  const actions = read("src/app/business-app/sound-settings-actions.ts");
  const rebuild = actions.slice(actions.indexOf("export async function rebuildLocationAtmosphere"));
  assert.match(rebuild, /const \{ mode \} = await loadBusinessCabinetMode\(\);\s*if \(!businessCabinetCan\(\{ mode \}, "atmosphereRebuild"\)\) return \{ ok: false, error: REBUILD_OWNER_ONLY \};\s*return writeLocationSound\(/, "guard before the write");
}
// Codex review1 (03.11.2026): fail closed, no reusable owner session in the hall, every owner door guarded.
const pointSession = read("src/lib/business-app/point-session.server.ts");
assert.match(pointSession, /if \(error \|\| typeof data !== "boolean"\) return "unknown";/);
assert.match(pointSession, /return \(await businessPointDeviceStatus\(\)\) !== "none";/, "alive, revoked or unchecked device cookie: hall device");
assert.match(server, /const pointAlive = await businessHallDeviceCookie\(\);/);
assert.match(server, /staleOwnerSession = pointAlive && ownerUnlockUntil === null/);
const banner = read("src/components/business-app/BusinessCabinetModeBanner.tsx");
assert.match(banner, /signOut\(\{ scope: "local" \}\)/, "this browser only");
assert.match(banner, /if \(!staleOwnerSession\) return;/);
assert.match(banner, /void signOutThisBrowser\(hallSessionId\)\.then\(\(\) => router\.refresh\(\)\)/, "unlock end signs the hall browser out");
// Codex review2: checked sign-out before the revoke; revoked cookie stays until a fresh password.
assert.match(route, /const \{ error: signOutError \} = await supabase\.auth\.signOut\(\{ scope: "local" \}\);\n\s*if \(signOutError\) return json[\s\S]*?revoked_at[\s\S]*?response\.cookies\.set\(BUSINESS_POINT_COOKIE, ""/, "disconnect never promotes a kept account session");
assert.match(route, /body\.action === "forget-revoked"[\s\S]{0,500}loadBusinessOwnerUnlockUntil\(\)\) === null\) return json[\s\S]{0,200}businessPointDeviceStatus\(\)\) !== "revoked"/);
assert.match(server, /if \(staleOwnerSession\) await revokeStaleHallSession\(\);/, "stale hall session ended on the auth server, no JS needed");
assert.match(server, /auth\.admin\.signOut\(jwt, "local"\)/);
assert.match(banner, /signOutThisBrowser\(hallSessionId\)/, "cleanup bound to the stale session id");
assert.match(banner, /current !== onlySessionId\) return;/);
// Codex review3: no automatic forget; cleanup and password sign-in serialized; admin sign-out checked.
assert.doesNotMatch(read("src/components/business-app/BusinessOwnerUnlockForm.tsx"), /forget-revoked/, "unlock never makes a hall device permanent owner");
assert.match(read("src/components/business-app/BusinessOwnerUnlockForm.tsx"), /runHallAuthExclusive\(\(\) => createClient\(\)\.auth\.signInWithPassword/);
assert.match(banner, /await runHallAuthExclusive\(async \(\) => \{/);
assert.match(banner, /cabinet\.hallDeviceRevoked \? \([\s\S]*?action: "forget-revoked"[\s\S]*?Забыть устройство/, "permanent forget only by an explicit button");
assert.match(server, /const \{ error \} = await createServiceRoleClient\(\)\.auth\.admin\.signOut\(jwt, "local"\);\n\s*if \(error\)/);
assert.match(read("src/app/business-app/layout.tsx"), /businessPointReports\(cabinet\) && cabinet\.deviceStatus === "alive"/, "only a live device reports");
assert.match(read("src/lib/business-app/hall-auth-lock.ts"), /locks\.request\(hallAuthLockName, \{ mode: "exclusive" \}/, "cleanup and sign-in serialized across tabs");
const workspaceLoad = read("src/lib/business-workspace/load.server.ts");
assert.equal((workspaceLoad.match(/if \(await businessHallDeviceLocked\(\)\) return/g) ?? []).length, 2, "workspace page and actor: no account fallback on the hall device");
assert.match(read("src/app/api/business/guest-start/route.ts"), /async function handle\(request: Request\) \{\n[\s\S]{0,200}if \(await businessHallDeviceLocked\(\)\)/, "no new venue from the hall device, before any sign-in");
assert.match(read("src/lib/business-app/spa-pilot.ts"), /loadSpaPilotContext\(\)[^{]*\{\n[^\n]*\n  if \(await businessHallDeviceLocked\(\)\) return null;/);
assert.match(read("src/lib/business-app/onboarding-preview.server.ts"), /if \(await businessHallDeviceLocked\(\)\) return "no_access";/);
for (const path of ["src/app/api/business/subscription/checkout/route.ts", "src/app/api/business/subscription/accept/route.ts", "src/lib/business-app/domain.ts"]) {
  assert.match(read(path), /await businessHallDeviceLocked\(\)/, `${path}: payment follows the unlock, fails closed`);
  assert.doesNotMatch(read(path), /businessPointSessionAlive/);
}
assert.equal((read("src/app/business-app/actions.ts").match(/businessHallDeviceLocked\(\)/g) ?? []).length, 4, "bootstrap, provision, eligibility, save venue");
const documents = read("src/app/business-app/documents/page.tsx");
assert.match(documents, /<Form action="\/documents"/, "report form is a soft navigation: the hall music keeps playing");
assert.doesNotMatch(documents, /<form method="get"/);
assert.match(documents, /businessCabinetCan\(\{ mode \}, "stickerDownload"\)/);
assert.match(documents, /pointVenue\?\.licencePublicId/, "the point QR comes from the device session");
const unlock = read("src/components/business-app/BusinessOwnerUnlockForm.tsx");
assert.match(unlock, /signInWithPassword/);
assert.match(unlock, /business-app-btn-cta/);
assert.match(unlock, /router\.replace\(safeBusinessNextPath\(next\)\)/, "soft navigation keeps the hall player");
const help = read("src/components/business-app/BusinessHallHelp.tsx");
assert.match(help, /Отключить это устройство/);
assert.match(help, /action: "disconnect-self"/);
const workspace = read("src/components/business-app/workspace/BusinessWorkspace.tsx");
assert.match(workspace, /cabinet\.can\("trackRatings"\) \? <CafeTrackFeedback/);
assert.match(workspace, /cabinet\.can\("payLink"\)/);

for (const path of [
  "src/lib/business-app/cabinet-mode.ts",
  "src/components/business-app/BusinessHallHome.tsx",
  "src/components/business-app/BusinessHallHelp.tsx",
  "src/components/business-app/BusinessCabinetModeBanner.tsx",
  "src/components/business-app/BusinessOwnerUnlockForm.tsx",
  "src/app/business-app/owner/page.tsx",
]) {
  assert.doesNotMatch(read(path), /\u2014/, `${path}: en dash only`);
}

console.log("business-cabinet-mode-unit: ok");
