#!/usr/bin/env node
/**
 * Focused checks for public `/p/[slug]` listener shell + cover playback.
 */
import { existsSync, readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

const page = read("src/app/(platform)/p/[slug]/page.tsx");
const layout = read("src/app/(platform)/p/layout.tsx");
const view = read("src/components/playlists/PublicPlaylistPageView.tsx");
const items = read("src/components/playlists/PublicPlaylistItems.tsx");
const row = read("src/components/playlists/PlaylistItemRow.tsx");
const playAll = read("src/components/playlists/PlayAllButton.tsx");
const listenerLayout = read("src/app/(platform)/(listener)/layout.tsx");
const listenerShell = read("src/components/listener/ListenerAppShell.tsx");
const desktopSidebar = read("src/components/listener/DesktopSidebar.tsx");
const desktopRight = read("src/components/listener/DesktopRightColumn.tsx");
const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
const ownerDetail = read("src/components/playlists/PlaylistDetailClient.tsx");
const editorialEditor = read(
  "src/components/playlists/editorial/EditorialPlaylistEditorClient.tsx",
);
const listenPage = read(
  "src/app/(platform)/(listener)/listens/[slug]/page.tsx",
);

assert(existsSync("src/app/(platform)/p/layout.tsx"), "public /p layout exists");
assert(
  layout.includes("ListenerAppShell") && layout.includes('mode="default"'),
  "/p layout reuses ListenerAppShell default mode",
);
assert(
  layout.includes("getListenerShellData"),
  "/p layout uses shared listener shell data",
);
assert(
  !layout.includes("max-w-[430px]"),
  "/p layout does not fork a mobile-width desktop column",
);

assert(page.includes("PublicPlaylistPageView"), "/p still renders public view");
assert(page.includes("force-dynamic"), "/p stays dynamic");
assert(page.includes("isPlatformEditorialPublicPlaylist"), "editorial /p metadata remains");
assert(page.includes("buildPublicPlaylistJsonLd"), "JSON-LD remains");
assert(!page.includes("BottomNav"), "/p page no longer mounts its own BottomNav");
assert(
  !page.includes("max-w-[430px]"),
  "/p page no longer wraps a mobile-only column",
);
assert(
  !page.includes("platformMobileShellClass"),
  "/p page defers mobile chrome to the shared shell",
);
assert(!page.includes("/listens/"), "/p does not canonicalize onto /listens");

assert(
  listenerLayout.includes("ListenerAppShell") &&
    listenerLayout.includes('mode="default"'),
  "shared listener layout remains the default shell source",
);
assert(
  listenerShell.includes("DesktopSidebar") &&
    listenerShell.includes("DesktopRightColumn") &&
    listenerShell.includes("DesktopPlayerBar"),
  "ListenerAppShell still owns sidebar + right player + desktop bar",
);
assert(
  desktopSidebar.includes("export default function DesktopSidebar"),
  "DesktopSidebar is reused, not copied",
);
assert(
  desktopRight.includes("export default function DesktopRightColumn"),
  "DesktopRightColumn is reused, not copied",
);
assert(
  !view.includes("DesktopSidebar") &&
    !view.includes("DesktopRightColumn") &&
    !items.includes("DesktopRightColumn"),
  "public playlist view does not fork a right-side player",
);

assert(view.includes("PlayAllButton"), "Слушать всё remains on /p");
assert(view.includes("PublicPlaylistItems"), "/p rows go through public items");
assert(
  view.includes("Плейлист АудиоЛада") && view.includes("Публичный плейлист"),
  "user and editorial /p labels still render",
);
assert(playAll.includes("loadPlaylistQueue"), "Play All still uses the global queue");
assert(playAll.includes("Слушать всё"), "Play All label remains");

assert(items.includes("loadPlaylistQueue"), "row play uses the existing queue");
assert(
  items.includes("buildPublicPlaylistQueue"),
  "row play builds the public playlist queue",
);
assert(
  items.includes("coverPlayback"),
  "public rows pass cover playback to PlaylistItemRow",
);
assert(
  items.includes("handlePlayPause"),
  "tapping the current cover pauses via the existing engine",
);
assert(!items.includes("<audio"), "public items do not create a second player");
assert(provider.includes("<audio"), "single persistent audio remains in the global provider");

assert(
  row.includes("coverPlayback") &&
    row.includes('data-playlist-row-play={coverPlayback ? "cover" : "circle"}'),
  "PlaylistItemRow distinguishes cover vs circle play",
);
assert(
  row.includes("{coverPlayback ? null : playEnabled ? ("),
  "cover playback removes the separate Play circle",
);
assert(
  row.includes('aria-label={`Слушать ${item.title}`}'),
  "default circle play a11y remains for owner/editorial rows",
);
assert(
  row.includes("h-14 w-14") && row.includes("rounded-[12px]"),
  "cover stays a square thumbnail",
);

assert(
  ownerDetail.includes("<PlaylistItemRow") &&
    !ownerDetail.includes("coverPlayback"),
  "owner playlist rows keep the default Play circle",
);
assert(
  editorialEditor.includes("<PlaylistItemRow") &&
    !editorialEditor.includes("coverPlayback"),
  "editorial workspace rows keep the default Play circle",
);

assert(
  listenPage.includes("loadListenPageData"),
  "Stage 3 /listens page is untouched",
);
assert(
  !items.includes("stay_on_source"),
  "public /p rows do not use listen-page stay_on_source policy",
);

console.log("public-playlist-page-shell-unit: ok");
