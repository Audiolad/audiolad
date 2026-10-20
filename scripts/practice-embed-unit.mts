import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildEmbedFrameAncestorsPolicy,
  EMBED_FRAME_ANCESTORS,
} from "../src/lib/embed/frame-policy";
import {
  buildPracticeEmbedPath,
  resolvePracticeEmbedMode,
  withEmbedUtm,
} from "../src/lib/embed/practice-embed";

import { computeEmbedShield, type EmbedRect } from "../src/lib/embed/embed-shield";

const base = { canListen: true, isCourse: false, hasPlayableAudio: true } as const;

assert.equal(resolvePracticeEmbedMode({ ...base, accessReason: "free" }), "play");
for (const reason of [
  "guest_promo",
  "payment_required",
  "not_authenticated",
  "author_owner",
  "purchased",
  "admin",
] as const) {
  assert.equal(
    resolvePracticeEmbedMode({ ...base, accessReason: reason as never }),
    "link",
    `${reason} must never play in embed`,
  );
}
assert.equal(resolvePracticeEmbedMode({ ...base, accessReason: "free", canListen: false }), "link");
assert.equal(resolvePracticeEmbedMode({ ...base, accessReason: "free", isCourse: true }), "link");
assert.equal(
  resolvePracticeEmbedMode({ ...base, accessReason: "free", hasPlayableAudio: false }),
  "link",
);

assert.deepEqual([...EMBED_FRAME_ANCESTORS], ["https://sergey-zoya.ru", "https://www.sergey-zoya.ru"]);
const policy = buildEmbedFrameAncestorsPolicy();
assert.equal(policy, "frame-ancestors 'self' https://sergey-zoya.ru https://www.sergey-zoya.ru");
assert.ok(!policy.includes("*"), "no wildcard ancestors");

assert.equal(buildPracticeEmbedPath("zoya-petrova", "lyubov-k-sebe"), "/embed/practice/zoya-petrova/lyubov-k-sebe");
const utm = new URL(withEmbedUtm("https://audiolad.ru/practice/a/b", "Sergey-Zoya.ru<script>"));
assert.equal(utm.searchParams.get("utm_source"), "sergey-zoya.ruscript");
assert.equal(utm.searchParams.get("utm_medium"), "embed");
assert.equal(new URL(withEmbedUtm("https://audiolad.ru/x", null)).searchParams.get("utm_source"), "embed");

const config = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
assert.match(config, /source: "\/embed\/:path\*"[\s\S]*?buildEmbedFrameAncestorsPolicy\(\)/);

const page = await readFile(
  new URL("../src/app/embed/practice/[authorSlug]/[productSlug]/page.tsx", import.meta.url),
  "utf8",
);
assert.match(page, /resolveProductAccess\(supabase, practice, null\)/, "embed access is always anonymous");
assert.match(page, /entitledAccess: false/);
assert.match(page, /authorPreview: false/);
assert.match(page, /audioItemId=\{mode === "play"/);
assert.ok(!page.includes("createServiceRoleClient"), "embed page must not use service role");

const providers = await readFile(
  new URL("../src/components/providers/BaseProviders.tsx", import.meta.url),
  "utf8",
);
assert.match(providers, /pathname\.startsWith\("\/embed\/"\)/, "no third-party analytics inside partner frames");

console.log("practice-embed-unit: ok");

// Wide frames (partner desktop) use the horizontal practice-hero layout; narrow ones stay vertical.
{
  const card = await readFile(new URL("../src/components/embed/PracticeEmbedCard.tsx", import.meta.url), "utf8");
  assert.match(card, /max-w-\[420px\][^"]*shadow-none/, "mobile card keeps 420px, no (purple) shadow");
  assert.ok(!/shadow-\[/.test(card), "no tinted shadow anywhere in the embed card");
  assert.match(card, /html,body\{background:transparent!important[;}]/, "embed document is transparent (no lilac band)");
  assert.match(card, /min-\[560px\]:grid-cols-\[auto_minmax\(0,1fr\)\]/, "desktop card is horizontal");
  
}

// Partner mobile: card fills the iframe exactly (no nested scroll / jitter), «Аудиолад» sits in the button row.
{
  const card = await readFile(new URL("../src/components/embed/PracticeEmbedCard.tsx", import.meta.url), "utf8");
  const root = card.match(/<main\s+data-practice-embed-root="true"[\s\S]*?>/)?.[0] ?? "";
  assert.match(root, /className="flex h-screen supports-\[height:100dvh\]:h-dvh [^"]*overflow-clip/, "embed root clips without creating a scroll container");
  assert.ok(!root.includes("overflow-hidden"), "embed root must not create a scroll container");
  assert.ok(!/overscroll-behavior\s*:\s*(?:none|contain)|overscroll-(none|contain|y-none|y-contain)/.test(card), "embed must not block scroll chaining");
  assert.match(card, /overscroll-behavior:auto!important/, "html/body keep scroll chaining even in standalone display-mode");
  assert.ok(!/min-h-dvh/.test(card), "no min-h-dvh: content must not outgrow the frame");
  assert.match(card, /data-practice-embed-cover="true"\s+className="relative aspect-square w-full shrink-0 /, "narrow cover is square and never cropped by flex");
  assert.ok(!/min-h-0 w-full flex-1/.test(card), "cover no longer flexes to the frame height (that cropped the title on the cover)");
  assert.match(card, /type: "audiolad:embed-height", height, wide, shield/, "card reports height, layout and shield geometry to the partner");
  assert.match(card, /"audiolad:embed-height-request"\) post\(true\)/, "partner can re-request the height (no lost first message)");
  assert.match(card, /event\.source !== window\.parent/, "only the embedding page may request the height");
  assert.match(card, /className="flex h-auto w-full max-w-\[420px\]/, "narrow card has its natural height");
  const actions = card.slice(card.indexOf('data-practice-embed-actions'), card.indexOf('data-practice-embed-progress'));
  assert.match(actions, /data-practice-embed-brand="true"[\s\S]*Аудиолад/, "brand label is in the «Слушать» row");
  assert.match(actions, /ml-auto/, "brand label is right-aligned");
}

// Parent-page shields partition the viewport around padded controls.
{
  const viewport = { width: 380, height: 605 };
  const controls = [
    { x: 20, y: 525, width: 130, height: 44 },
    { x: 320, y: 539, width: 50, height: 16 },
  ];
  const contains = (rect: EmbedRect, x: number, y: number) =>
    x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
  const intersects = (a: EmbedRect, b: EmbedRect) =>
    a.x < b.x + b.width && a.x + a.width > b.x &&
    a.y < b.y + b.height && a.y + a.height > b.y;
  const verify = (items: EmbedRect[], pad = 4, step = 5) => {
    const shield = computeEmbedShield(viewport, items, pad);
    const inflated = items.map((rect) => {
      const x = Math.floor(rect.x - pad);
      const y = Math.floor(rect.y - pad);
      return { x, y, width: Math.ceil(rect.x + rect.width + pad) - x,
        height: Math.ceil(rect.y + rect.height + pad) - y };
    });
    for (const [index, rect] of shield.entries()) {
      assert.ok(Object.values(rect).every(Number.isInteger), "integer geometry");
      assert.ok(rect.width > 0 && rect.height > 0);
      assert.ok(rect.x >= 0 && rect.y >= 0 &&
        rect.x + rect.width <= viewport.width && rect.y + rect.height <= viewport.height);
      assert.ok(inflated.every((hole) => !intersects(rect, hole)), "no shield overlaps controls");
      assert.ok(shield.slice(index + 1).every((other) => !intersects(rect, other)), "shields do not overlap");
    }
    for (let y = 0; y < viewport.height; y += step) {
      for (let x = 0; x < viewport.width; x += step) {
        const count = shield.filter((rect) => contains(rect, x, y)).length;
        assert.equal(count, inflated.some((rect) => contains(rect, x, y)) ? 0 : 1,
          `exact partition at ${x},${y}`);
      }
    }
    return shield;
  };
  const shield = verify(controls);
  assert.deepEqual(shield.filter((rect) => rect.y < 380),
    [{ x: 0, y: 0, width: 380, height: 521 }], "cover merges into one full-width shield");
  verify([...controls, { x: 18.7, y: 580.2, width: 340.1, height: 20.4 }], 4, 1);
  verify([
    { x: -10.2, y: 20.7, width: 70.5, height: 30.1 },
    { x: 40.1, y: 30.2, width: 80.8, height: 50.3 },
    { x: 390, y: 10, width: 20, height: 20 },
    { x: 360, y: 590, width: 50, height: 50 },
  ], 4, 1);
  verify(controls, 0);
  assert.deepEqual(computeEmbedShield(viewport, []), [{ x: 0, y: 0, ...viewport }]);
  assert.deepEqual(computeEmbedShield(viewport,
    [{ x: -10, y: -10, width: 400, height: 630 }]), []);
  for (const invalid of [NaN, Infinity, -Infinity, 0, -1]) {
    assert.deepEqual(computeEmbedShield({ width: invalid, height: 605 }, controls), []);
    assert.deepEqual(computeEmbedShield({ width: 380, height: invalid }, controls), []);
  }
  for (const key of ["x", "y", "width", "height"] as const) {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      assert.deepEqual(computeEmbedShield(viewport, [{ ...controls[0], [key]: invalid }]),
        computeEmbedShield(viewport, []), "ignore non-finite controls");
    }
  }
  for (const key of ["width", "height"] as const) {
    assert.deepEqual(computeEmbedShield(viewport, [{ ...controls[0], [key]: 0 }]),
      computeEmbedShield(viewport, []), "ignore zero-size controls");
  }
  const stripes = Array.from({ length: 20 }, (_, i) =>
    ({ x: 0, y: 10 + i * 20, width: 380, height: 2 }));
  assert.deepEqual(computeEmbedShield(viewport, stripes, 0),
    Array.from({ length: 16 }, (_, i) =>
      ({ x: 0, y: i === 0 ? 0 : 12 + (i - 1) * 20, width: 380, height: i === 0 ? 10 : 18 })),
    "cap keeps the first 16 shields in top-to-bottom order");
}

{
  const card = await readFile(new URL("../src/components/embed/PracticeEmbedCard.tsx", import.meta.url), "utf8");
  assert.match(card, /const shield = computeEmbedShield\(\s*\{ width: window\.innerWidth, height: window\.innerHeight \}, controls/);
  assert.match(card, /const key = JSON\.stringify\(\{ height, wide, shield \}\)/, "geometry changes bypass deduplication");
  assert.match(card, /observer\?\.observe\(el\)/);
  assert.match(card, /\[state, canPlayInline\]/, "conditional progress changes repost geometry");
  assert.match(card, /window\.parent === window/, "standalone cards send no geometry");
  assert.match(card, /window\.parent\.postMessage\(\{ type: "audiolad:embed-height", height, wide, shield \}, "\*"\)/);
}
