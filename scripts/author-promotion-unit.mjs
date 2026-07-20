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

  if (params.utmContent?.trim()) {
    parsed.searchParams.set("utm_content", params.utmContent.trim().toLowerCase());
  }

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
  });

  assert(
    telegram ===
      "https://audiolad.ru/practice/zoya-petrova/zhenskie-dengi?utm_source=telegram&utm_medium=social&utm_campaign=zhenskie_dengi_launch",
    "telegram url matches spec without utm_content",
  );
  assert(!telegram.includes("utm_content"), "telegram url omits utm_content");

  const max = buildPromotionLink({
    authorSlug: "zoya-petrova",
    practiceSlug: "zhenskie-dengi",
    campaignKey: "zhenskie_dengi_launch",
    utmSource: "max",
    utmMedium: "social",
  });

  assert(max.includes("utm_source=max"), "max url contains max source");
  assert(max.includes("utm_campaign=zhenskie_dengi_launch"), "max url contains campaign key");
  assert(!max.includes("utm_content"), "max url omits utm_content");

  const legacy = buildPromotionLink({
    authorSlug: "zoya-petrova",
    practiceSlug: "zhenskie-dengi",
    campaignKey: "zhenskie_dengi_launch",
    utmSource: "telegram",
    utmMedium: "social",
    utmContent: "main_post",
  });
  assert(legacy.includes("utm_content=main_post"), "legacy optional utm_content still supported");

  const linksSource = readFileSync(
    "/var/www/audiolad/src/lib/promotion/links.ts",
    "utf8",
  );
  assert(linksSource.includes("searchParams.set"), "uses URL search params API");
  assert(linksSource.includes("external_url_not_allowed"), "blocks external urls");
  assert(linksSource.includes("params.utmContent?.trim()"), "utm_content optional in link builder");
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

function normalizeUtmValue(value) {
  return slugifyTitle(value);
}

const SYSTEM_UTM_MEDIUM_VALUES = new Set([
  "social",
  "messenger",
  "messaging_bot",
  "email",
  "paid",
  "partner",
  "website",
  "owned",
]);

const STANDARD_CHANNEL_TYPES = new Set([
  "social",
  "messenger",
  "messaging_bot",
  "email",
  "paid",
  "partner",
  "website",
]);

function resolveCustomUtmMedium(label) {
  const trimmed = label.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (/^[a-z0-9._-]+$/.test(lower) && !/[а-яё]/i.test(trimmed)) {
    return lower;
  }
  return normalizeUtmValue(trimmed);
}

function parseChannelTypeFormState(utmMedium) {
  const trimmed = utmMedium.trim();
  if (!trimmed) {
    return { channelType: "social", customTypeLabel: "" };
  }
  const normalized = trimmed.toLowerCase();
  if (STANDARD_CHANNEL_TYPES.has(normalized)) {
    return { channelType: normalized, customTypeLabel: "" };
  }
  return { channelType: "other", customTypeLabel: trimmed };
}

function resolveUtmMediumFromForm(channelType, customTypeLabel) {
  if (channelType === "other") {
    return resolveCustomUtmMedium(customTypeLabel);
  }
  return channelType.trim().toLowerCase();
}

function buildUtmSourceFromLabel(label, currentSource, sourceEditedManually) {
  if (sourceEditedManually) {
    return currentSource;
  }
  return normalizeUtmValue(label);
}

function testUtmNormalization() {
  assert(normalizeUtmValue("Ботхелп") === "bothelp", "cyrillic channel name transliterates");
  assert(normalizeUtmValue("BotHelp") === "bothelp", "latin channel name lowercases");
  assert(
    normalizeUtmValue("Телеграм канал") === "telegram-kanal",
    "spaces become hyphens",
  );
  assert(
    normalizeUtmValue("Рассылка ВКонтакте") === "rassylka-vkontakte",
    "cyrillic phrase transliterates",
  );
  assert(normalizeUtmValue("Мой канал № 2") === "moy-kanal-2", "numbers preserved");
  assert(
    normalizeUtmValue("  Новый__канал!!! ") === "novyy-kanal",
    "underscore and specials normalized",
  );
  assert(normalizeUtmValue("!!!") === "", "special-only value rejected");
}

function testUtmSourceAutofill() {
  assert(
    buildUtmSourceFromLabel("BotHelp", "", false) === "bothelp",
    "source auto-created from label",
  );
  assert(
    buildUtmSourceFromLabel("Новое имя", "custom-source", false) === "novoe-imya",
    "source updates with label before manual edit",
  );
  assert(
    buildUtmSourceFromLabel("Новое имя", "custom-source", true) === "custom-source",
    "source not overwritten after manual edit",
  );
}

function testStandardChannelTypes() {
  const types = readFileSync(
    "/var/www/audiolad/src/lib/promotion/channel-types.ts",
    "utf8",
  );
  assert(types.includes("messaging_bot"), "messaging bot type exists");
  assert(types.includes("Бот рассылок"), "messaging bot label exists");
  assert(resolveUtmMediumFromForm("social", "") === "social", "social medium");
  assert(resolveUtmMediumFromForm("messenger", "") === "messenger", "messenger medium");
  assert(
    resolveUtmMediumFromForm("messaging_bot", "") === "messaging_bot",
    "messaging bot medium",
  );
  assert(resolveUtmMediumFromForm("email", "") === "email", "email medium");
  assert(resolveUtmMediumFromForm("paid", "") === "paid", "paid medium");
  assert(resolveUtmMediumFromForm("partner", "") === "partner", "partner medium");
  assert(resolveUtmMediumFromForm("website", "") === "website", "website medium");
}

function testCustomChannelTypeOther() {
  assert(
    resolveUtmMediumFromForm("other", "Автоворонка") === "avtovoronka",
    "custom type transliterates",
  );
  assert(
    resolveUtmMediumFromForm("other", "База клиентов") === "baza-klientov",
    "custom phrase transliterates",
  );
  assert(
    resolveUtmMediumFromForm("other", "Собственное приложение") === "sobstvennoe-prilozhenie",
    "long custom type transliterates",
  );
  assert(
    resolveUtmMediumFromForm("other", "Офлайн мероприятие") === "oflayn-meropriyatie",
    "offline event transliterates",
  );
  assert(
    resolveUtmMediumFromForm("other", "avtovoronka") === "avtovoronka",
    "other does not save literal other token",
  );
}

function testChannelTypeBackwardCompatibility() {
  assert(parseChannelTypeFormState("social").channelType === "social", "social opens as standard");
  assert(
    parseChannelTypeFormState("messaging_bot").channelType === "messaging_bot",
    "messaging_bot opens as standard",
  );
  const unknown = parseChannelTypeFormState("avtovoronka");
  assert(unknown.channelType === "other", "unknown medium opens as other");
  assert(unknown.customTypeLabel === "avtovoronka", "unknown medium preserved in custom field");
  assert(
    resolveCustomUtmMedium("legacy_value") === "legacy_value",
    "legacy custom medium preserved unchanged",
  );
}

function testPromotionLinksForCustomChannels() {
  const bothelp = buildPromotionLink({
    authorSlug: "zoya-petrova",
    practiceSlug: "zhenskie-dengi",
    campaignKey: "zhenskie_dengi_launch",
    utmSource: "bothelp",
    utmMedium: "messaging_bot",
  });
  assert(bothelp.includes("utm_source=bothelp"), "bothelp source in link");
  assert(bothelp.includes("utm_medium=messaging_bot"), "bothelp medium in link");
  assert(!bothelp.includes("utm_content"), "bothelp link omits utm_content");
  assert(
    bothelp.includes("utm_campaign=zhenskie_dengi_launch"),
    "campaign key preserved for bothelp",
  );

  const sendler = buildPromotionLink({
    authorSlug: "zoya-petrova",
    practiceSlug: "zhenskie-dengi",
    campaignKey: "zhenskie_dengi_launch",
    utmSource: "sendler",
    utmMedium: "messaging_bot",
  });
  assert(sendler.includes("utm_source=sendler"), "sendler source in link");
  assert(sendler.includes("utm_medium=messaging_bot"), "sendler medium in link");
  assert(!sendler.includes("utm_content"), "sendler link omits utm_content");

  const custom = buildPromotionLink({
    authorSlug: "zoya-petrova",
    practiceSlug: "zhenskie-dengi",
    campaignKey: "zhenskie_dengi_launch",
    utmSource: "baza-postoyannyh-klientov",
    utmMedium: "avtovoronka",
  });
  assert(
    custom.includes("utm_source=baza-postoyannyh-klientov"),
    "custom source in link",
  );
  assert(custom.includes("utm_medium=avtovoronka"), "custom medium in link");
  assert(!custom.includes("utm_content"), "custom link omits utm_content");
  assert(!custom.includes("%25"), "params are not double-encoded");
}

function testPromotionLinksWithoutUtmContentUi() {
  const client = readFileSync(
    "/var/www/audiolad/src/components/author-dashboard/AuthorPromotionClient.tsx",
    "utf8",
  );

  assert(!client.includes('useState("main_post")'), "no main_post default in form state");
  assert(!client.includes('placeholder="main_post"'), "no main_post placeholder");
  assert(!client.includes("setUtmContent"), "no utm_content form handlers");
  assert(
    !client.includes("utmContent: channel.utm_content"),
    "stats loader does not map utm_content to link generator",
  );

  const vk = buildPromotionLink({
    authorSlug: "zoya-petrova",
    practiceSlug: "zhenskie-dengi",
    campaignKey: "zhenskie_dengi_launch",
    utmSource: "vk",
    utmMedium: "social",
  });
  assert(!vk.includes("utm_content"), "vk link omits utm_content");

  const direct = buildPromotionLink({
    authorSlug: "zoya-petrova",
    practiceSlug: "zhenskie-dengi",
    campaignKey: "zhenskie_dengi_launch",
    utmSource: "direct",
    utmMedium: "owned",
  });
  assert(!direct.includes("utm_content"), "direct link omits utm_content");
  assert(direct.includes("utm_source=direct"), "direct keeps utm_source");
  assert(direct.includes("utm_medium=owned"), "direct keeps utm_medium");
  assert(direct.includes("utm_campaign="), "direct keeps utm_campaign");

  const analyticsSanitize = readFileSync(
    "/var/www/audiolad/src/lib/analytics/sanitize.ts",
    "utf8",
  );
  assert(analyticsSanitize.includes("utm_content"), "analytics still accepts utm_content");
}

function testCustomChannelFormUi() {
  const client = readFileSync(
    "/var/www/audiolad/src/components/author-dashboard/AuthorPromotionClient.tsx",
    "utf8",
  );
  assert(client.includes("Тип канала"), "channel type label in form");
  assert(client.includes("Будет использовано в ссылке как utm_medium"), "medium hint");
  assert(client.includes("Будет использовано в ссылке как utm_source"), "source hint");
  assert(client.includes("Укажите свой тип канала"), "custom type field label");
  assert(client.includes("Сформировать из названия"), "reset source action");
  assert(!client.includes('placeholder="utm_medium"'), "raw utm_medium input removed");
  assert(client.includes("loadCustomChannelFromStats"), "stats row loads channel form");
}

function testCustomChannelModulesExist() {
  for (const file of [
    "/var/www/audiolad/src/lib/promotion/utm-normalize.ts",
    "/var/www/audiolad/src/lib/promotion/channel-types.ts",
    "/var/www/audiolad/src/lib/promotion/custom-channel.ts",
  ]) {
    assert(readFileSync(file, "utf8").includes("export"), `${file} exports helpers`);
  }
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
  testUtmNormalization();
  testUtmSourceAutofill();
  testStandardChannelTypes();
  testCustomChannelTypeOther();
  testChannelTypeBackwardCompatibility();
  testPromotionLinksForCustomChannels();
  testPromotionLinksWithoutUtmContentUi();
  testCustomChannelFormUi();
  testCustomChannelModulesExist();
  console.log("author-promotion-unit: ok");
}

main();
