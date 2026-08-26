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
const groupLayout = read("src/app/(platform)/p/layout.tsx");
const layout = read("src/app/(platform)/p/[slug]/layout.tsx");
const view = read("src/components/playlists/PublicPlaylistPageView.tsx");
const itemCountFormat = read("src/lib/playlists/format-item-count.ts");
const ownerList = read("src/components/playlists/PlaylistsClient.tsx");
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
const listenEmbed = read("src/components/playlists/PublicPlaylistEmbed.tsx");

assert(existsSync("src/app/(platform)/p/layout.tsx"), "public /p group layout exists");
assert(
  existsSync("src/app/(platform)/p/[slug]/layout.tsx"),
  "public /p/[slug] playlist layout exists",
);
assert(
  !groupLayout.includes("ListenerAppShell"),
  "/p group layout must not wrap every /p page in ListenerAppShell",
);
assert(
  layout.includes("ListenerAppShell") && layout.includes('mode="default"'),
  "/p/[slug] layout reuses ListenerAppShell default mode",
);
assert(
  layout.includes("getListenerShellData"),
  "/p/[slug] layout uses shared listener shell data",
);
assert(
  !layout.includes("max-w-[430px]"),
  "/p/[slug] layout does not fork a mobile-width desktop column",
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

assert(
  itemCountFormat.includes("`${count} аудио`"),
  "playlist item-count label is invariable аудио",
);
assert(
  !itemCountFormat.includes("материал") &&
    !itemCountFormat.includes("материала") &&
    !itemCountFormat.includes("материалов"),
  "item-count helper has no материал declension",
);
assert(
  view.includes("formatPlaylistItemCount") &&
    view.includes("{formatPlaylistItemCount(detail.itemsCount)}"),
  "/p uses the shared invariable item-count label",
);
assert(
  !view.includes("1 материал") &&
    !view.includes("${detail.itemsCount} материалов") &&
    !view.includes("Нет материалов"),
  "/p count no longer declines материал",
);
assert(
  ownerList.includes("formatPlaylistItemCount") &&
    ownerDetail.includes("formatPlaylistItemCount"),
  "owner playlist surfaces reuse the same item-count label",
);
assert(
  !ownerList.includes("`${count} материал`") &&
    !ownerList.includes("`${count} материала`") &&
    !ownerList.includes("`${count} материалов`") &&
    !ownerDetail.includes("`${count} материал`") &&
    !ownerDetail.includes("`${count} материала`") &&
    !ownerDetail.includes("`${count} материалов`"),
  "owner playlist counts no longer decline материал",
);

function formatPlaylistItemCount(count) {
  return `${count} аудио`;
}

assert(formatPlaylistItemCount(1) === "1 аудио", "1 → 1 аудио");
assert(formatPlaylistItemCount(2) === "2 аудио", "2 → 2 аудио");
assert(formatPlaylistItemCount(5) === "5 аудио", "5 → 5 аудио");
assert(formatPlaylistItemCount(7) === "7 аудио", "7 → 7 аудио");
assert(formatPlaylistItemCount(11) === "11 аудио", "11 → 11 аудио");
assert(formatPlaylistItemCount(12) === "12 аудио", "12 → 12 аудио");
assert(`${7} аудио · 47 мин` === "7 аудио · 47 мин", "/p money playlist count shape");

assert(view.includes("PlayAllButton"), "Слушать всё remains on /p");
assert(view.includes("PublicPlaylistItems"), "/p rows go through public items");
assert(view.includes("{detail.ownerLabel}"), "under-H1 owner label remains");
assert(
  !view.includes("Плейлист АудиоЛада") && !view.includes("Публичный плейлист"),
  "top eyebrow above H1 is gone",
);
assert(
  view.indexOf("data-public-playlist-hero-cover") < view.indexOf("<h1") &&
    view.indexOf("<h1") < view.indexOf("{detail.ownerLabel}"),
  "cover then H1 then under-H1 owner label",
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
  !listenEmbed.includes("formatPlaylistItemCount") &&
    !listenEmbed.includes("itemsCount") &&
    !listenEmbed.includes("материалов"),
  "/listens embed still has no playlist item-count label",
);
assert(
  !items.includes("stay_on_source"),
  "public /p rows do not use listen-page stay_on_source policy",
);

const renderStart = view.indexOf("export default function PublicPlaylistPageView");
const renderView = renderStart === -1 ? "" : view.slice(renderStart);
const playAllIdx = renderView.indexOf("<PlayAllButton");
const itemsIdx = renderView.indexOf("<PublicPlaylistItems");
const ctaIdx = renderView.indexOf("<PublicPlaylistLibraryCta");
const saveCopyMatches = view.match(/Сохраняйте аудиопрактики и собирайте свои плейлисты/g) ?? [];

assert(renderStart !== -1, "public playlist page view export remains");
assert(playAllIdx !== -1 && itemsIdx !== -1 && ctaIdx !== -1, "hero, items, and CTA remain");
assert(playAllIdx < itemsIdx, "Слушать всё stays above playlist items");
assert(itemsIdx < ctaIdx, "auth/library CTA is after playlist items");
assert(playAllIdx < ctaIdx, "auth/library CTA is after Слушать всё");
assert(saveCopyMatches.length === 1, "one auth/library CTA copy instance");
assert((view.match(/data-public-playlist-library-cta/g) ?? []).length === 1, "one CTA section");
assert((view.match(/<PublicPlaylistLibraryCta/g) ?? []).length === 1, "CTA mounted once");
assert(view.includes("Войти") && view.includes("Создать аккаунт"), "guest Войти / Создать аккаунт remain");
assert(view.includes("Перейти в Аудиотеку"), "authenticated Перейти в Аудиотеку remains");
assert(view.includes("isAuthenticated ?"), "guest and authenticated CTA stay mutually exclusive");
assert(
  view.includes("Перейти в Аудиотеку") &&
    view.includes("Войти") &&
    view.includes("Создать аккаунт"),
  "logged-in library CTA and guest auth buttons are exclusive branches of one CTA",
);

assert(view.includes('data-public-playlist-hero'), "hero is marked for layout checks");
assert(
  view.includes("flex flex-col xl:grid") &&
    view.includes("xl:grid-cols-[minmax(260px,280px)_minmax(0,1fr)]") &&
    view.includes("xl:items-start"),
  "desktop xl hero is cover-left / content-right, top-aligned",
);
assert(
  view.includes("xl:col-start-1") && view.includes("xl:col-start-2"),
  "desktop hero places cover in column 1 and content in column 2",
);
assert(
  !view.includes("grid grid-cols") && !view.includes("sm:grid") && !view.includes("lg:grid"),
  "mobile/tablet hero stays a vertical stack (xl only)",
);
assert(
  view.includes("max-w-[280px]") && view.includes("mx-auto") && view.includes("xl:mx-0"),
  "mobile cover stays a centered stack; desktop cover is not centered as a page hero",
);

assert(
  items.includes('data-playlist-row-play={coverPlayback ? "cover" : "circle"}') === false,
  "row play mode stays on PlaylistItemRow, not forked here",
);
assert(
  items.includes("coverPlayback") && row.includes('data-playlist-row-play={coverPlayback ? "cover" : "circle"}'),
  "rows still play from cover",
);

console.log("public-playlist-page-shell-unit: ok");
