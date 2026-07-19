#!/usr/bin/env node
/**
 * Become Author mobile promo banner — structural regression (no browser).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = "/var/www/audiolad";

function read(path) {
  return readFileSync(`${root}/${path}`, "utf8");
}

const guestHome = read("src/components/home/GuestHome.tsx");
const personalHome = read("src/components/home/PersonalHome.tsx");
const sidebar = read("src/components/listener/DesktopSidebar.tsx");
const banner = read("src/components/listener/BecomeAuthorPromoBanner.tsx");

assert(
  existsSync(`${root}/public/images/banners/become-author-mobile-banner-v1.webp`),
  "mobile banner webp asset exists",
);

assert(
  guestHome.includes("BecomeAuthorPromoBanner"),
  "GuestHome imports BecomeAuthorPromoBanner",
);
assert(
  guestHome.includes('<BecomeAuthorPromoBanner source="home_mobile" />'),
  "GuestHome renders BecomeAuthorPromoBanner with home_mobile source",
);
assert(
  !guestHome.includes('source="profile_mobile"') &&
    !guestHome.includes('source="catalog_mobile"'),
  "GuestHome does not use other promo sources",
);

const authorsIdx = guestHome.indexOf("<AuthorsRail");
const bannerIdx = guestHome.indexOf("<BecomeAuthorPromoBanner");
const howItWorksIdx = guestHome.indexOf("<HowItWorks");

assert(authorsIdx !== -1, "AuthorsRail present in GuestHome");
assert(bannerIdx !== -1, "BecomeAuthorPromoBanner present in GuestHome");
assert(howItWorksIdx !== -1, "HowItWorks present in GuestHome");
assert(
  authorsIdx < bannerIdx && bannerIdx < howItWorksIdx,
  "banner is after AuthorsRail and before HowItWorks",
);

assert(
  banner.includes("become-author-mobile-banner-v1.webp"),
  "banner uses webp asset via static import",
);
assert(
  !banner.includes("become-author-mobile-banner-v1.png"),
  "banner no longer references png asset",
);
assert(
  banner.includes("import becomeAuthorMobileBanner from"),
  "banner uses static import",
);
assert(
  banner.includes("src={becomeAuthorMobileBanner}"),
  "banner passes static import to Image",
);
assert(
  !banner.includes("BECOME_AUTHOR_MOBILE_BANNER_WIDTH") &&
    !banner.includes("1774") &&
    !banner.includes("887"),
  "banner does not duplicate image dimensions manually",
);
assert(
  banner.includes("BecomeAuthorPromoSource"),
  "banner defines extensible promo source type",
);
for (const source of [
  "home_mobile",
  "personal_home_mobile",
  "personal_home_desktop",
  "profile_mobile",
  "catalog_mobile",
]) {
  assert(banner.includes(`"${source}"`), `source type includes ${source}`);
}
assert(banner.includes("BECOME_AUTHOR_HREF"), "banner links via BECOME_AUTHOR_HREF");
assert(banner.includes('aria-label="Стать автором на АудиоЛад"'), "banner aria-label");
assert(banner.includes("visibility"), "banner supports visibility prop");
assert(banner.includes("xl:hidden"), "banner keeps mobile-only default");
assert(!banner.includes("priority"), "banner does not use priority loading");

assert(
  personalHome.includes("BecomeAuthorPromoBanner"),
  "PersonalHome renders BecomeAuthorPromoBanner",
);
assert(
  personalHome.includes('source="personal_home_mobile"') &&
    personalHome.includes('source="personal_home_desktop"'),
  "PersonalHome uses personal promo sources",
);
assert(
  personalHome.includes("showBecomeAuthorPromo"),
  "PersonalHome gates promo banner visibility",
);
assert(
  !sidebar.includes("become-author-mobile-banner-v1"),
  "desktop sidebar unchanged",
);

console.log("become-author-promo-banner-unit: ok");
