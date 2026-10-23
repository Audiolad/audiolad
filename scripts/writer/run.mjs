#!/usr/bin/env node
/**
 * «Райтер» – one command from a brief to a DRAFT pull request with a new practice article.
 *
 *   npx tsx scripts/writer/run.mjs --brief path/to/brief.json [--model openai/gpt-oss-120b]
 *        [--dry-run] [--no-repair] [--offline] [--article file.json] [--max-rub 3]
 *
 * Generation happens only on the Moscow host (Cloud.ru key never leaves it). The pipeline
 * validates, converts, runs checks, scans for secrets and opens a draft PR. It never merges
 * or deploys. Exit codes: 0 ok, 1 runtime error, 2 validation failed, 3 checks failed,
 * 4 secret scan failed, 5 budget exceeded.
 */
import { appendFileSync, existsSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { loadBrief } from "./lib/brief.mjs";
import { runChecks, runTests } from "./lib/checks.mjs";
import { loadContext } from "./lib/context.mjs";
import { applyToRepo } from "./lib/convert.mjs";
import { DEFAULT_MODEL, SUPPORTED_MODELS, chargedCost, estimatePromptTokens, formatRub, parseLimits, worstCaseRub } from "./lib/cost.mjs";
import { generateOnMoscow } from "./lib/moscow.mjs";
import { normalizeArticle } from "./lib/normalize.mjs";
import { articleSchema, buildExpandMessages, buildMessages, buildRepairMessages, buildRequest, expandSchema, mergeExpansion } from "./lib/prompt.mjs";
import { commit, pushAndOpenDraft, secretScan } from "./lib/publish.mjs";
import { buildReport } from "./lib/report.mjs";
import { validateArticle } from "./lib/validate.mjs";
import { log, mskDate, mskNow, mustRun, readJson, run, writeJson, writeText } from "./lib/util.mjs";

const { values: args } = parseArgs({
  options: {
    brief: { type: "string" },
    model: { type: "string", default: DEFAULT_MODEL },
    "dry-run": { type: "boolean", default: false },
    "no-repair": { type: "boolean", default: false },
    offline: { type: "boolean", default: false },
    article: { type: "string" },
    "max-rub": { type: "string", default: "3" },
    "max-tokens": { type: "string", default: "16000" },
    out: { type: "string" },
    "keep-worktree": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
    // --site sz: a pack of sergey-zoya.ru articles (see README «Режим sz»)
    site: { type: "string", default: "audiolad" },
    repo: { type: "string" },
    briefs: { type: "string" },
    experts: { type: "string" },
    fixtures: { type: "string" },
    "skip-build": { type: "boolean", default: false },
    "experts-report": { type: "boolean", default: false },
  },
});

class Stop extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const szMode = args.site === "sz";
if (!["audiolad", "sz"].includes(args.site)) {
  process.stderr.write(`--site: audiolad или sz, получено ${args.site}\n`);
  process.exit(1);
}
if (args.help || (!args.brief && !szMode) || (szMode && !args.briefs && !args.brief && !args["experts-report"])) {
  process.stdout.write([
    "Использование: npx tsx scripts/writer/run.mjs --brief brief.json [--model M] [--dry-run] [--no-repair] [--offline] [--article a.json] [--max-rub 3]",
    "  sergey-zoya.ru: --site sz --repo <клон sergey-zoya-site> --briefs pack.json [--experts EXPERTS_RU.md] [--dry-run] [--offline --fixtures dir] [--skip-build] [--max-rub 3]",
    "                  --site sz --repo <клон> --experts-report   (эксперты пула: кто реже использован, есть ли портрет)",
    "См. scripts/writer/README.md",
    "",
  ].join("\n"));
  process.exit(args.help ? 0 : 1);
}
if (!SUPPORTED_MODELS.includes(args.model)) {
  process.stderr.write(`Модель ${args.model} не поддерживается. Доступны: ${SUPPORTED_MODELS.join(", ")}\n`);
  process.exit(1);
}

const model = args.model;
const modelLabel = `Cloud.ru ${model.split("/").pop()}`;
const authorLabel = `Райтер (${modelLabel})`;
let limits;
try {
  limits = parseLimits(args["max-rub"], args["max-tokens"]);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
const { maxRub, maxTokens } = limits;
if (szMode) {
  const { runSzPipeline } = await import("./lib/sites/sz/pipeline.mjs");
  let result;
  try {
    result = await runSzPipeline(args, { model, maxRub, maxTokens });
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(typeof error.code === "number" ? error.code : 1);
  }
  process.exit(result.code);
}
const brief = loadBrief(resolve(args.brief));
const today = mskDate();
const stamp = mskNow().slice(11, 16).replace(":", "");
const runId = `${today}-${stamp}-${brief.slug}`.slice(0, 100);
const outDir = resolve(args.out ?? join(homedir(), ".cache/writer/runs", runId));
const repoRoot = mustRun("git", ["rev-parse", "--show-toplevel"]).trim();
const worktree = join(outDir, "worktree");
const branch = `writer/${brief.slug}`;
const state = { runId, model, authorLabel, startedAt: mskNow(), calls: [], spentRub: 0, outDir, branch };

mkdirSync(outDir, { recursive: true });
writeJson(join(outDir, "brief.json"), brief);

function ledger(entry) {
  const path = join(homedir(), ".cache/writer/ledger.jsonl");
  mkdirSync(join(homedir(), ".cache/writer"), { recursive: true });
  appendFileSync(path, `${JSON.stringify({ at: mskNow(), runId, ...entry })}\n`);
}

function prepareWorktree() {
  mustRun("git", ["fetch", "-q", "origin", "main"], { cwd: repoRoot });
  if (existsSync(worktree)) throw new Error(`worktree уже существует: ${worktree}`);
  mustRun("git", ["worktree", "add", "-q", "--detach", worktree, "origin/main"], { cwd: repoRoot });
  const modules = join(repoRoot, "node_modules");
  if (existsSync(modules)) symlinkSync(realpathSync(modules), join(worktree, "node_modules"));
  state.baseSha = mustRun("git", ["rev-parse", "HEAD"], { cwd: worktree }).trim();
}

function callWriter(callName, messages, schema) {
  const request = buildRequest(model, messages, schema, { maxTokens });
  const worst = worstCaseRub(model, estimatePromptTokens(messages), maxTokens);
  if (state.spentRub + worst > maxRub) {
    throw new Stop(5, `бюджет: потрачено ${formatRub(state.spentRub)}, худший случай вызова ${formatRub(worst)}, лимит ${formatRub(maxRub)} (--max-rub)`);
  }
  const callDir = join(outDir, callName);
  writeJson(join(callDir, "request.json"), request);
  log(`${callName}: запрос к ${model} на Москве (худший случай ${formatRub(worst)})`);
  const { meta, article } = generateOnMoscow(runId, callName, join(callDir, "request.json"), callDir);
  const { cost, estimated } = chargedCost(meta, worst);
  state.spentRub += cost;
  const call = {
    name: callName,
    http: meta.http,
    seconds: meta.seconds,
    promptTokens: meta.prompt_tokens ?? 0,
    completionTokens: meta.completion_tokens ?? 0,
    reasoningTokens: meta.reasoning_tokens ?? null,
    costRub: cost,
    costEstimated: estimated,
    finishReason: meta.finish_reason ?? null,
    responseFormatFallback: Boolean(meta.response_format_fallback),
    error: meta.ok ? null : meta.error ?? "ошибка",
  };
  state.calls.push(call);
  ledger({ call: callName, model, ...call });
  log(`${callName}: http ${call.http}, ${call.promptTokens}+${call.completionTokens} токенов, ${formatRub(cost)}${estimated ? " (нет usage – засчитан худший случай)" : ""}${call.error ? `, ошибка: ${call.error}` : ""}`);
  return article;
}

async function main() {
  log(`старт ${runId}, модель ${model}, каталог ${outDir}`);
  prepareWorktree();
  const context = await loadContext(worktree);
  state.registryCount = context.articles.length;
  if (brief.table.mode === "required" && !context.supportsTable) {
    throw new Stop(2, "бриф требует таблицу, но в main нет блока table (types.ts) – уберите требование или дождитесь поддержки таблиц");
  }
  const { messages, tableAllowed } = buildMessages(brief, context);
  const schema = articleSchema(brief, { tableAllowed });
  state.tableAllowed = tableAllowed;

  let raw;
  if (args.article) {
    raw = readJson(resolve(args.article));
    state.calls.push({ name: "manual", costRub: 0, note: `статья из файла ${args.article}` });
  } else {
    raw = callWriter("generate", messages, schema);
  }
  if (!raw) throw new Stop(2, "Райтер не вернул JSON-статью");
  let { article, changes } = normalizeArticle(raw, context);
  let validation = await validateWithLog(article, context, "первичная");
  state.normalization = changes;

  if (!args.article && validation.stats?.words && validation.stats.words < brief.wordCount.min) {
    const expansion = callWriter("expand", buildExpandMessages(brief, raw, validation.stats.words), expandSchema(brief));
    const merged = mergeExpansion(raw, expansion);
    log(`expand: добавлено абзацев ${merged.added}`);
    if (merged.added > 0) {
      raw = merged.article;
      ({ article, changes } = normalizeArticle(raw, context));
      state.normalization = changes;
      validation = await validateWithLog(article, context, "после дописывания");
    }
  }

  if (!validation.ok && !args["no-repair"] && !args.article) {
    const repaired = callWriter("repair", buildRepairMessages(messages, raw, validation.errors, validation.stats), schema);
    if (repaired) {
      state.firstValidation = validation;
      ({ article, changes } = normalizeArticle(repaired, context));
      state.normalization = changes;
      validation = await validateWithLog(article, context, "после исправления");
    }
  }
  state.validation = validation;
  writeJson(join(outDir, "article.final.json"), article);
  if (!validation.ok) throw new Stop(2, "статья не прошла валидацию – PR не создан");

  log("базовые тесты на чистом main");
  const baseline = runTests(worktree);
  const applied = applyToRepo(worktree, article, brief, context, { publishedAt: brief.publishedAt ?? today, today, modelLabel });
  state.files = applied.files;
  state.articleId = applied.articleId;
  log("проверки: tsc, eslint, SEO-тесты");
  const checks = runChecks(worktree, applied.files, baseline);
  state.checks = checks;
  if (!checks.ok) throw new Stop(3, "проверки репозитория не прошли – PR не создан");

  mustRun("git", ["switch", "-q", "-c", branch], { cwd: worktree });
  state.headSha = commit(worktree, applied.files, `feat(seo): черновик статьи ${brief.slug} от ${authorLabel}`);
  const scan = secretScan(worktree, state.baseSha);
  state.secretScan = scan;
  if (!scan.ok) throw new Stop(4, `поиск секретов: ${scan.findings.join("; ")}`);

  const title = `Райтер: черновик статьи «${article.title}»`;
  const body = buildReport(state, brief, article, { forPr: true });
  if (args["dry-run"]) {
    writeText(join(outDir, "pr-body.md"), body);
    log(`--dry-run: коммит ${state.headSha.slice(0, 8)} в ${worktree}, PR не создан`);
    return;
  }
  state.prUrl = pushAndOpenDraft(worktree, { branch, title, body, label: authorLabel, outDir });
  log(`черновой PR: ${state.prUrl}`);
}

async function validateWithLog(article, context, label) {
  const result = await validateArticle(article, brief, context, { live: !args.offline });
  log(`валидация (${label}): ошибок ${result.errors.length}, предупреждений ${result.warnings.length}`);
  for (const error of result.errors) log(`  ✗ ${error}`);
  return result;
}

let code = 0;
try {
  await main();
} catch (error) {
  code = error instanceof Stop ? error.code : 1;
  state.failure = error.message;
  log(`СТОП: ${error.message}`);
}
state.finishedAt = mskNow();
writeJson(join(outDir, "report.json"), state);
writeText(join(outDir, "report.md"), buildReport(state, brief, null, { forPr: false }));
if (!args["keep-worktree"] && existsSync(worktree) && (code !== 0 || state.prUrl)) {
  mustRun("git", ["worktree", "remove", "--force", worktree], { cwd: repoRoot });
  // Local branch only; the pushed branch (if any) stays on GitHub with its draft PR.
  run("git", ["branch", "-D", branch], { cwd: repoRoot });
}
log(`итого Cloud.ru: ${formatRub(state.spentRub)}; отчёт ${join(outDir, "report.md")}`);
process.exit(code);
