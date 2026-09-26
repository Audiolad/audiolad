import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildPublicPromoFallbackUrl,
  parseMaxPromoTarget,
  resolveMaxPromoBrowserFallback,
} from "../src/lib/max/promo-target.ts";
import { readMaxPromoPage } from "../src/lib/max/promo-view.ts";

assert.deepEqual(
  parseMaxPromoTarget("sergey-and-zoya/3-kvantmeditatsii-v-podarok"),
  {
    authorSlug: "sergey-and-zoya",
    promoSlug: "3-kvantmeditatsii-v-podarok",
  },
);
assert.deepEqual(
  parseMaxPromoTarget("/sergey-and-zoya/3-kvantmeditatsii-v-podarok/"),
  {
    authorSlug: "sergey-and-zoya",
    promoSlug: "3-kvantmeditatsii-v-podarok",
  },
);
for (const value of [
  null,
  "",
  "only-one",
  "a/b/c",
  "../a/b",
  "A/B",
  "a/b?x=1",
  "a_b/c",
]) {
  assert.equal(parseMaxPromoTarget(value), null);
}



const fallbackTarget = {
  authorSlug: "sergey-and-zoya",
  promoSlug: "3-kvantmeditatsii-v-podarok",
};
assert.equal(
  buildPublicPromoFallbackUrl(
    "https://max.audiolad.ru/?promo=sergey-and-zoya%2F3-kvantmeditatsii-v-podarok&utm_source=max&utm_campaign=gift&source=ads",
    fallbackTarget,
  ),
  "https://audiolad.ru/promo/sergey-and-zoya/3-kvantmeditatsii-v-podarok?utm_source=max&utm_campaign=gift&source=ads",
);
assert.equal(
  resolveMaxPromoBrowserFallback({
    locationHref:
      "https://max.audiolad.ru/?promo=sergey-and-zoya%2F3-kvantmeditatsii-v-podarok&utm_source=max",
    inMax: false,
    initData: null,
  }),
  "https://audiolad.ru/promo/sergey-and-zoya/3-kvantmeditatsii-v-podarok?utm_source=max",
);
assert.equal(
  resolveMaxPromoBrowserFallback({
    locationHref:
      "https://max.audiolad.ru/?promo=sergey-and-zoya%2F3-kvantmeditatsii-v-podarok&utm_source=max",
    inMax: true,
    initData: null,
  }),
  null,
);
assert.equal(
  resolveMaxPromoBrowserFallback({
    locationHref:
      "https://max.audiolad.ru/?promo=sergey-and-zoya%2F3-kvantmeditatsii-v-podarok",
    inMax: false,
    initData: "signed",
  }),
  null,
);
assert.equal(
  resolveMaxPromoBrowserFallback({
    locationHref: "https://max.audiolad.ru/?promo=bad",
    inMax: false,
    initData: null,
  }),
  null,
);

const parsedPage = readMaxPromoPage({
  promoPageId: "11111111-1111-4111-8111-111111111111",
  authorSlug: "sergey-and-zoya",
  promoSlug: "3-kvantmeditatsii-v-podarok",
  publicTitle: "3 КвантМедитации в подарок",
  publicDescription: "Короткие практики",
  footerText: "Выберите первую практику",
  bannerUrl: null,
  authorName: "Сергей и Зоя",
  cta: {
    heading: "Вернуться в чат в Максе",
    description: null,
    label: "Продолжить в MAX",
    href: "https://max.ru/id507305817690_bot",
    kind: "external",
    host: "max.ru",
    openInNewTab: false,
  },
  products: [{
    practiceId: "22222222-2222-4222-8222-222222222222",
    slug: "eliksir-molodosti",
    title: "Эликсир Молодости",
    format: "Квант-Медитация",
    durationMinutes: 5,
    coverUrl: null,
    authorName: "Сергей и Зоя",
    authorSlug: "sergey-and-zoya",
  }],
});
assert.equal(parsedPage?.products.length, 1);
assert.equal(parsedPage?.cta?.host, "max.ru");
assert.equal(readMaxPromoPage({ ...parsedPage, products: [] }), null);

const home = readFileSync(
  join(process.cwd(), "src/components/max/MaxAuthenticatedHome.tsx"),
  "utf8",
);
const promo = readFileSync(
  join(process.cwd(), "src/components/max/MaxPromoLanding.tsx"),
  "utf8",
);

assert.match(home, /readMaxPromoTargetFromLocation/);
assert.match(home, /queueMicrotask/);
assert.match(home, /<MaxPromoLanding target=\{promoTarget\}/);
assert.match(home, /url\.searchParams\.delete\("promo"\)/);
assert.match(home, /hidden=\{activeTab !== "catalog" \|\| Boolean\(promoTarget\)\}/);

assert.match(promo, /3 КвантМедитации|page\.publicTitle/);
assert.match(promo, /page\.publicDescription/);
assert.match(promo, /page\.products\.map/);
assert.match(promo, /Начать слушать/);
assert.match(promo, /MAX_PLAYBACK_SESSION_PATH/);
assert.match(promo, /MAX_PLAYBACK_AUDIO_PATH/);
assert.match(promo, /MAX_PLAYBACK_PREVIEW_PATH/);
assert.match(promo, /<MaxAudioPlayer/);
assert.match(promo, /page\.cta\.heading/);
assert.match(promo, /page\.cta\.label/);
assert.match(promo, /openMaxExternalLink/);
assert.match(promo, /page\.footerText/);

assert.match(promo, /trackMaxPromoViewedOnce/);
assert.match(promo, /trackMaxPromoPlayStartedOnce/);
assert.match(promo, /trackMaxPromoCompletedOnce/);
assert.match(promo, /trackMaxPromoCtaClicked/);
assert.match(promo, /onPlaybackStarted/);
assert.match(promo, /onPlaybackCompleted/);

assert.match(promo, /← В каталог/);
assert.doesNotMatch(promo, /from "next\/link"|from "next\/navigation"|router\.push|window\.location\s*=/);
assert.doesNotMatch(promo, /\/practice\//);

console.log("max-promo-page-unit: ok");
