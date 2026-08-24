import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTOPLAY_RESUME_HINT,
  AUTOPLAY_START_HINT,
  BUY_ACTION_LABEL,
  PLAY_ACTION_LABEL,
  PREVIEW_ACTION_LABEL,
} from "../src/lib/ui/action-labels";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function testCanonicalLabels() {
  assert.equal(PLAY_ACTION_LABEL, "Слушать");
  assert.equal(PREVIEW_ACTION_LABEL, "Прослушать фрагмент");
  assert.equal(BUY_ACTION_LABEL, "Купить");
  assert.match(AUTOPLAY_START_HINT, /Слушать/);
  assert.match(AUTOPLAY_RESUME_HINT, /Слушать/);
  assert.doesNotMatch(AUTOPLAY_START_HINT, /\bPlay\b/);
  assert.doesNotMatch(AUTOPLAY_RESUME_HINT, /\bPlay\b/);
}

function testProductSurfacesUseRussianCopy() {
  const parts = read(
    "src/components/products/practice-page/PracticePageParts.tsx",
  );
  const access = read("src/lib/products/practice-access-ui.ts");
  const libraryPreview = read(
    "src/components/my-practices/LibraryCardPreviewPlayButton.tsx",
  );
  const catalogPlay = read(
    "src/components/products/CatalogProductPlayButton.tsx",
  );
  const buyCta = read("src/components/audio/PreviewEndedBuyCta.tsx");
  const hero = read("src/components/home/HeroFeaturedProduct.tsx");

  assert.match(parts, /PREVIEW_ACTION_LABEL/);
  assert.match(parts, /playAriaLabel=\{playLabel\}/);
  assert.match(access, /BUY_ACTION_LABEL/);
  assert.match(access, /PLAY_ACTION_LABEL/);
  assert.doesNotMatch(access, /Купить за|Купить доступ/);
  assert.match(libraryPreview, /PREVIEW_ACTION_LABEL/);
  assert.doesNotMatch(libraryPreview, />\s*Слушать\s*</);
  assert.match(catalogPlay, /PLAY_ACTION_LABEL/);
  assert.doesNotMatch(catalogPlay, /Воспроизвести/);
  assert.match(buyCta, /BUY_ACTION_LABEL/);
  assert.match(hero, /PLAY_ACTION_LABEL/);
}

function testHintsDoNotShowEnglishPlay() {
  const player = read("src/components/audio/useSequentialPlayer.ts");
  const personal = read(
    "src/lib/personal-materials/guest/audio-player-helpers.ts",
  );
  const adminMoney = read("src/components/admin/AdminMoneyPanel.tsx");

  assert.match(player, /AUTOPLAY_START_HINT/);
  assert.match(player, /AUTOPLAY_RESUME_HINT/);
  assert.doesNotMatch(
    player,
    /setAutoplayHint\("Нажмите Play/,
    "player hints do not show English Play",
  );
  assert.match(personal, /PLAY_ACTION_LABEL/);
  assert.doesNotMatch(personal, /Нажмите Play/);
  assert.match(adminMoney, />Слушать</);
  assert.doesNotMatch(adminMoney, />Play</);
}

function testTechnicalNamesStayInCode() {
  const playback = read("src/lib/catalog/catalog-playback.ts");
  const types = read("src/lib/listen/global-player-types.ts");
  const player = read("src/components/audio/useSequentialPlayer.ts");

  assert.match(playback, /playbackMode: "preview"/);
  assert.match(types, /playbackMode\?:/);
  assert.match(player, /playbackMode = "full"/);
}

testCanonicalLabels();
testProductSurfacesUseRussianCopy();
testHintsDoNotShowEnglishPlay();
testTechnicalNamesStayInCode();

console.log("ui-action-labels-unit: ok");
