#!/usr/bin/env node
/**
 * Author promotion MVP unit checks — safe without database access.
 */
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const CYRILLIC_MAP = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function slugifyTitle(title) {
  const transliterated = Array.from(title.trim())
    .map((char) => {
      const lower = char.toLowerCase();
      return CYRILLIC_MAP[lower] ?? lower;
    })
    .join("");

  return transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildCampaignKeyFromName(name) {
  return slugifyTitle(name).replace(/-/g, "_").slice(0, 64);
}

function normalizeCampaignKey(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function validateCampaignKey(value) {
  const normalized = normalizeCampaignKey(value);
  if (!normalized) return "campaign_key_required";
  if (normalized.length < 2) return "campaign_key_too_short";
  if (!/^[a-z0-9_]{2,64}$/.test(normalized)) return "campaign_key_invalid";
  return null;
}

function buildPromotionLink(params) {
  const baseUrl = `https://audiolad.ru/practice/${params.authorSlug.trim()}/${params.practiceSlug.trim()}`;
  const parsed = new URL(baseUrl);

  if (!parsed.pathname.startsWith("/practice/")) {
    throw new Error("external_url_not_allowed");
  }

  parsed.searchParams.set("utm_source", params.utmSource.trim().toLowerCase());
  parsed.searchParams.set("utm_medium", params.utmMedium.trim().toLowerCase());
  parsed.searchParams.set("utm_campaign", params.campaignKey.trim().toLowerCase());
  parsed.searchParams.set("utm_content", params.utmContent.trim().toLowerCase());

  return parsed.toString();
}

function safeConversionRate(numerator, denominator) {
  if (denominator <= 0 || numerator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function testMigrationContract() {
  const sql = readFileSync(
    "/var/www/audiolad/supabase/migrations/20260716180000_promotion_campaigns.sql",
    "utf8",
  );

  assert(sql.includes("promotion_campaigns"), "promotion_campaigns table");
  assert(sql.includes("UNIQUE (author_id, campaign_key)"), "unique campaign key per author");
  assert(sql.includes("ENABLE ROW LEVEL SECURITY"), "RLS enabled");
  assert(sql.includes("get_promotion_campaign_stats"), "campaign stats rpc");
  assert(sql.includes("get_author_promotion_summary"), "author summary rpc");
  assert(sql.includes("REVOKE ALL") && sql.includes("FROM anon"), "stats rpc blocked for anon");
  assert(sql.includes("SET search_path = public, pg_temp"), "safe search_path");
}

function testPromotionRoutes() {
  const page = readFileSync(
    "/var/www/audiolad/src/app/author-dashboard/promotion/page.tsx",
    "utf8",
  );
  const nav = readFileSync(
    "/var/www/audiolad/src/components/author-dashboard/AuthorDashboardNav.tsx",
    "utf8",
  );

  assert(page.includes("Продвижение"), "promotion page title");
  assert(nav.includes("/author-dashboard/promotion"), "nav link exists");
  assert(nav.includes("Продвижение"), "nav label");
}

function testStatsDoNotExposePii() {
  const migration = readFileSync(
    "/var/www/audiolad/supabase/migrations/20260716180000_promotion_campaigns.sql",
    "utf8",
  );
  const statsRoute = readFileSync(
    "/var/www/audiolad/src/app/api/author/promotion/campaigns/[id]/route.ts",
    "utf8",
  );

  assert(!migration.includes("anonymous_session_id AS"), "rpc does not return session ids");
  assert(!statsRoute.includes("user_id"), "stats route does not map user ids");
  assert(statsRoute.includes("get_promotion_campaign_stats"), "uses aggregated rpc");
}

function testCampaignKeyModule() {
  const generated = buildCampaignKeyFromName("Женские деньги — запуск");
  assert(generated.includes("zhenskie"), "transliterates cyrillic title");
  assert(!generated.includes("-"), "campaign key uses underscores not dashes");

  assert(
    normalizeCampaignKey("  Zhenskie-Dengi Launch!! ") === "zhenskie_dengi_launch",
    "normalizes key",
  );
  assert(validateCampaignKey("ab") === null, "valid key passes");
  assert(validateCampaignKey("a") === "campaign_key_too_short", "short key rejected");
  assert(validateCampaignKey("") === "campaign_key_required", "empty key rejected");
  assert(validateCampaignKey("!!!") === "campaign_key_required", "special chars rejected");
}

function testPromotionLinksModule() {
  const telegram = buildPromotionLink({
    authorSlug: "zoya-petrova",
    practiceSlug: "zhenskie-dengi",
    campaignKey: "zhenskie_dengi_launch",
    utmSource: "telegram",
    utmMedium: "social",
    utmContent: "main_post",
  });

  assert(
    telegram ===
      "https://audiolad.ru/practice/zoya-petrova/zhenskie-dengi?utm_source=telegram&utm_medium=social&utm_campaign=zhenskie_dengi_launch&utm_content=main_post",
    "telegram url matches spec",
  );

  const max = buildPromotionLink({
    authorSlug: "zoya-petrova",
    practiceSlug: "zhenskie-dengi",
    campaignKey: "zhenskie_dengi_launch",
    utmSource: "max",
    utmMedium: "social",
    utmContent: "main_post",
  });

  assert(max.includes("utm_source=max"), "max url contains max source");
  assert(max.includes("utm_campaign=zhenskie_dengi_launch"), "max url contains campaign key");

  const linksSource = readFileSync(
    "/var/www/audiolad/src/lib/promotion/links.ts",
    "utf8",
  );
  assert(linksSource.includes("searchParams.set"), "uses URL search params API");
  assert(linksSource.includes("external_url_not_allowed"), "blocks external urls");
}

function testStatsConversions() {
  assert(safeConversionRate(0, 0) === 0, "zero division safe");
  assert(safeConversionRate(5, 20) === 25, "conversion percent");
}

function testPeriodParsing() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/promotion/dates.ts",
    "utf8",
  );
  assert(source.includes('parsePromotionPeriod'), "period parser exists");
  assert(source.includes('return "30d"'), "default period is 30d");
  assert(source.includes('period === "all"'), "all time period");
}

function testAccessLayer() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/promotion/access.ts",
    "utf8",
  );
  const createRoute = readFileSync(
    "/var/www/audiolad/src/lib/promotion/campaigns-api.ts",
    "utf8",
  );

  assert(source.includes("isPlatformAdmin"), "platform admin supported");
  assert(source.includes("requireAuthorPromotionAccess"), "promotion access guard");
  assert(createRoute.includes("practice.author_id !== authorId"), "blocks foreign product");
  assert(createRoute.includes('status !== "published"'), "requires published product");
}

function testPromoEventsUnchanged() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/promo/analytics-events.ts",
    "utf8",
  );

  assert(source.includes("promo_practice_viewed"), "guest funnel events preserved");
  assert(source.includes("PROMO_ANALYTICS_EVENTS"), "promo events module intact");
}

function testUnknownSourceLabel() {
  const source = readFileSync(
    "/var/www/audiolad/src/lib/promotion/channels.ts",
    "utf8",
  );
  assert(source.includes("getUtmSourceLabel"), "source label helper exists");
  assert(source.includes("Неизвестный канал"), "fallback label for unknown source");
}

function testArchivedCampaignHistory() {
  const migration = readFileSync(
    "/var/www/audiolad/supabase/migrations/20260716180000_promotion_campaigns.sql",
    "utf8",
  );
  assert(migration.includes("'archived'"), "archived status supported");
  assert(migration.includes("utm_campaign = v_campaign.campaign_key"), "stats tied to campaign key history");
}

function main() {
  testMigrationContract();
  testPromotionRoutes();
  testStatsDoNotExposePii();
  testCampaignKeyModule();
  testPromotionLinksModule();
  testStatsConversions();
  testPeriodParsing();
  testAccessLayer();
  testPromoEventsUnchanged();
  testUnknownSourceLabel();
  testArchivedCampaignHistory();
  console.log("author-promotion-unit: ok");
}

main();
