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
  assert.match(card, /max-w-\[420px\][^"]*shadow-\[0_10px_30px/, "mobile card keeps 420px + shadow");
  assert.match(card, /min-\[560px\]:grid-cols-\[auto_minmax\(0,1fr\)\]/, "desktop card is horizontal");
  assert.match(card, /min-\[560px\]:shadow-none/, "desktop card has no clipped shadow");
}
