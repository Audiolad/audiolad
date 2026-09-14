#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifySeoQuery } from "../src/lib/seo-queries/classifier.ts";
import {
  parseSeoQueryIds,
  validateSeoQueryApplyItem,
} from "../src/lib/seo-queries/analysis-validation.ts";

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
assert.match(route, /intent, recommended_format: recommendedFormat, audio_fit: audioFit, analysis_status: analysisStatus/);
assert.match(route, /\.eq\("analysis_status", "not_analyzed"\)/, "apply cannot overwrite reviewed rows");
assert.match(route, /\.in\("status", \["active", "used"\]\)/, "apply protects unexpected active/used reservations");
assert.doesNotMatch(route, /query_text.*update|normalized_query.*update|frequency.*update|cluster_id.*update/, "apply updates only the four review fields");

const page = read("src/app/(platform)/admin/seo-queries/page.tsx");
const ui = read("src/components/admin/AdminSeoQueriesClient.tsx");
assert.match(page, /analysis_status/);
assert.match(ui, /Анализировать выбранные/);
assert.match(ui, /Не анализировались/);
assert.match(ui, /Допустить авторам/);
assert.match(ui, /Не подходит/);
assert.match(ui, /SEO_QUERY_AUDIO_FIT_LABELS/);
assert.doesNotMatch(ui, /\["listen_audio", "music", "practice"/, "UI uses shared intent taxonomy");
assert.doesNotMatch(ui, /\["Медитация", "Энергопрактика"/, "UI uses shared format taxonomy");
console.log("seo-query-analysis-unit: ok");
