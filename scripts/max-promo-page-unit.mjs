import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  parseMaxPromoTarget,
} from "../src/lib/max/promo-target.ts";

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
assert.match(promo, /← В каталог/);
assert.doesNotMatch(promo, /from "next\/link"|from "next\/navigation"|router\.push|window\.location\s*=/);
assert.doesNotMatch(promo, /\/practice\//);

console.log("max-promo-page-unit: ok");
