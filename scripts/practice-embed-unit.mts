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

// Parent-page touch shields cover only the cover and info above the actions in either layout.
{
  const card = await readFile(new URL("../src/components/embed/PracticeEmbedCard.tsx", import.meta.url), "utf8");
  assert.match(card, /ref=\{coverRef\}[^>]*data-practice-embed-cover="true"/);
  assert.match(card, /ref=\{infoRef\}[^>]*className="shrink-0 px-5/);
  assert.match(card, /ref=\{actionsRef\}[^>]*data-practice-embed-actions="true"/);
  for (const ref of ["coverRef", "infoRef", "actionsRef"]) {
    assert.ok(card.includes(`${ref}.current?.getBoundingClientRect()`), `${ref} supplies viewport geometry`);
  }
  assert.match(card, /left: info\.left,[\s\S]*?top: info\.top,[\s\S]*?width: info\.width,[\s\S]*?height: Math\.max\(0, actions\.top - info\.top\)/);
  assert.match(card, /x: Math\.floor\(rect\.left\)/);
  assert.match(card, /y: Math\.floor\(rect\.top\)/);
  assert.match(card, /width: Math\.ceil\(rect\.width\)/);
  assert.match(card, /height: Math\.ceil\(rect\.height\)/);
  assert.match(card, /filter\(\(rect\) => rect\.width > 0 && rect\.height > 0\)/);
  assert.match(card, /const key = JSON\.stringify\(\{ height, wide, shield \}\)/, "geometry changes bypass deduplication");
  assert.match(card, /observer\?\.observe\(infoRef\.current\)/);
  assert.match(card, /observer\?\.observe\(actionsRef\.current\)/);
  assert.match(card, /window\.parent === window/, "standalone cards send no geometry");
  assert.match(card, /window\.parent\.postMessage\(\{ type: "audiolad:embed-height", height, wide, shield \}, "\*"\)/);
}
