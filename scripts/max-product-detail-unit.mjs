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
assert.equal(source.includes("setDetail({ status: \"idle\" }); setSelected(null)"), true);

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
const fieldOrder = [
  "detail.product.coverUrl",
  "detail.product.formatLabel",
  "detail.product.title",
  "detail.product.subtitle",
  "detail.product.authorName",
  "detail.product.priceLabel",
  "detail.product.statsLabel",
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

console.log("max-product-detail-unit: ok");
