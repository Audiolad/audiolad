#!/usr/bin/env node
/**
 * Personal home simplification — structural regression (no browser).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = "/var/www/audiolad";

function read(path) {
  return readFileSync(`${root}/${path}`, "utf8");
}

const personalHome = read("src/components/home/PersonalHome.tsx");
const guestHome = read("src/components/home/GuestHome.tsx");
const dataTs = read("src/lib/home/data.ts");
const typesTs = read("src/lib/home/types.ts");
const banner = read("src/components/listener/BecomeAuthorPromoBanner.tsx");
const sidebar = read("src/components/listener/DesktopSidebar.tsx");
const bottomNav = read("src/components/BottomNav.tsx");

for (const removedTitle of [
  "Из вашей Аудиотеки",
  "Небольшая пауза для себя",
  "Материалы в подарок",
  "Время замедлиться",
  "Мягкое начало дня",
  "Для спокойного завершения дня",
]) {
  assert(
    !personalHome.includes(removedTitle),
    `PersonalHome removed section title: ${removedTitle}`,
  );
}

for (const keptTitle of [
  "Для вас",
  "Недавно слушали",
  "Новые материалы",
]) {
  assert(
    personalHome.includes(`title="${keptTitle}"`) ||
      personalHome.includes(`title={'${keptTitle}'}`) ||
      personalHome.includes(`title={\"${keptTitle}\"}`),
    `PersonalHome keeps section: ${keptTitle}`,
  );
}

assert(
  personalHome.includes("ContinueListening"),
  "PersonalHome keeps continue listening",
);
assert(
  personalHome.includes("HomeTopicNavigation"),
  "PersonalHome keeps topic navigation",
);
assert(
  personalHome.includes("ActiveProgramsSection"),
  "PersonalHome keeps active programs",
);
assert(
  personalHome.includes("<AuthorsRail authors={data.authors} />"),
  "PersonalHome renders AuthorsRail",
);
assert(
  personalHome.includes('source="personal_home_mobile"'),
  "PersonalHome mobile promo source",
);
assert(
  personalHome.includes('source="personal_home_desktop"'),
  "PersonalHome desktop promo source",
);
assert(
  personalHome.includes("showBecomeAuthorPromo"),
  "PersonalHome gates promo banner by role flag",
);

const continueIdx = personalHome.indexOf("<ContinueListening");
const topicsIdx = personalHome.indexOf("<HomeTopicNavigation");
const forYouIdx = personalHome.indexOf('title="Для вас"');
const recentIdx = personalHome.indexOf('title="Недавно слушали"');
const programsIdx = personalHome.indexOf("<ActiveProgramsSection");
const newIdx = personalHome.indexOf('title="Новые материалы"');
const authorsIdx = personalHome.indexOf("<AuthorsRail");
const promoIdx = personalHome.indexOf('source="personal_home_mobile"');

assert(continueIdx !== -1, "continue listening present");
assert(topicsIdx !== -1, "topics present");
assert(forYouIdx !== -1, "for you present");
assert(recentIdx !== -1, "recently listened present");
assert(programsIdx !== -1, "programs present");
assert(newIdx !== -1, "new materials present");
assert(authorsIdx !== -1, "authors present");
assert(promoIdx !== -1, "promo present");

assert(
  continueIdx < topicsIdx &&
    topicsIdx < forYouIdx &&
    forYouIdx < recentIdx &&
    recentIdx < programsIdx &&
    programsIdx < newIdx &&
    newIdx < authorsIdx &&
    authorsIdx < promoIdx,
  "PersonalHome section order matches target structure",
);

assert(
  !typesTs.includes("libraryProducts") &&
    !typesTs.includes("timeOfDayProducts") &&
    !typesTs.match(/PersonalHomeData[\s\S]*freeProducts/),
  "PersonalHomeData removed unused section fields",
);
assert(
  typesTs.includes("authors: HomeAuthor[]") &&
    typesTs.includes("showBecomeAuthorPromo: boolean"),
  "PersonalHomeData includes authors and promo visibility flag",
);

assert(
  dataTs.includes("getPublishedAuthors") &&
    dataTs.includes("resolveShowBecomeAuthorPromo") &&
    dataTs.includes("@/lib/listener/author-cta") &&
    !dataTs.includes("shouldShowBecomeAuthorPromo") &&
    !dataTs.includes("getLibraryProducts") &&
    !dataTs.includes("selectTimeOfDayProducts"),
  "personal loader reuses public authors and drops removed sections",
);
assert(
  existsSync(`${root}/src/lib/listener/author-cta.ts`),
  "shared author CTA resolver exists",
);

assert(
  !guestHome.includes("personal_home_mobile") &&
    !guestHome.includes("personal_home_desktop"),
  "GuestHome unchanged for personal promo sources",
);
assert(
  guestHome.includes('<BecomeAuthorPromoBanner source="home_mobile" />'),
  "GuestHome guest promo source unchanged",
);

assert(
  !sidebar.includes("personal_home_desktop") &&
    !sidebar.includes("become-author-mobile-banner-v1"),
  "Desktop sidebar unchanged",
);
assert(
  !bottomNav.includes("BecomeAuthorPromoBanner"),
  "BottomNav unchanged",
);

assert(
  banner.includes("personal_home_mobile") &&
    banner.includes("personal_home_desktop") &&
    banner.includes("BecomeAuthorPromoVisibility"),
  "BecomeAuthorPromoBanner supports personal home sources and visibility",
);

console.log("personal-home-simplify-unit: ok");
