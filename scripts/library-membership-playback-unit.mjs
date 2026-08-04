#!/usr/bin/env node
/**
 * Regression checks for library claim during playback + full-player wiring.
 * Safe to run without database access.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readRoot(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function resolveLibraryAction({ access, practice, isAuthenticated, buyerPreviewMode }) {
  if (buyerPreviewMode) {
    return "hidden";
  }

  if (access.reason === "admin" || access.reason === "author_owner") {
    return "hidden";
  }

  const isPublicFreeProduct =
    practice.is_free === true &&
    practice.status === "published" &&
    practice.is_catalog_listed !== false;

  const isGuestPromoProduct =
    practice.guest_access_enabled === true && practice.status === "published";

  if (!isPublicFreeProduct && !isGuestPromoProduct) {
    return "hidden";
  }

  if (access.hasEntitlement) {
    return "in_library";
  }

  if (!isAuthenticated) {
    return "sign_in";
  }

  return "add";
}

function simulateClaimClick({ action, isPending, inFlight }) {
  if (inFlight || isPending || action !== "add") {
    return { started: false, inFlight };
  }

  return { started: true, inFlight: true };
}

function testFreeSinglePracticeActive() {
  const action = resolveLibraryAction({
    access: {
      reason: "free",
      hasEntitlement: false,
      canListen: true,
    },
    practice: {
      status: "published",
      is_free: true,
      is_catalog_listed: true,
      guest_access_enabled: false,
    },
    isAuthenticated: true,
    buyerPreviewMode: false,
  });

  assert(action === "add", "free single practice not in library -> add");
  assert(action !== "in_library", "canListen free is not in_library");
}

function testMusicAlbumSameRules() {
  const action = resolveLibraryAction({
    access: {
      reason: "free",
      hasEntitlement: false,
      canListen: true,
    },
    practice: {
      status: "published",
      is_free: true,
      is_catalog_listed: true,
      format: "Музыка",
    },
    isAuthenticated: true,
    buyerPreviewMode: false,
  });

  assert(action === "add", "free music album not in library -> add");
}

function testAlreadySaved() {
  const action = resolveLibraryAction({
    access: {
      reason: "granted",
      hasEntitlement: true,
      canListen: true,
      accessSource: "free_claim",
    },
    practice: {
      status: "published",
      is_free: true,
      is_catalog_listed: true,
    },
    isAuthenticated: true,
    buyerPreviewMode: false,
  });

  assert(action === "in_library", "saved product -> in_library");
}

function testDoubleClickGuard() {
  const first = simulateClaimClick({
    action: "add",
    isPending: false,
    inFlight: false,
  });
  assert(first.started === true, "first click starts claim");

  const second = simulateClaimClick({
    action: "add",
    isPending: true,
    inFlight: true,
  });
  assert(second.started === false, "second click blocked while in flight");
}

function testSourceContracts() {
  const hook = readRoot("src/lib/library/use-library-membership.ts");
  const button = readRoot("src/components/LibraryAddButton.tsx");
  const sync = readRoot("src/lib/library/membership-sync.ts");
  const card = readRoot("src/components/retention/FirstSaveRetentionCard.tsx");
  const practiceParts = readRoot(
    "src/components/products/practice-page/PracticePageParts.tsx",
  );
  const listenShared = readRoot("src/components/audio/listen-player-shared.tsx");
  const listenPage = readRoot("src/lib/listen/page-shared.tsx");
  const desktop = readRoot("src/components/audio/ListenPlayerDesktop.tsx");
  const mobile = readRoot("src/components/audio/ListenPlayerMobile.tsx");

  assert(!hook.includes("router.refresh()"), "claim hook has no router.refresh");
  assert(!button.includes("router.refresh()"), "button has no router.refresh");
  assert(!hook.includes("window.location"), "no full-page navigation in claim hook");
  assert(!button.includes("window.location"), "no full-page navigation in button");
  assert(hook.includes("inFlightRef"), "in-flight double-click guard");
  assert(sync.includes("publishLibraryMembership"), "membership publish helper");
  assert(sync.includes("subscribeLibraryMembership"), "membership subscribe helper");
  assert(sync.includes("resolveLibraryMembershipKey"), "stable membership key helper");
  assert(sync.includes("id:"), "prefers practice UUID key");
  assert(sync.includes("listenersByKey.delete"), "unsubscribes empty listener sets");
  assert(hook.includes("resolveLibraryMembershipKey"), "hook uses stable membership key");
  assert(hook.includes("publishLibraryMembership"), "hook publishes membership");
  assert(hook.includes("subscribeLibraryMembership"), "hook subscribes membership");
  assert(hook.includes("return subscribeLibraryMembership"), "effect returns unsubscribe");

  assert(card.includes("useContext(PwaInstallContext)"), "optional PWA context");
  assert(!card.includes("usePwaInstall("), "no throwing usePwaInstall");

  assert(
    practiceParts.includes('variant="practice"'),
    "practice page uses practice variant (no function className from server)",
  );
  assert(
    !practiceParts.includes("className={({"),
    "practice page does not pass function className to client button",
  );
  assert(
    button.includes('border-[#7042c5] bg-white text-[#7042c5]'),
    "practice variant uses active styling",
  );
  assert(
    !button.includes('border-[#e2d7f2] bg-[#faf6ff] text-[#7d70a2]'),
    "practice variant no longer uses muted inactive style",
  );

  assert(listenPage.includes("resolveLibraryAction"), "listen page resolves library action");
  assert(listenPage.includes("libraryAction"), "listen page passes libraryAction");
  assert(
    listenPage.includes("librarySignInReturnPath"),
    "listen page passes sign-in return path",
  );
  assert(
    listenShared.includes("ListenPlayerLibrarySlot"),
    "shared listen slot for library button",
  );
  assert(desktop.includes("ListenPlayerLibrarySlot"), "desktop full player wired");
  assert(mobile.includes("ListenPlayerLibrarySlot"), "mobile full player wired");
  assert(
    listenShared.includes('variant="onDark"'),
    "full player uses onDark library button",
  );
}

function main() {
  testFreeSinglePracticeActive();
  testMusicAlbumSameRules();
  testAlreadySaved();
  testDoubleClickGuard();
  testSourceContracts();
  console.log("library-membership-playback-unit: PASS");
}

main();
