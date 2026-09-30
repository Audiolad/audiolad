#!/usr/bin/env node
/**
 * MAX Playlists tab is a working catalog, not the placeholder.
 * Guest home slide 04 opens that section.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveMaxGuestHomeSlideAction } from "../src/lib/max/guest-home-slider.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFileSync(join(root, relative), "utf8");

const shell = read("src/components/max/MaxAuthenticatedHome.tsx");
const playlists = read("src/components/max/MaxPlaylists.tsx");
const card = read("src/components/max/MaxPlaylistCard.tsx");
const detail = read("src/components/max/MaxPlaylistDetail.tsx");
const nav = read("src/components/max/MaxBottomNav.tsx");
const home = read("src/components/max/MaxHome.tsx");
const profile = read("src/components/max/MaxProfile.tsx");
const slides = read("src/lib/home/guest-slider.ts");

assert.deepEqual(resolveMaxGuestHomeSlideAction("04"), { type: "playlists" });
assert.match(slides, /Готовые плейлисты/);
assert.match(shell, /function applyGuestHomeSlide\(slideId: string\)/);
assert.match(shell, /selectMaxTab\("playlists"\)/);
assert.match(shell, /activeTab === "playlists" \? \(/);
assert.match(shell, /<MaxPlaylists/);
assert.match(shell, /guestMode=\{guestMode\}/);

const playlistsPane = shell.slice(
  shell.indexOf('activeTab === "playlists"'),
  shell.indexOf('activeTab === "library"'),
);
assert.match(playlistsPane, /<MaxPlaylists/);
assert.doesNotMatch(playlistsPane, /MaxTabPlaceholder/);
assert.match(shell, /activeTab === "library" \? \(/);
assert.match(shell, /<MaxTabPlaceholder title=\{activeTabLabel\} \/>/);
assert.match(shell, /<MaxCatalogSearch/);
assert.match(shell, /activeTab === "home" \? \(/);
assert.match(shell, /<MaxHome/);
assert.match(shell, /<MaxProfile/);
assert.match(shell, /<MaxGuestProfile/);
assert.match(shell, /<MaxBottomNav activeTab=\{activeTab\} onSelectTab=\{selectMaxTab\} \/>/);
assert.match(shell, /MAX_PLAYBACK_SESSION_PATH/);
assert.match(shell, /MAX_PLAYBACK_PREVIEW_PATH/);
assert.match(shell, /MAX_PLAYBACK_AUDIO_PATH/);
assert.match(profile, /Выйти из аккаунта/);
assert.match(nav, /Плейлисты|tab\.label/);
assert.match(home, /<MaxGuestHomeSlider/);

assert.match(playlists, /Плейлисты/);
assert.match(playlists, /Найти плейлист/);
assert.match(playlists, /PLAYLIST_CATALOG_SORT_OPTIONS/);
assert.match(playlists, /PLAYLIST_LISTING_ACCESS_FILTERS/);
assert.match(playlists, /MAX_PLAYLISTS_CATALOG_PATH/);
assert.match(playlists, /method: "POST"/);
assert.match(playlists, /cache: "no-store"/);
assert.match(playlists, /grid-cols-2/);
assert.match(playlists, /Показать ещё/);
assert.match(playlists, /Загружаем плейлисты…/);
assert.match(playlists, /Пока нет плейлистов в витрине\./);
assert.match(playlists, /Не удалось загрузить плейлисты\./);
assert.match(playlists, /← Плейлисты|MaxPlaylistDetail/);
assert.match(detail, /← Плейлисты/);
assert.match(detail, /Слушать всё/);
assert.match(detail, /MAX_PLAYLISTS_DETAIL_PATH/);
assert.match(detail, /MAX_PLAYBACK_SESSION_PATH/);
assert.match(detail, /MAX_PLAYBACK_AUDIO_PATH/);
assert.match(detail, /MAX_PLAYBACK_PREVIEW_PATH/);
assert.match(detail, /maxPlaylistPlaybackResource/);
assert.match(detail, /advanceMaxPlaylistQueueOnEnded/);
assert.match(detail, /narrowMaxPlaybackSession/);
assert.match(detail, /Недоступно/);
assert.match(card, /type="button"/);
assert.match(card, /aspect-square w-full/);
assert.doesNotMatch(card, /next\/link|<Link|href=/);

const maxPlaylistSource = `${playlists}\n${card}\n${detail}`
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
assert.doesNotMatch(
  maxPlaylistSource,
  /\/api\/playlists\/catalog|\/listen\/|\/p\/|next\/link|next\/navigation|useRouter|router\.push|window\.location|GlobalAudioPlayerProvider/,
);
assert.doesNotMatch(shell, /\/api\/playlists\/catalog|\/listen\/|\/p\//);

console.log("max-playlists-ui-unit: ok");
