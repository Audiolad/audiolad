#!/usr/bin/env node
/**
 * Catalog card metrics placement: format row (left type, right ▶/★), not author row.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function metricsOnFormatRow(shell) {
  const formatAt = shell.indexOf("data-catalog-card-format");
  const metricsAt = shell.indexOf("<CatalogCardPublicMetrics");
  const authorAt = shell.indexOf("card.author.name");
  assert.ok(formatAt !== -1 && metricsAt !== -1, "format row and metrics exist");
  assert.ok(metricsAt < authorAt, "metrics render before author line");
  const formatBlock = shell.slice(formatAt, metricsAt + 80);
  assert.match(formatBlock, /data-catalog-card-format[\s\S]*CatalogCardPublicMetrics/);
  const authorBlock = shell.slice(authorAt, authorAt + 200);
  assert.doesNotMatch(
    authorBlock,
    /CatalogCardPublicMetrics/,
    "author row must not host metrics",
  );
}

const shell = read("src/components/catalog/cards/CatalogCardShell.tsx");
const maxCard = read("src/components/max/MaxCatalogProductCard.tsx");
const metrics = read("src/components/catalog/CatalogCardPublicMetrics.tsx");

metricsOnFormatRow(shell);

assert.match(
  maxCard,
  /CATALOG_CARD_RUBRIC_LINE_CLASS[\s\S]{0,180}formatLabel[\s\S]{0,180}CatalogCardPublicMetrics/,
  "MAX: metrics on format row with web class",
);

assert.match(shell, /flex items-center gap-2[\s\S]*data-catalog-card-format/);
assert.match(shell, /CATALOG_CARD_RUBRIC_LINE_CLASS/);
assert.match(maxCard, /CATALOG_CARD_RUBRIC_LINE_CLASS/);
const format = read("src/lib/author-products/format.ts");
assert.match(
  format,
  /CATALOG_CARD_RUBRIC_LINE_CLASS[\s\S]*text-\[8px\][\s\S]*sm:text-\[11px\]/,
  "mobile rubric ~30% smaller than 11px desktop",
);
assert.match(metrics, /data-catalog-card-public-metrics/);
assert.match(metrics, /text-\[#9485b4\]/, "secondary metadata color");

const maxLabelAt = maxCard.indexOf("{product.formatLabel}");
const maxRenderMetricsAt = maxCard.indexOf(
  "<CatalogCardPublicMetrics metrics={maxProductPublicMetrics(product)}",
);
const maxAuthorAt = maxCard.indexOf("{product.authorName");
assert.ok(maxRenderMetricsAt !== -1 && maxLabelAt !== -1);
assert.ok(maxRenderMetricsAt < maxAuthorAt);
assert.match(
  maxCard.slice(maxLabelAt - 120, maxRenderMetricsAt + 80),
  /formatLabel[\s\S]*CatalogCardPublicMetrics/,
);
assert.doesNotMatch(
  maxCard.slice(maxAuthorAt, maxAuthorAt + 160),
  /CatalogCardPublicMetrics/,
);

console.log("catalog-card-metrics-unit: ok");