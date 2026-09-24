import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const source = readFileSync(join(process.cwd(), "src/components/max/MaxAuthenticatedHome.tsx"), "utf8");
assert.match(source, /key=\{`\$\{product\.authorSlug\}\/\$\{product\.slug\}`\}/);
assert.match(source, /<ul[\s\S]*<li[\s\S]*<button/);
assert.match(source, /status: "loading"/);
assert.match(source, /status: "not_found"/);
assert.match(source, /status: "error"/);
assert.match(source, /AbortController/);
assert.match(source, /controller\.abort/);
assert.match(source, /formatMaxDuration/);
assert.match(source, /detail\.product\.coverUrl/);
assert.match(source, /aspect-square/);
assert.match(source, /max-w-\[280px\]/);
assert.match(source, /mx-auto/);
assert.match(source, /object-cover/);
assert.doesNotMatch(source, /h-48/);
assert.doesNotMatch(source, /h-24\s+w-20/);
assert.doesNotMatch(source, /window\.location|openLink|\/practice\/|audiolad\.ru/);
assert.match(source, /setPlayback\(\{ status: "idle" \}\); setDetail\(\{ status: "idle" \}\); setSelected\(null\)/);

const catalogStart = source.indexOf("catalog.items.map");
assert.notEqual(catalogStart, -1, "catalog list exists");
const readyStart = source.indexOf('{detail.status === "ready" ?');
assert.notEqual(readyStart, -1, "ready detail block exists");
const catalogBlock = source.slice(catalogStart, readyStart);
assert.match(catalogBlock, /aspect-square/);
assert.match(catalogBlock, /w-24/);
assert.match(catalogBlock, /shrink-0/);
assert.match(catalogBlock, /h-full w-full object-cover/);
assert.doesNotMatch(catalogBlock, /h-24|w-20/);
assert.match(source.slice(readyStart), /max-w-\[280px\]/);
assert.match(source.slice(readyStart), /aspect-square/);
const readyBlock = source.slice(readyStart);
const headerEnd = Math.min(
  ...["MaxAudioPlayer", 'playback.status === "loading"', "detail.product.description"]
    .map((marker) => readyBlock.indexOf(marker))
    .filter((index) => index >= 0),
);
assert.ok(headerEnd > 0, "ready detail has a header before playback/description");
const detailHeader = readyBlock.slice(0, headerEnd);
assert.doesNotMatch(detailHeader, /detail\.product\.formatLabel/);
assert.match(catalogBlock, /product\.formatLabel/);
assert.match(catalogBlock, /!product\.isFree/);
assert.match(catalogBlock, /product\.priceLabel/);
assert.doesNotMatch(catalogBlock, /priceLabel !== "Подарок"/);
assert.match(readyBlock, /!selected\.isFree/);
assert.match(readyBlock, /detail\.product\.priceLabel/);
assert.doesNotMatch(readyBlock, /priceLabel !== "Подарок"/);

const fieldOrder = [
  "detail.product.coverUrl",
  "detail.product.title",
  "detail.product.subtitle",
  "detail.product.authorName",
  "detail.product.statsLabel",
  "selected.isFree",
  "detail.product.priceLabel",
  "MaxAudioPlayer",
  "detail.product.description",
  "detail.product.contents",
];
let lastIndex = -1;
for (const field of fieldOrder) {
  const index = readyBlock.indexOf(field);
  assert.notEqual(index, -1, `ready UI renders ${field}`);
  assert.ok(index > lastIndex, `ready UI order includes ${field} after previous field`);
  lastIndex = index;
}

assert.ok(
  readyBlock.indexOf("detail.product.statsLabel") < readyBlock.indexOf("MaxAudioPlayer"),
  "statsLabel is before player",
);
assert.ok(
  readyBlock.indexOf("detail.product.priceLabel") < readyBlock.indexOf("MaxAudioPlayer"),
  "paid price is before player",
);
assert.ok(
  readyBlock.indexOf("MaxAudioPlayer") < readyBlock.indexOf("detail.product.description"),
  "description is after player",
);
assert.ok(
  readyBlock.indexOf('playback.status === "loading"') <
    readyBlock.indexOf("detail.product.description"),
  "playback states are before description",
);

console.log("max-product-detail-unit: ok");
