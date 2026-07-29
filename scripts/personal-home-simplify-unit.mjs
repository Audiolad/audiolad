#!/usr/bin/env node
/**
 * Personal home simplification — structural regression (no browser).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path) {
  return readFileSync(`${root}/${path}`, "utf8");
}

const personalHome = read("src/components/home/PersonalHome.tsx");
const guestHome = read("src/components/home/GuestHome.tsx");
const homeLayout = read("src/app/(listener)/(home)/layout.tsx");
const legalFooter = read("src/components/LegalFooter.tsx");
const publicFooterLinks = read("src/lib/navigation/public-footer-links.ts");
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

assert(
  personalHome.includes('import LegalFooter from "@/components/LegalFooter"') &&
    personalHome.includes('<LegalFooter className="mt-10" />'),
  "PersonalHome renders shared LegalFooter at the bottom",
);
assert(
  legalFooter.includes("PUBLIC_FOOTER_LINKS"),
  "LegalFooter reuses PUBLIC_FOOTER_LINKS",
);
assert(
  publicFooterLinks.includes('href: "/about"') &&
    publicFooterLinks.includes('title: "О платформе"'),
  "PUBLIC_FOOTER_LINKS keeps about discovery link",
);
assert(
  publicFooterLinks.includes('href: "/philosophy"') &&
    publicFooterLinks.includes('title: "Принципы"'),
  "PUBLIC_FOOTER_LINKS keeps philosophy discovery link",
);
assert(
  publicFooterLinks.includes('href: "/for-authors"') &&
    publicFooterLinks.includes('title: "Авторам"'),
  "PUBLIC_FOOTER_LINKS keeps for-authors discovery link",
);
assert(
  publicFooterLinks.includes('href: "/articles"') &&
    publicFooterLinks.includes('title: "Статьи"'),
  "PUBLIC_FOOTER_LINKS keeps articles discovery link",
);
assert(
  publicFooterLinks.includes('href: "/help"') &&
    publicFooterLinks.includes('title: "Помощь и поддержка"'),
  "PUBLIC_FOOTER_LINKS keeps help discovery link",
);
assert(
  publicFooterLinks.indexOf('href: "/about"') <
    publicFooterLinks.indexOf('href: "/philosophy"') &&
    publicFooterLinks.indexOf('href: "/philosophy"') <
      publicFooterLinks.indexOf('href: "/for-authors"') &&
    publicFooterLinks.indexOf('href: "/for-authors"') <
      publicFooterLinks.indexOf('href: "/articles"') &&
    publicFooterLinks.indexOf('href: "/articles"') <
      publicFooterLinks.indexOf('href: "/help"'),
  "PUBLIC_FOOTER_LINKS orders about, philosophy, for-authors, articles, then help",
);
assert(
  homeLayout.includes("!shellData.isAuthenticated") &&
    homeLayout.includes("<LegalFooter") &&
    !homeLayout.includes("xl:hidden"),
  "home layout keeps LegalFooter for guest home on mobile and desktop",
);
assert(
  personalHome.lastIndexOf("<LegalFooter") >
    personalHome.lastIndexOf("BecomeAuthorPromoBanner"),
  "LegalFooter is after personal home content sections",
);

console.log("personal-home-simplify-unit: ok");
