#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const shell = read("src/components/studio/StudioEditorShell.tsx");
const chooser = read("src/components/studio/StudioAddMusicChooser.tsx");
const overlay = read("src/components/studio/StudioMusicCatalogOverlay.tsx");
const card = read("src/components/studio/StudioMusicCatalogCard.tsx");

assert.match(chooser, /С устройства/);
assert.match(chooser, /Каталог АудиоЛада/);
assert.match(shell, /StudioAddMusicChooser/);
assert.match(shell, /StudioMusicCatalogOverlay/);
assert.match(shell, /openAddMusicChooser/);
assert.match(shell, /pickDeviceMusic/);
assert.match(shell, /const openAddAudioDialog = \(slotId: string\) => \{/);
assert.match(shell, /addAudioInputRef\.current\.click\(\)/);
assert.match(
  shell,
  /trackKind === "music"\s*\?[\s\S]*openAddMusicChooser\(slot\.id\)\s*:\s*openAddAudioDialog\(slot\.id\)/,
);
assert.match(shell, /if \(isVoiceSlot\) \{\s*openAddAudioDialog\(slot\.id\)/);
assert.match(shell, /onPickDevice=\{\(\) => pickDeviceMusic\(slot\.id\)\}/);
assert.match(shell, /onPickCatalog=\{pickCatalogMusic\}/);

assert.doesNotMatch(shell, /create_studio_music_order/);
assert.doesNotMatch(shell, /acquire_free_studio_music/);
assert.doesNotMatch(shell, /studio_music_entitlements/);
assert.doesNotMatch(shell, /router\.(push|replace)\(.*catalog/);
assert.doesNotMatch(shell, /loadLocalFiles\([^\)]*catalog/);

const loadLocalFilesMatches = [
  ...shell.matchAll(/loadLocalFiles\(/g),
];
assert.equal(loadLocalFilesMatches.length, 1);
assert.match(
  shell,
  /onChange=\{\(event\) => \{[\s\S]*loadLocalFiles\(\[file\], trackKind \?\? "music"\)/,
);

assert.match(shell, /musicCatalogOverlayOpen \|\| musicChooserSlotId/);
assert.match(shell, /setMusicCatalogOverlayOpen\(false\)/);
assert.match(overlay, /fixed inset-0 z-40/);
assert.match(overlay, /Музыка для медитаций/);
assert.match(overlay, /Вся/);
assert.match(overlay, /Моя/);
assert.match(overlay, /Бесплатно для Студии/);
assert.doesNotMatch(overlay, /label: "Бесплатная"/);
assert.doesNotMatch(overlay, /sm:grid-cols-2/);
assert.match(overlay, /max-w-5xl/);
assert.match(overlay, /flex-col gap-2/);
assert.match(overlay, /authOnly/);
assert.match(overlay, /stopPreview/);
assert.match(overlay, /onClose/);
assert.match(overlay, /<audio/);
assert.match(overlay, /URL\.revokeObjectURL/);
assert.match(overlay, /\/api\/studio\/music\/acquire/);
assert.match(overlay, /\/api\/checkout\/studio-music/);
assert.doesNotMatch(overlay, /useRouter/);
assert.doesNotMatch(overlay, /loadLocalFiles/);
assert.doesNotMatch(overlay, /GlobalAudioPlayer/);
assert.doesNotMatch(overlay, /\/api\/catalog/);

assert.match(card, /display_label/);
assert.match(card, /kind_label/);
assert.match(card, /Скрыть треки|Треки/);
assert.match(card, /resolveStudioMusicCatalogAction/);
assert.match(card, /onAcquire/);
assert.match(card, /listener_price_label/);
assert.match(card, /studio_price_label/);
assert.match(card, /md:flex-row/);
assert.match(card, /md:h-\[136px\]/);
assert.match(card, /md:w-\[136px\]/);
assert.match(card, /stopPropagation/);
assert.match(card, /aria-expanded/);
assert.match(card, /onClick=\{isAlbum \? \(\) => applyExpandClick\("row"\) : undefined\}/);
assert.match(card, /applyExpandClick\("tracks"\)/);
assert.match(card, /nextStudioMusicAlbumExpanded/);
assert.doesNotMatch(card, /CatalogCardShell/);
assert.doesNotMatch(card, /ReleaseCatalogCard/);
assert.doesNotMatch(card, /audio_path/);
assert.doesNotMatch(card, /aspect-square/);
assert.doesNotMatch(card, /sm:grid-cols-2/);

const rotateLock = /fixed inset-0 z-30 hidden[\s\S]*поверните устройство/;
assert.match(shell, rotateLock);
assert.match(shell, /StudioMusicCatalogOverlay/);

console.log("studio-music-catalog-ui-unit: ok");
