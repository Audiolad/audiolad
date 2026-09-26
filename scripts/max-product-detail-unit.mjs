import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const source = readFileSync(join(process.cwd(), "src/components/max/MaxAuthenticatedHome.tsx"), "utf8");
const detailSource = readFileSync(join(process.cwd(), "src/components/max/MaxProductDetailView.tsx"), "utf8");
const legalFooterSource = readFileSync(join(process.cwd(), "src/components/max/MaxProductLegalFooter.tsx"), "utf8");
const catalogSource = readFileSync(join(process.cwd(), "src/components/max/MaxCatalogSearch.tsx"), "utf8");
assert.match(catalogSource, /key=\{`\$\{product\.authorSlug\}\/\$\{product\.slug\}`\}/);
assert.match(catalogSource, /<ul[\s\S]*<li[\s\S]*<button/);
assert.match(source, /status: "loading"/);
assert.match(source, /status: "not_found"/);
assert.match(source, /status: "error"/);
assert.match(source, /AbortController/);
assert.match(source, /controller\.abort/);
assert.match(source, /formatMaxDuration/);
assert.match(source, /readMaxProductDetail/);
assert.match(detailSource, /product\.coverUrl/);
assert.match(detailSource, /PracticeHeroGallery/);
assert.match(detailSource, /FEATURED_CARD_CHIP_CLASS/);
assert.match(detailSource, /FEATURED_CARD_TITLE_CLASS/);
assert.match(detailSource, /FEATURED_CARD_SUBTITLE_CLASS/);
assert.match(detailSource, /FEATURED_CARD_META_CLASS/);
assert.match(detailSource, /data-practice-hero-type-chip/);
assert.match(detailSource, /grid-cols-1/);
assert.match(detailSource, /h-14 w-14/);
assert.match(detailSource, /openCatalogProduct|onOpenRecommendation/);
assert.doesNotMatch(detailSource, /grid-cols-2/);
assert.doesNotMatch(detailSource, /max-w-\[280px\]/);
assert.doesNotMatch(detailSource, /from "next\/link"|<Link/);
assert.doesNotMatch(`${source}\n${detailSource}`, /h-48/);
assert.doesNotMatch(`${source}\n${detailSource}`, /h-24\s+w-20/);
assert.doesNotMatch(`${source}\n${detailSource}`, /window\.location|openLink|\/practice\/|audiolad\.ru/);
assert.match(source, /setPlayback\(\{ status: "idle" \}\); setDetail\(\{ status: "idle" \}\); setSelected\(null\)/);
assert.doesNotMatch(source, /description:\s*string \| null/);
assert.match(readFileSync(join(process.cwd(), "src/lib/max/product-view.ts"), "utf8"), /Array\.isArray\(value\.topics\)/);
assert.match(readFileSync(join(process.cwd(), "src/lib/max/product-view.ts"), "utf8"), /Array\.isArray\(value\.recommendations\)/);

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
const readyBlock = source.slice(readyStart);
assert.match(readyBlock, /PLAY_ACTION_LABEL/);
assert.match(readyBlock, /<MaxAudioPlayer/);
assert.match(catalogBlock, /product\.formatLabel/);
assert.match(catalogBlock, /!product\.isFree/);
assert.match(catalogBlock, /product\.priceLabel/);
assert.doesNotMatch(catalogBlock, /priceLabel !== "Подарок"/);
assert.match(detailSource, /product\.formatLabel/);
assert.match(detailSource, /!product\.isFree/);
assert.match(detailSource, /product\.priceLabel/);
assert.doesNotMatch(`${readyBlock}\n${detailSource}`, /priceLabel !== "Подарок"/);
assert.doesNotMatch(`${readyBlock}\n${detailSource}`, /Ещё от автора/);
assert.match(detailSource, /product\.recommendationsTitle/);
assert.match(detailSource, /Рекомендации автора|recommendationsTitle/);
assert.match(detailSource, /aria-label="Темы практики"/);
assert.match(detailSource, /Темы/);
assert.match(detailSource, /onClick=\{\(\) => onOpenTopic\(topic\.key\)\}/);
assert.match(detailSource, /<MaxProductLegalFooter/);
assert.match(legalFooterSource, /LEGAL_LINKS\.map/);
assert.match(legalFooterSource, /https:\/\/audiolad\.ru/);
assert.match(legalFooterSource, /openMaxExternalLink/);
assert.match(legalFooterSource, /Публичная оферта|LEGAL_LINKS/);
assert.doesNotMatch(legalFooterSource, /from "next\/link"|<Link/);
assert.doesNotMatch(detailSource, /product\.description|О продукте|Как слушать|Как использовать/);

const coverIndex = detailSource.indexOf("product.coverUrl");
const chipIndex = detailSource.indexOf('data-practice-hero-type-chip');
assert.ok(coverIndex >= 0 && chipIndex > coverIndex, "cover is rendered before the type pill");
const heroBody = detailSource.slice(chipIndex);
const fieldOrder = [
  "product.formatLabel",
  "product.title",
  "product.subtitle",
  "product.metaLine",
  "product.isFree",
  "product.priceLabel",
  "listenSlot",
  "MaxProductRating",
  "product.appreciation",
  "product.topics",
  "product.contents",
  "product.recommendations",
];
let lastIndex = -1;
for (const field of fieldOrder) {
  const index = heroBody.indexOf(field);
  assert.notEqual(index, -1, `detail UI renders ${field}`);
  assert.ok(index > lastIndex, `detail UI order includes ${field} after previous field`);
  lastIndex = index;
}

console.log("max-product-detail-unit: ok");
