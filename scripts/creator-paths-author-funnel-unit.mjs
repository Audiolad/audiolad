#!/usr/bin/env node
/**
 * Creator-paths SEO funnel → meditation authors landing.
 * Also locks promo banner + guest slide 07 away from direct /become-author.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

const cta = read("src/components/articles/CreatorPathsCta.tsx");
const view = read("src/components/articles/ArticlePageView.tsx");
const load = read("src/lib/seo/articles/load.ts");
const types = read("src/lib/seo/articles/types.ts");
const banner = read("src/components/listener/BecomeAuthorPromoBanner.tsx");
const guestSlider = read("src/lib/home/guest-slider.ts");
const authorCta = read("src/lib/listener/author-cta.ts");
const profileConsts = read("src/lib/profile/constants.ts");

assert.match(cta, /MEDITATION_AUTHORS_LANDING_PATH/);
assert.match(
  read("src/lib/seo/meditation-authors-landing/content.ts"),
  /MEDITATION_AUTHORS_LANDING_PATH = "\/dlya-avtorov-meditatsiy"/,
);
assert.match(cta, /Стать автором бесплатно/);
assert.match(cta, /АВТОРАМ АУДИОЛАДА/);
assert.match(cta, /Хотите создать и опубликовать свою медитацию\?/);
assert.match(cta, /Попробуйте бесплатно прямо сейчас/);
assert.match(cta, /studio\/meditation/);
assert.doesNotMatch(cta, /25 ГОТОВЫХ РЕШЕНИЙ/);
assert.doesNotMatch(cta, /25 готовых решений/);
assert.doesNotMatch(cta, /solutionsPromoHref/);
assert.doesNotMatch(cta, /SolutionsVisual/);

// author card: no target=_blank on the same-tab path
const authorCard = cta.slice(cta.indexOf('kind: "author"') > -1 ? 0 : 0);
assert.ok(
  cta.includes('target: "_blank"') &&
    cta.includes('rel: "noopener noreferrer"') &&
    cta.includes(": {}"),
  "only Studio opens in a new tab",
);

assert.equal((view.match(/<CreatorPathsCta/g) || []).length, 2);
assert.match(view, /placement="top"/);
assert.match(view, /placement="bottom"/);
assert.doesNotMatch(view, /solutionsPromoHref/);

assert.doesNotMatch(load, /solutionsPromoHref/);
assert.doesNotMatch(load, /loadMeditationSolutionsPromoHref/);
assert.doesNotMatch(types, /solutionsPromoHref/);

assert.match(banner, /MEDITATION_AUTHORS_LANDING_PATH/);
assert.doesNotMatch(banner, /BECOME_AUTHOR_HREF/);

assert.match(guestSlider, /id: "07"/);
const slide07 = guestSlider.slice(guestSlider.indexOf('id: "07"'));
assert.match(slide07, /MEDITATION_AUTHORS_LANDING_PATH/);
assert.doesNotMatch(slide07.slice(0, 200), /BECOME_AUTHOR_HREF/);

// application / status CTAs stay on /become-author
assert.match(profileConsts, /BECOME_AUTHOR_HREF = "\/become-author"/);
assert.match(authorCta, /BECOME_AUTHOR_HREF/);
assert.match(authorCta, /Продолжить/);
assert.match(authorCta, /Статус заявки/);
assert.match(authorCta, /Дополнить заявку/);

console.log("creator-paths-author-funnel-unit: ok");
