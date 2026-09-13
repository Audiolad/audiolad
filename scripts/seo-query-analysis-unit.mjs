#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { classifySeoQuery } from "../src/lib/seo-queries/classifier.ts";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const classify = (queryText) => classifySeoQuery({ queryText });

assert.deepEqual(classify("джаз музыка"), { intent: "music", recommendedFormat: "Музыка", audioFit: "high", recommendedDisposition: "analyzed", confidence: "high", reasons: ["Есть явный музыкальный сигнал."] });
assert.equal(classify("медитация перед сном").recommendedFormat, "Медитация");
assert.equal(classify("энергопрактика").recommendedFormat, "Энергопрактика");
assert.equal(classify("молитва на вечер").recommendedFormat, "Молитва");
assert.equal(classify("слушать аудиокнигу").recommendedFormat, "Аудиокнига");
assert.equal(classify("как делать медитацию").intent, "practice", "explicit practice dominates how-to");
assert.equal(classify("как сделать дыхательную технику").intent, "how_to");
assert.equal(classify("что такое медитация").intent, "practice", "explicit practice dominates information");
assert.equal(classify("что такое осознанность").intent, "informational");
assert.equal(classify("история моего опыта").intent, "experience_story");
assert.equal(classify("слушать онлайн рассказ").intent, "listen_audio");
assert.equal(classify("купить аудиокнигу").recommendedDisposition, "not_applicable");
assert.equal(classify("погода сегодня").intent, "realtime");
assert.equal(classify("абстрактный запрос").intent, "other");
assert.deepEqual(classify("музыка для сна"), classify("музыка для сна"), "classifier is deterministic");

const migration = read("supabase/migrations/20261006150000_seo_query_analysis_review_gate.sql");
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
assert.match(route, /MAX_ITEMS = 20/);
assert.match(route, /new Set\(value\)/, "POST deduplicates IDs");
assert.match(route, /classifySeoQuery/, "POST only prepares suggestions");
assert.doesNotMatch(route.slice(route.indexOf("export async function POST"), route.indexOf("export async function PUT")), /\.update\(/, "POST does not mutate");
assert.match(route, /analysisStatus !== "analyzed" && analysisStatus !== "not_applicable"/);
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
console.log("seo-query-analysis-unit: ok");
