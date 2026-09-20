#!/usr/bin/env node
/**
 * Desktop sidebar AuthorPromoBanner must sell via /dlya-avtorov-meditatsiy,
 * independent of stateful shellData.authorCta.href.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolveListenerAuthorCta,
} from "../src/lib/listener/author-cta.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const sidebar = read("src/components/listener/DesktopSidebar.tsx");
const chrome = read("src/components/listener/DesktopSidebarChrome.tsx");
const authorCta = read("src/lib/listener/author-cta.ts");
const content = read("src/lib/seo/meditation-authors-landing/content.ts");
const rightColumn = read("src/components/listener/DesktopRightColumnTop.tsx");

assert.match(
  content,
  /MEDITATION_AUTHORS_LANDING_PATH = "\/dlya-avtorov-meditatsiy"/,
);

assert.match(chrome, /MEDITATION_AUTHORS_LANDING_PROMO_LINK/);
assert.match(chrome, /target=\{MEDITATION_AUTHORS_LANDING_PROMO_LINK\.target\}/);
assert.match(chrome, /rel=\{MEDITATION_AUTHORS_LANDING_PROMO_LINK\.rel\}/);
assert.match(chrome, /function AuthorPromoBanner/);
assert.equal(
  (chrome.match(/<AuthorPromoBanner/g) || []).length,
  2,
  "expanded rail + collapsed flyout both render AuthorPromoBanner",
);
assert.doesNotMatch(chrome, /authorCtaHref/);
assert.doesNotMatch(sidebar, /authorCtaHref/);
assert.doesNotMatch(
  chrome,
  /AuthorPromoBanner[\s\S]{0,80}authorCta/,
  "promo banner is not wired to authorCta",
);

// Only the v2 sidebar asset is used for this chrome banner
assert.match(sidebar, /become-author-banner-v2\.webp/);
assert.equal(
  [...sidebar.matchAll(/become-author-banner-v2/g)].length,
  1,
);

// Stateful author CTA stays separate (right column still uses shellData.authorCta)
assert.match(rightColumn, /shellData\.authorCta\.href/);
assert.match(rightColumn, /shellData\.authorCta\.label/);

// Application / status routes still resolve to /become-author
assert.match(authorCta, /BECOME_AUTHOR_HREF/);
const draft = resolveListenerAuthorCta({
  workspaces: [],
  applicationVariant: "draft",
});
assert.equal(draft.href, "/become-author");
assert.match(draft.label, /Продолжить/);

const submitted = resolveListenerAuthorCta({
  workspaces: [],
  applicationVariant: "submitted",
});
assert.equal(submitted.href, "/become-author");

const needsChanges = resolveListenerAuthorCta({
  workspaces: [],
  applicationVariant: "needs_changes",
});
assert.equal(needsChanges.href, "/become-author");

const plain = resolveListenerAuthorCta({
  workspaces: [],
  applicationVariant: "none",
});
assert.equal(plain.href, "/become-author");
assert.equal(plain.label, "Стать автором");

const activeAuthor = resolveListenerAuthorCta({
  workspaces: [{ id: "a1", slug: "sergey", name: "Sergey" }],
  applicationVariant: null,
});
assert.equal(activeAuthor.label, "Кабинет автора");
assert.notEqual(activeAuthor.href, "/dlya-avtorov-meditatsiy");
assert.notEqual(activeAuthor.href, "/become-author");

console.log("desktop-sidebar-author-promo-landing-unit: ok");
