#!/usr/bin/env node
/**
 * Guest home hero slider — structural regression (no browser).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const guestHome = read("src/components/home/GuestHome.tsx");
const slider = read("src/components/home/GuestHomeSlider.tsx");
const slidesLib = read("src/lib/home/guest-slider.ts");
const homePage = read("src/app/(platform)/(listener)/(home)/page.tsx");
const bottomNav = read("src/components/BottomNav.tsx");
const listenerNav = read("src/lib/navigation/listener-nav.ts");

const EN_DASH = "\u2013";
const EM_DASH = "\u2014";
const INTRO =
  `АудиоЛад ${EN_DASH} платформа авторского аудио: практики, медитации, музыка, аудиокурсы и программы.`;

assert.doesNotMatch(
  guestHome,
  /Аудио, которое помогает вернуться к себе/,
  "old H1 is gone from GuestHome",
);
assert.doesNotMatch(
  guestHome,
  /любимых авторов/,
  "old favorite-authors subtitle is gone from GuestHome",
);
assert.doesNotMatch(
  guestHome,
  /Открыть каталог/,
  "old Open catalog hero pair is gone from GuestHome",
);
assert.doesNotMatch(
  guestHome,
  /HomeProductPlayButton|getPrimaryHomePlayProduct|HeroFeaturedProduct/,
  "old play-product hero is gone from GuestHome",
);
assert.doesNotMatch(
  guestHome,
  />[\s\n]*Начать слушать[\s\n]*</,
  "old Начать слушать play CTA is gone from GuestHome",
);

assert.match(
  guestHome,
  /<h1\s+data-guest-home-intro/,
  "compact intro is a semantic h1",
);
assert.doesNotMatch(
  guestHome,
  /<p\s+data-guest-home-intro/,
  "intro is no longer a paragraph",
);
assert.equal(
  (guestHome.match(/<h1\b/g) ?? []).length,
  1,
  "guest home first screen has exactly one h1",
);
assert.match(guestHome, /GUEST_HOME_INTRO/);
assert.ok(slidesLib.includes(INTRO), "intro copy uses a regular en-dash");
assert.ok(!slidesLib.includes(EM_DASH), "intro copy must not use an em-dash");
assert.ok(!guestHome.includes(EM_DASH), "GuestHome must not use an em-dash");
assert.equal(INTRO.includes(EN_DASH), true, "expected intro contains U+2013");
assert.equal(INTRO.includes(EM_DASH), false, "expected intro has no U+2014");

const slideFiles = [
  "01-audio-practices.webp",
  "02-audio-practices.webp",
  "03-audio-practices.webp",
  "04-audio-practices.webp",
  "05-audio-practices.webp",
  "06-audio-practices.webp",
  "07-audio-practices.webp",
];

for (const [index, fileName] of slideFiles.entries()) {
  const relativePath = `public/images/home/guest-slider/${fileName}`;
  assert.ok(existsSync(join(root, relativePath)), `${relativePath} exists`);
  assert.match(
    slidesLib,
    new RegExp(`/images/home/guest-slider/${fileName}`),
    `slide ${index + 1} uses ${fileName}`,
  );
}

const srcOrder = slideFiles.map((fileName) =>
  slidesLib.indexOf(`/images/home/guest-slider/${fileName}`),
);
for (let index = 1; index < srcOrder.length; index += 1) {
  assert.ok(
    srcOrder[index - 1] < srcOrder[index],
    `assets stay in order 01→07 (failed at ${slideFiles[index]})`,
  );
}

assert.doesNotMatch(
  slider,
  /setInterval|setTimeout|autoplay|auto-?advance|requestAnimationFrame/,
  "slider has no autoplay / auto-advance",
);
assert.doesNotMatch(
  slidesLib,
  /setInterval|autoplay/,
  "slide data has no autoplay",
);

assert.doesNotMatch(slider, /role="tablist"/, "dots are not a tablist");
assert.doesNotMatch(slider, /role="tab"/, "dots are not tabs");
assert.match(slider, /aria-current=\{index === activeIndex \? "true" : undefined\}/, "active dot keeps aria-current");
assert.match(slider, /aria-label="Слайды гостевой главной"/, "dots keep their group label");
assert.match(slider, /GUEST_HOME_SLIDES\.map/, "dots iterate the 7 slides");
assert.match(slider, /data-guest-home-dot/, "each dot is marked");
assert.match(slider, /scroll-snap|guest-home-slider__track/, "uses snap track");
assert.match(slider, /TAP_MOVE_THRESHOLD_PX/, "swipe vs tap uses a movement threshold");
assert.match(slider, /priority=\{index === 0\}/, "first slide may be LCP priority");
assert.match(slider, /aspect-ratio|guest-home-slider__media/, "slides stay square");

assert.match(guestHome, /GUEST_HOME_LISTEN_FREE_CTA/);
assert.match(slidesLib, /label: "Начать слушать бесплатно"/);
assert.match(slidesLib, /href: "\/catalog\?access=free"/);
assert.match(guestHome, /data-guest-home-cta/);

const slidesBlock = slidesLib.slice(
  slidesLib.indexOf("export const GUEST_HOME_SLIDES"),
);

assert.match(slidesBlock, /href: "\/catalog"/);
assert.match(slidesBlock, /href: "\/catalog\?access=free"/);
assert.match(slidesBlock, /href: "\/catalog\?class=release"/);
assert.match(slidesBlock, /href: "\/playlists\/catalog"/);
assert.match(slidesBlock, /href: "\/catalog\?access=paid"/);
assert.match(
  slidesBlock,
  /buildAuthRouteHref\("\/auth\/sign-up", "\/my-practices"\)/,
);
assert.match(slidesBlock, /href: BECOME_AUTHOR_HREF/);

const hrefOrder = [
  'href: "/catalog"',
  'href: "/catalog?access=free"',
  'href: "/catalog?class=release"',
  'href: "/playlists/catalog"',
  'href: "/catalog?access=paid"',
  'buildAuthRouteHref("/auth/sign-up", "/my-practices")',
  "href: BECOME_AUTHOR_HREF",
].map((token) => slidesBlock.indexOf(token));

for (let index = 1; index < hrefOrder.length; index += 1) {
  assert.ok(hrefOrder[index] !== -1, `slide href token ${index + 1} is present`);
  assert.ok(
    hrefOrder[index - 1] < hrefOrder[index],
    `slide hrefs stay in order 1→7 (failed at token ${index + 1})`,
  );
}

assert.match(bottomNav, /xl:hidden/, "BottomNav stays xl:hidden");
assert.match(bottomNav, /grid-cols-5/, "BottomNav stays 5 items");
const primaryNavStart = listenerNav.indexOf(
  "export const LISTENER_PRIMARY_NAV_ITEMS",
);
const primaryNavEnd = listenerNav.indexOf("] as const;", primaryNavStart);
const primaryNavBlock = listenerNav.slice(primaryNavStart, primaryNavEnd);
assert.ok(primaryNavStart !== -1, "LISTENER_PRIMARY_NAV_ITEMS is defined");
assert.equal(
  [...primaryNavBlock.matchAll(/key: "(home|catalog|library|playlists|profile)"/g)]
    .length,
  5,
  "primary nav still has 5 items",
);

assert.match(homePage, /<PersonalHome /, "signed-in home still uses PersonalHome");
assert.match(homePage, /<GuestHome /, "guest home still uses GuestHome");
assert.match(guestHome, /Попробуйте в подарок/, "gifts rail stays after the hero");
assert.match(guestHome, /HomeTopicNavigation/, "topic navigation stays");
assert.match(guestHome, /Новое в АудиоЛаде/, "new rail stays");
assert.match(guestHome, /Аудиопрограммы/, "programs rail stays");
assert.match(guestHome, /AuthorsRail/, "authors rail stays");
assert.match(guestHome, /BecomeAuthorPromoBanner/, "author promo stays");
assert.match(guestHome, /HowItWorks/, "how-it-works stays");
assert.match(guestHome, /SignUpInvitation/, "sign-up invitation stays");

assert.doesNotMatch(
  guestHome,
  /mt-8 xl:mt-5/,
  "guest intro no longer uses the old tall hero margin",
);

console.log("guest-home-hero-unit: ok");
