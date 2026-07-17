#!/usr/bin/env node
/**
 * Catalog topic filter unit checks (no DB).
 */
import {
  buildCatalogTopicHref,
  getCatalogTopicFilterLabel,
  normalizeCatalogTopicParam,
  parseCatalogTopicFilter,
  resolveCatalogTopicSearchParam,
} from "../src/lib/catalog/topic-filter.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const allowedKeys = ["money", "relationships", "calm"];

assert(parseCatalogTopicFilter(undefined, allowedKeys) === null, "missing param -> all");
assert(parseCatalogTopicFilter("", allowedKeys) === null, "empty param -> all");
assert(parseCatalogTopicFilter("money", allowedKeys) === "money", "valid key");
assert(parseCatalogTopicFilter("MONEY", allowedKeys) === "money", "case insensitive");
assert(parseCatalogTopicFilter("unknown", allowedKeys) === null, "unknown key -> all");
assert(parseCatalogTopicFilter("bad key", allowedKeys) === null, "invalid format -> all");
assert(parseCatalogTopicFilter("self-worth", ["self-worth"]) === "self-worth", "hyphenated key");

assert(buildCatalogTopicHref(null) === "/catalog", "all href");
assert(buildCatalogTopicHref("money") === "/catalog?topic=money", "topic href");
assert(
  buildCatalogTopicHref("self-worth") === "/catalog?topic=self-worth",
  "encoded topic href",
);

assert(normalizeCatalogTopicParam(" Purpose ") === "purpose", "normalize trims");
assert(normalizeCatalogTopicParam("bad key") === null, "normalize rejects spaces");

assert(
  getCatalogTopicFilterLabel("money", [
    { key: "money", title: "Деньги" },
    { key: "calm", title: "Спокойствие" },
  ]) === "Деньги",
  "label lookup",
);
assert(getCatalogTopicFilterLabel(null, []) === null, "no label for all");

assert(
  resolveCatalogTopicSearchParam({ topic: "money" }) === "money",
  "topic param wins",
);
assert(
  resolveCatalogTopicSearchParam({ need: "relationships" }) === "relationships",
  "legacy need maps to topic key",
);
assert(
  resolveCatalogTopicSearchParam({ need: "relax" }) === undefined,
  "unknown legacy need ignored",
);
assert(
  resolveCatalogTopicSearchParam({ topic: "", need: "relationships" }) === "relationships",
  "empty topic falls back to legacy need",
);

console.log("catalog-topic-filter-unit: ok");
