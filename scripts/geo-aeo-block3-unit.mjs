#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  acquisitionSourceLabel,
  classifyAcquisitionSourceClass,
} from "../src/lib/analytics/source-class.ts";
import { normalizeIndexNowUrl } from "../src/lib/seo/indexnow/urls.ts";
import { getIndexNowConfig } from "../src/lib/seo/indexnow/config.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function cls(input) {
  return classifyAcquisitionSourceClass(input);
}

assert(cls({ referrerDomain: "chatgpt.com" }) === "ai", "chatgpt.com");
assert(cls({ referrerDomain: "www.chatgpt.com" }) === "ai", "www.chatgpt.com");
assert(cls({ referrerDomain: "chat.openai.com" }) === "ai", "chat.openai.com");
assert(cls({ utmSource: "chatgpt" }) === "ai", "utm chatgpt");
assert(cls({ referrerDomain: "perplexity.ai" }) === "ai", "perplexity");
assert(cls({ utmSource: "perplexity" }) === "ai", "utm perplexity");
assert(cls({ referrerDomain: "copilot.microsoft.com" }) === "ai", "copilot host");
assert(cls({ utmSource: "copilot" }) === "ai", "utm copilot");
assert(cls({ referrerDomain: "gemini.google.com" }) === "ai", "gemini host");
assert(cls({ utmSource: "gemini" }) === "ai", "utm gemini");
assert(cls({ referrerDomain: "alice.yandex.ru" }) === "ai", "alice host");
assert(cls({ utmSource: "alice" }) === "ai", "utm alice");

assert(cls({ referrerDomain: "www.google.com" }) === "organic_search", "google organic");
assert(cls({ referrerDomain: "yandex.ru" }) === "organic_search", "yandex organic");
assert(cls({ referrerDomain: "www.bing.com" }) === "organic_search", "bing organic");
assert(cls({ utmSource: "google", utmMedium: "cpc" }) === "utm", "google utm stays utm");
assert(cls({ referrerDomain: "openai.com" }) === "referral", "openai.com is not guessed as AI");
assert(cls({ referrerDomain: "microsoft.com" }) === "referral", "microsoft.com is not Copilot");
assert(cls({ referrerDomain: "ai.example.com" }) === "referral", "unknown AI-like host");
assert(cls({ referrerDomain: "example.org" }) === "referral", "generic referral");
assert(cls({ referrerDomain: "vk.com" }) === "social", "vk social");
assert(cls({}) === "direct_or_unknown", "direct");
assert(acquisitionSourceLabel("ai") === "AI-сервисы", "ai label");

const listen = normalizeIndexNowUrl("https://audiolad.ru/listen/x");
assert(!listen.ok && listen.reason === "private_path", "listen player rejected");
const listens = normalizeIndexNowUrl("https://audiolad.ru/listens/x");
assert(listens.ok, "listens SEO accepted");
const inner = normalizeIndexNowUrl("/program/inner-support");
assert(!inner.ok && inner.reason === "private_path", "inner-support rejected");
const admin = normalizeIndexNowUrl("/admin");
assert(!admin.ok, "admin rejected");
const article = normalizeIndexNowUrl("/articles/kak-razvit-lyubov-k-sebe");
assert(article.ok, "article accepted");

const gated = getIndexNowConfig({
  INDEXNOW_ENABLED: undefined,
  INDEXNOW_KEY: undefined,
  NEXT_PUBLIC_APP_ORIGIN: "https://audiolad.ru",
});
assert(gated.canSubmit === false, "IndexNow stays gated without env");

const source = readFileSync(join(ROOT, "src/lib/analytics/source-class.ts"), "utf8");
assert(!source.includes("google.com") || source.includes("gemini.google.com"), "no google.com as AI root");
assert(!source.includes('"bing.com"'), "no bing.com AI root");
assert(!source.includes('"yandex.ru"'), "no yandex.ru AI root");

console.log("geo-aeo-block3-unit: ok");
