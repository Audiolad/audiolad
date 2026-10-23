#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifySeoQuery } from "../src/lib/seo-queries/classifier.ts";
import {
  parseSeoQueryIds,
  validateSeoQueryApplyItem,
} from "../src/lib/seo-queries/analysis-validation.ts";
import {
  chunkIds,
  exactWordstatFrequency,
  planSeoAnalysisRecommendations,
  refreshMissingSeoQueryFrequencies,
  seoAnalysisPlanConfirmText,
  sortByFrequencyDesc,
} from "../src/lib/seo-queries/analysis-plan.ts";
import {
  SEO_QUERY_CONFIDENCE_LABELS,
  SEO_QUERY_INTENTS,
  SEO_QUERY_INTENT_LABELS,
  seoQueryLabel,
} from "../src/lib/seo-queries/analysis-taxonomy.ts";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const classify = (queryText) => classifySeoQuery({ queryText });

function assertClassification(queryText, expected) {
  assert.deepEqual(classify(queryText), expected);
}
assertClassification("джаз музыка", { intent: "music", recommendedFormat: "Музыка", audioFit: "high", recommendedDisposition: "analyzed", confidence: "high", reasons: ["Есть явный музыкальный сигнал."] });
assertClassification("медитация перед сном", { intent: "practice", recommendedFormat: "Медитация", audioFit: "high", recommendedDisposition: "analyzed", confidence: "high", reasons: ["Есть явный сигнал медитации или практики."] });
assertClassification("молитва на вечер", { intent: "practice", recommendedFormat: "Молитва", audioFit: "high", recommendedDisposition: "analyzed", confidence: "high", reasons: ["Есть явный сигнал молитвы."] });
assertClassification("слушать аудиокнигу", { intent: "specific_content", recommendedFormat: "Аудиокнига", audioFit: "high", recommendedDisposition: "analyzed", confidence: "high", reasons: ["Запрос явно относится к аудиокниге."] });
assert.equal(classify("как сделать дыхательную технику").intent, "how_to");
assert.equal(classify("что такое осознанность").intent, "informational");
assert.equal(classify("история моего опыта").intent, "experience_story");
assert.equal(classify("слушать онлайн рассказ").intent, "listen_audio");
assert.deepEqual(classify("купить аудиокнигу"), { intent: "transactional", recommendedFormat: null, audioFit: "none", recommendedDisposition: "not_applicable", confidence: "high", reasons: ["Коммерческий запрос не является аудио-возможностью."] });
assert.deepEqual(classify("личный кабинет аудиолад"), { intent: "navigation", recommendedFormat: null, audioFit: "none", recommendedDisposition: "not_applicable", confidence: "high", reasons: ["Навигационный запрос не является аудио-возможностью."] });
assert.equal(classify("погода сегодня").intent, "realtime");
assert.deepEqual(classify("абстрактный запрос"), { intent: "other", recommendedFormat: null, audioFit: "low", recommendedDisposition: "not_applicable", confidence: "low", reasons: ["Явного аудио-намерения не обнаружено; требуется решение администратора."] });
assert.deepEqual(classify("музыка для сна"), classify("музыка для сна"), "classifier is deterministic");

// Seeded sprint pool: affirmations and lo-fi are audio opportunities, not «Не подходит».
assert.deepEqual(classify("Аффирмация на денежное богатство"), { intent: "practice", recommendedFormat: "Свой формат", audioFit: "high", recommendedDisposition: "analyzed", confidence: "high", reasons: ["Есть явный сигнал аффирмации."] });
assert.equal(classify("лоу фай радио").intent, "music");
assert.equal(classify("lo fi hip hop").intent, "music");
assert.equal(classify("скачать lo fi").intent, "transactional", "commercial rule still wins");

// Russian labels for every intent and confidence value.
for (const intent of SEO_QUERY_INTENTS) assert.match(SEO_QUERY_INTENT_LABELS[intent], /[а-яё]/i, intent);
assert.equal(seoQueryLabel(SEO_QUERY_INTENT_LABELS, "other"), "Другое");
assert.equal(seoQueryLabel(SEO_QUERY_CONFIDENCE_LABELS, "low"), "низкая");
assert.equal(seoQueryLabel(SEO_QUERY_INTENT_LABELS, null), "–");

// Bulk plan: low confidence is never applied automatically.
const planItem = (id, recommended_disposition, confidence, frequency = null) => ({ id, frequency, suggested: { recommended_disposition, confidence } });
const plan = planSeoAnalysisRecommendations([
  planItem("a", "analyzed", "high"), planItem("b", "analyzed", "medium"), planItem("c", "not_applicable", "high"),
  planItem("d", "not_applicable", "low"), planItem("e", "analyzed", "low"),
]);
assert.deepEqual(plan, { approve: ["a", "b"], reject: ["c"], manual: ["d", "e"] });
assert.equal(seoAnalysisPlanConfirmText(plan), "Применить рекомендации к выбранным: допустить 2, отклонить 1, оставить 2 на ручное решение?");
assert.deepEqual(sortByFrequencyDesc([planItem("x", "analyzed", "high", null), planItem("y", "analyzed", "high", 5), planItem("z", "analyzed", "high", 900)]).map((item) => item.id), ["z", "y", "x"]);
assert.deepEqual(chunkIds([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);

// Frequency refresh: exact phrase only, never topic aggregate; stops on quota errors.
const ok = (suggestions, topicTotalCount = 99999) => ({ ok: true, data: { phrase: "p", region: { id: "225", label: "Россия" }, periodLabel: "последние 30 дней", topicTotalCount, suggestions: suggestions.map(([phrase, count]) => ({ phrase, count, source: "result", opportunity: { level: "green", color: "green", label: "", description: "" } })) } });
const fail = (code) => ({ ok: false, error: { code, message: `msg ${code}` } });
assert.equal(exactWordstatFrequency("Аффирмация  на деньги", ok([["аффирмация на деньги", 321]])), 321);
assert.equal(exactWordstatFrequency("аффирмация на деньги", ok([["аффирмация на деньги быстро", 50]])), null, "no topic aggregate fallback");
{
  const calls = []; const saved = [];
  const responses = { "один": ok([["один", 10]]), "два": ok([["другое", 7]]), "три": fail("NO_RESULTS"), "четыре": fail("TIMEOUT"), "пять": fail("RATE_LIMITED") };
  const results = await refreshMissingSeoQueryFrequencies([
    { id: "1", query_text: "один", frequency: null },
    { id: "0", query_text: "есть", frequency: 42 },
    { id: "2", query_text: "два", frequency: null },
    { id: "3", query_text: "три", frequency: null },
    { id: "4", query_text: "четыре", frequency: null },
    { id: "5", query_text: "пять", frequency: null },
    { id: "6", query_text: "шесть", frequency: null },
  ], {
    async fetchWordstat(phrase) { calls.push(phrase); return responses[phrase]; },
    async saveFrequency(id, frequency, checkedAt) { saved.push([id, frequency, checkedAt]); return true; },
    now: () => new Date("2026-10-23T18:00:00Z"),
  });
  assert.deepEqual(calls, ["один", "два", "три", "четыре", "пять"], "present rows and rows after RATE_LIMITED are not fetched");
  assert.deepEqual(saved, [["1", 10, "2026-10-23T18:00:00.000Z"]]);
  assert.deepEqual(results.map((item) => [item.id, item.status, item.frequency]), [["1", "fetched", 10], ["0", "present", 42], ["2", "not_found", null], ["3", "not_found", null], ["4", "failed", null], ["5", "failed", null], ["6", "failed", null]]);
  assert.equal(results[6].code, "RATE_LIMITED");
}
{
  const results = await refreshMissingSeoQueryFrequencies([{ id: "1", query_text: "один", frequency: null }], {
    async fetchWordstat() { return ok([["один", 10]]); },
    async saveFrequency() { return false; },
  });
  assert.equal(results[0].status, "failed");
  assert.equal(results[0].code, "SAVE_FAILED");
}

const idA = "11111111-1111-4111-8111-111111111111";
const idB = "22222222-2222-4222-8222-222222222222";
assert.equal(parseSeoQueryIds([]), null);
assert.equal(parseSeoQueryIds(Array.from({ length: 21 }, () => idA)), null);
assert.equal(parseSeoQueryIds(["not-a-uuid"]), null);
assert.deepEqual(parseSeoQueryIds([idA, idA, idB]), [idA, idB]);
assert.deepEqual(validateSeoQueryApplyItem({ id: idA, intent: "music", recommended_format: "Музыка", audio_fit: "high", analysis_status: "analyzed" }), { id: idA, intent: "music", recommendedFormat: "Музыка", audioFit: "high", analysisStatus: "analyzed" });
assert.equal(validateSeoQueryApplyItem({ id: idA, intent: "invalid", recommended_format: "Музыка", audio_fit: "high", analysis_status: "analyzed" }), null);
assert.equal(validateSeoQueryApplyItem({ id: idA, intent: "music", recommended_format: "invalid", audio_fit: "high", analysis_status: "analyzed" }), null);
assert.equal(validateSeoQueryApplyItem({ id: idA, intent: "music", recommended_format: "Музыка", audio_fit: "invalid", analysis_status: "analyzed" }), null);
assert.equal(validateSeoQueryApplyItem({ id: idA, intent: "music", recommended_format: "Музыка", audio_fit: "high", analysis_status: "not_analyzed" }), null);

const migration = read("supabase/migrations/20261007160000_seo_query_analysis_review_gate.sql");
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.reserve_seo_query/);
assert.match(migration, /SELECT \* INTO v_query FROM public\.seo_queries WHERE id = p_query_id FOR UPDATE/);
assert.match(migration, /IF v_query\.analysis_status <> 'analyzed'/);
assert.match(migration, /seo_query_not_analyzed/);
assert.match(migration, /pg_advisory_xact_lock/);
assert.match(migration, /v_active_count >= 5/);
assert.match(migration, /now\(\) \+ interval '7 days'/);
assert.match(migration, /DROP POLICY IF EXISTS seo_queries_select_authenticated/);
assert.match(migration, /public\.is_platform_staff\(auth\.uid\(\)\)/);
assert.match(migration, /analysis_status = 'analyzed'/);
assert.match(migration, /WHERE status IN \('active', 'used'\)/);
assert.doesNotMatch(migration, /status IN \('released'/);

const authorQueries = read("src/lib/seo-queries/queries.ts");
assert.match(authorQueries, /\.eq\("analysis_status", "analyzed"\)/);
const route = read("src/app/api/admin/seo-queries/analyze/route.ts");
assert.match(route, /requireAdminPermission\("seo\.manage"\)/);
assert.match(route, /parseSeoQueryIds/);
assert.match(route, /classifySeoQuery/, "POST only prepares suggestions");
assert.doesNotMatch(route.slice(route.indexOf("export async function POST"), route.indexOf("export async function PUT")), /\.update\(/, "POST does not mutate");
assert.match(route, /validateSeoQueryApplyItem/);
assert.match(route, /recommended_format: recommendedFormat/);
assert.match(route, /audio_fit: audioFit/);
assert.match(route, /analysis_status: analysisStatus/);
assert.match(route, /admin_review_seo_query_proposal/, "proposal path uses atomic RPC");
assert.match(route, /\.eq\("analysis_status", "not_analyzed"\)/, "apply cannot overwrite reviewed rows");
assert.match(route, /\.in\("status", \["active", "used"\]\)/, "apply protects unexpected active/used reservations");
assert.doesNotMatch(route, /query_text.*update|normalized_query.*update|frequency.*update|cluster_id.*update/, "apply updates only the four review fields");

const page = read("src/app/(platform)/admin/seo-queries/page.tsx");
const ui = read("src/components/admin/AdminSeoQueriesClient.tsx");
assert.match(page, /analysis_status/);
assert.match(ui, /Анализировать выбранные/);
assert.match(ui, /Не проверены/);
assert.match(ui, /Допустить авторам/);
assert.match(ui, /Не подходит/);
assert.match(ui, /SEO_QUERY_AUDIO_FIT_LABELS/);
assert.doesNotMatch(ui, /\["listen_audio", "music", "practice"/, "UI uses shared intent taxonomy");
assert.doesNotMatch(ui, /\["Медитация", "Энергопрактика"/, "UI uses shared format taxonomy");
const frequencyRoute = read("src/app/api/admin/seo-queries/frequency/route.ts");
assert.match(frequencyRoute, /requireAdminPermission\("seo\.manage"\)/);
assert.match(frequencyRoute, /parseSeoQueryIds/);
assert.match(frequencyRoute, /fetchWordstatSuggestions\(phrase, \{ userId: session\.userId \}\)/, "shared client keeps cache and quotas");
assert.match(frequencyRoute, /\.update\(\{ frequency, frequency_checked_at: checkedAt \}\)/);
assert.match(frequencyRoute, /\.is\("frequency", null\)/, "never overwrites an existing frequency");
assert.equal((frequencyRoute.match(/\.update\(/g) ?? []).length, 1, "frequency refresh has a single update");
assert.doesNotMatch(frequencyRoute.slice(frequencyRoute.indexOf(".update(")), /analysis_status|intent|audio_fit|recommended_format/, "frequency refresh does not touch review fields");
assert.match(ui, /Применить рекомендации к выбранным/);
assert.match(ui, /seoAnalysisPlanConfirmText/);
assert.match(ui, /window\.confirm/);
assert.match(ui, /Частотность не получена/);
assert.match(ui, /Повторить/);
assert.match(ui, /SEO_QUERY_INTENT_LABELS\[value\]/);
assert.match(ui, /SEO_QUERY_CONFIDENCE_LABELS/);
assert.doesNotMatch(ui, /Уверенность: \{suggested\.confidence\}/, "confidence is not shown raw");
assert.doesNotMatch(ui, /—/, "admin copy uses en dash only");
console.log("seo-query-analysis-unit: ok");
