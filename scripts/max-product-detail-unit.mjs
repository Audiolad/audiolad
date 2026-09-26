import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const source = readFileSync(join(process.cwd(), "src/components/max/MaxAuthenticatedHome.tsx"), "utf8");
const catalogSource = readFileSync(join(process.cwd(), "src/components/max/MaxCatalogSearch.tsx"), "utf8");
assert.match(catalogSource, /key=\{`\$\{product\.authorSlug\}\/\$\{product\.slug\}`\}/);
assert.match(catalogSource, /<ul[\s\S]*<li[\s\S]*<button/);
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
assert.doesNotMatch(source, /description:\s*string \| null/);
assert.match(source, /Array\.isArray\(product\.topics\)/);
assert.match(source, /Array\.isArray\(product\.recommendations\)/);

const catalogStart = catalogSource.indexOf('<ul className="mt-5 -mx-4 grid grid-cols-2 gap-[6px] px-[6px]">');
assert.notEqual(catalogStart, -1, "catalog list exists");
const readyStart = source.indexOf('{detail.status === "ready" ?');
assert.notEqual(readyStart, -1, "ready detail block exists");
const catalogBlock = catalogSource.slice(catalogStart);
assert.match(catalogBlock, /grid-cols-2/);
assert.match(catalogBlock, /gap-\[6px\]/);
assert.match(catalogBlock, /-mx-4/);
assert.match(catalogBlock, /px-\[6px\]/);
assert.match(catalogBlock, /className="min-w-0"/);
assert.match(catalogBlock, /flex-col/);
assert.match(catalogBlock, /rounded-\[20px\]/);
assert.match(catalogBlock, /aspect-square w-full/);
assert.match(catalogBlock, /h-full w-full object-cover/);
assert.match(catalogBlock, /line-clamp-2 min-h-10 text-\[14px\]/);
assert.match(catalogBlock, /px-2\.5 pb-2\.5 pt-2/);
assert.match(catalogBlock, /min-h-5/);
assert.match(catalogBlock, /whitespace-nowrap text-xs/);
assert.match(catalogBlock, /border-\[#eadff8\]/);
assert.doesNotMatch(catalogBlock, /product\.subtitle/);
assert.doesNotMatch(catalogBlock, /flex min-h-28/);
assert.doesNotMatch(catalogBlock, /w-24/);
assert.doesNotMatch(catalogBlock, /shrink-0/);
assert.doesNotMatch(catalogBlock, /h-24|w-20/);
assert.doesNotMatch(catalogBlock, /Подарок|Бесплатно/);
assert.doesNotMatch(catalogBlock, /CatalogProductHeart|CatalogProductPlay|favorite/i);
assert.match(catalogBlock, /onSelectProduct\(product\)/);
assert.match(source, /setSelected\(product\)/);
assert.ok(
  catalogBlock.indexOf("product.formatLabel") < catalogBlock.indexOf("product.title"),
  "catalog card shows format above title",
);
assert.ok(
  catalogBlock.indexOf("product.title") < catalogBlock.indexOf("product.authorName"),
  "catalog card shows title above author",
);
assert.ok(
  catalogBlock.indexOf("product.authorName") < catalogBlock.indexOf("!product.isFree"),
  "catalog card shows author above paid price",
);
assert.match(source.slice(readyStart), /max-w-\[280px\]/);
assert.match(source.slice(readyStart), /aspect-square/);
const readyBlock = source.slice(readyStart);
const headerEnd = Math.min(
  ...["MaxAudioPlayer", 'playback.status === "loading"']
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
  "detail.product.topics",
  "selected.isFree",
  "detail.product.priceLabel",
  "MaxAudioPlayer",
  "detail.product.contents",
  "detail.product.recommendations",
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
assert.doesNotMatch(readyBlock, /detail\.product\.description/);
assert.match(readyBlock, /aria-label="Темы продукта"/);
assert.match(readyBlock, /Ещё от автора/);
assert.match(readyBlock, /onClick=\{\(\) => openCatalogProduct\(product\)\}/);
assert.ok(
  readyBlock.indexOf("detail.product.topics") < readyBlock.indexOf("MaxAudioPlayer"),
  "topics are before player",
);
assert.ok(
  readyBlock.indexOf("detail.product.contents") <
    readyBlock.indexOf("detail.product.recommendations"),
  "recommendations are after the product content",
);

console.log("max-product-detail-unit: ok");
