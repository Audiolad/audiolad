import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function testGuestHomeStartListenHasNoListenHref() {
  const guest = read("src/components/home/GuestHome.tsx");

  assert.doesNotMatch(guest, /HomeProductPlayButton/);
  assert.doesNotMatch(guest, /getPrimaryHomePlayProduct/);
  assert.match(guest, /GUEST_HOME_LISTEN_FREE_CTA/);
  assert.match(
    read("src/lib/home/guest-slider.ts"),
    /label: "Начать слушать бесплатно"/,
  );
  assert.doesNotMatch(guest, /getPrimaryListenHref/);
  assert.doesNotMatch(guest, /listenHref/);
  assert.doesNotMatch(guest, /href=\{primaryListenHref\}/);
  assert.doesNotMatch(guest, /buildListenPath|\/listen\?autoplay/);
}

function testActiveProgramsContinueHasNoListenHref() {
  const programs = read("src/components/home/ActiveProgramsSection.tsx");

  assert.match(programs, /HomeProductPlayButton/);
  assert.match(programs, /Продолжить/);
  assert.match(programs, /program\.product/);
  assert.doesNotMatch(programs, /program\.listenHref/);
  assert.doesNotMatch(programs, /href=\{program\.listenHref\}/);
  assert.doesNotMatch(programs, /buildListenPath|\/listen/);
}

function testBothUseHomeProductPlayButton() {
  const guest = read("src/components/home/GuestHome.tsx");
  const programs = read("src/components/home/ActiveProgramsSection.tsx");
  const types = read("src/lib/home/types.ts");

  assert.doesNotMatch(guest, /HomeProductPlayButton/);
  assert.match(programs, /HomeProductPlayButton/);
  assert.match(types, /listenHref: string \| null/);
  assert.match(types, /listenHref: string;/);
}

function testHomePlayButtonsDoNotOpenListen() {
  const files = [
    "src/components/home/ActiveProgramsSection.tsx",
    "src/components/home/HomeProductCard.tsx",
    "src/components/home/HeroFeaturedProduct.tsx",
    "src/components/home/ContinueListening.tsx",
  ];

  for (const file of files) {
    const source = read(file);
    assert.match(source, /HomeProductPlayButton/, `${file} uses HomeProductPlayButton`);
    assert.doesNotMatch(
      source,
      /href=\{[^}]*listenHref/,
      `${file} Play does not use listenHref href`,
    );
  }
}

testGuestHomeStartListenHasNoListenHref();
testActiveProgramsContinueHasNoListenHref();
testBothUseHomeProductPlayButton();
testHomePlayButtonsDoNotOpenListen();

console.log("home-legacy-play-cleanup-unit: ok");
