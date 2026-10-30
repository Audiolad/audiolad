// `--site coffee`: a pack of up to 5 AudioLad coffee guides → ONE draft PR to Audiolad/audiolad.
// Flow: coffee pack brief (site/template id checked) → clean worktree of origin/main → per article:
// prompt (fields JSON) → assemble VerticalGuideArticle → coffee rules → one repair → apply
// (article modules + registry) → type check → commit → secret scan → draft PR.
// Output is a DRAFT for Codex: Codex polishes it in the same branch and publishes. Райтер never merges, deploys or publishes. Shares only the generic Cloud.ru caller and git helpers
// with other modes; nothing from the sz template folder is imported.
import { existsSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";

import { makeCaller } from "../../call.mjs";
import { costRub, estimatePromptTokens, formatRub, TARIFF } from "../../cost.mjs";
import { commit, pushAndOpenDraft, secretScan } from "../../publish.mjs";
import { log, mskDate, mskNow, mustRun, readJson, run, writeJson, writeText } from "../../util.mjs";
import { applyCoffeePack } from "./apply.mjs";
import { assembleCoffeeArticle, toTsModule } from "./assemble.mjs";
import { loadCoffeeExperts, loadCoffeePack } from "./brief.mjs";
import { COFFEE } from "./config.mjs";
import { buildCoffeeMessages, buildCoffeeRepairMessages, coffeeArticleSchema } from "./prompt.mjs";
import { checkCoffeeArticle, uniqueKeys } from "./rules.mjs";

/**
 * Completion tokens that fit the per-draft cap: the prompt plus every requested token at the output
 * price must stay within cap − spent. Returns 0 if not even `minTokens` fit.
 */
export function draftTokenWindow(model, messages, { spentRub, capRub, maxTokens, minTokens }) {
  const tariff = TARIFF[model];
  if (!tariff) throw new CoffeeStop(1, `нет тарифа для модели ${model}`);
  const promptRub = costRub(model, estimatePromptTokens(messages, model), 0);
  const left = capRub - spentRub - promptRub;
  const fit = Math.floor((left * 1e6) / tariff.outputPer1M);
  const tokens = Math.min(maxTokens, fit);
  return tokens >= minTokens ? tokens : 0;
}

/** 1 статья, 2 статьи, 5 статей. */
export function articlesWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} статья`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} статьи`;
  return `${n} статей`;
}

export class CoffeeStop extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function prepareWorktree(repo, worktree, base = "origin/main") {
  mustRun("git", ["fetch", "-q", "origin", "main"], { cwd: repo });
  if (existsSync(worktree)) throw new Error(`worktree уже существует: ${worktree}`);
  mustRun("git", ["worktree", "add", "-q", "--detach", worktree, base], { cwd: repo });
  const modules = join(repo, "node_modules");
  if (existsSync(modules)) symlinkSync(realpathSync(modules), join(worktree, "node_modules"));
  return mustRun("git", ["rev-parse", "HEAD"], { cwd: worktree }).trim();
}

function assertBranchFree(repo, branch) {
  if (run("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repo }).status === 0) {
    throw new CoffeeStop(1, `ветка ${branch} уже есть локально – удалите её или смените pack`);
  }
  const remote = run("git", ["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${branch}`], {
    cwd: repo,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    timeoutMs: 60 * 1000,
  });
  if (remote.status === 0) throw new CoffeeStop(1, `ветка ${branch} уже есть на origin – смените pack; генерация не запускалась`);
  if (remote.status !== 2) throw new CoffeeStop(1, `не удалось проверить ветку ${branch} на origin (код ${remote.status}); генерация не запускалась`);
}

/** Headings and FAQ questions already in the coffee section (for «не повторяй»). */
function sectionKeys(worktree) {
  const result = run("npx", ["tsx", "-e", [
    'import { listVerticalArticles } from "./src/lib/business/vertical-guides/registry";',
    "const keys = listVerticalArticles(\"coffee\").flatMap((a) => [...a.partOne, ...a.partTwo].map((s) => s.heading).concat(a.faq.map((f) => f.question)));",
    "console.log(JSON.stringify(keys));",
  ].join("\n")], { cwd: worktree, timeoutMs: 120 * 1000 });
  if (result.status !== 0) return [];
  try {
    return JSON.parse(result.stdout.trim().split("\n").pop());
  } catch {
    return [];
  }
}

/** Registry quotes already on the site: Map «expertId#quoteIndex» → slug (one quote is used once). */
function siteQuotes(worktree) {
  const result = run("npx", ["tsx", "-e", [
    'import { listVerticalArticles } from "./src/lib/business/vertical-guides/registry";',
    "const keys = listVerticalArticles(\"coffee\").flatMap((a) => [a.expertOne, a.expertTwo].map((s) => [`${s.expertId}#${s.quoteIndex}`, a.slug]));",
    "console.log(JSON.stringify(keys));",
  ].join("\n")], { cwd: worktree, timeoutMs: 120 * 1000 });
  if (result.status !== 0) throw new CoffeeStop(1, "не удалось собрать цитаты экспертов с сайта – без них нельзя проверить ротацию");
  return new Map(JSON.parse(result.stdout.trim().split("\n").pop()));
}

export async function runCoffeePipeline(args, { model, maxRub, maxTokens: cliMaxTokens, generate }) {
  let maxTokens = cliMaxTokens;
  const repo = resolve(args.repo ?? mustRun("git", ["rev-parse", "--show-toplevel"]).trim());
  const experts = loadCoffeeExperts(repo);
  const pack = loadCoffeePack(resolve(args.briefs ?? args.brief), { experts, repoDir: repo });
  // Same draft setup as sz pack 17: only gpt-5.4-mini, max_tokens ≤ 9000, no repair call.
  if (!args.offline && model !== COFFEE.draft.model) throw new CoffeeStop(1, `coffee пишет черновики только моделью ${COFFEE.draft.model} (схема пакета 17 sz), получено ${model}`);
  maxTokens = Math.min(maxTokens, COFFEE.draft.maxTokens);
  // --base: a pilot draft against an unmerged branch (its expert registry); never for a real PR.
  if (args.base && !args["dry-run"]) throw new CoffeeStop(1, "--base только вместе с --dry-run: настоящий черновик всегда строится от origin/main");
  const today = mskDate();
  const stamp = mskNow().slice(11, 16).replace(":", "");
  const runId = `${today}-${stamp}-coffee-${pack.pack}`.slice(0, 100);
  const outDir = resolve(args.out ?? join(process.env.HOME ?? ".", ".cache/writer/runs", runId));
  const worktree = join(outDir, "site");
  const branch = `writer/coffee-${pack.pack}`;
  if (!args.offline) assertBranchFree(repo, branch);
  const budget = Math.min(maxRub, pack.maxRub ?? Infinity, COFFEE.maxRubPerDraft * pack.articles.length);
  const state = { site: COFFEE.site, template: COFFEE.templateId, runId, model, startedAt: mskNow(), calls: [], spentRub: 0, outDir, branch, articles: [] };
  mkdirSync(outDir, { recursive: true });
  writeJson(join(outDir, "pack.json"), pack);
  // Each call gets its own completion window so that one draft never crosses COFFEE.maxRubPerDraft.
  const draftCall = (slug, callName, messages, schema) => {
    const before = state.spentRub;
    const spentOnDraft = state.calls.filter((call) => call.name.startsWith(`${slug}-`)).reduce((sum, call) => sum + (call.costRub ?? 0), 0);
    const tokens = draftTokenWindow(model, messages, { spentRub: spentOnDraft, capRub: COFFEE.maxRubPerDraft, maxTokens, minTokens: COFFEE.draftMinTokens });
    if (!tokens) return { skipped: true, spentOnDraft };
    const callWriter = makeCaller({ model, maxTokens: tokens, maxRub: budget, outDir, runId, state, schemaName: COFFEE.schemaName, generate });
    const article = callWriter(callName, messages, schema);
    log(`${callName}: окно ${tokens} токенов, черновик стоит ${formatRub(spentOnDraft + state.spentRub - before)} из ${formatRub(COFFEE.maxRubPerDraft)}`);
    return { article };
  };

  let code = 0;
  try {
    log(`coffee: старт ${runId}, ${articlesWord(pack.articles.length)}, модель ${model}, бюджет ${formatRub(budget)}`);
    for (const brief of pack.articles) for (const warning of brief.warnings ?? []) log(`  ⚠ бриф ${warning}`);
    state.baseSha = prepareWorktree(repo, worktree, args.base);
    const live = loadCoffeeExperts(worktree);
    const avoid = new Set(sectionKeys(worktree).map((text) => text.toLowerCase().replace(/ё/g, "е")));
    const quotesOnSite = siteQuotes(worktree);
    const packExperts = new Map(pack.articles.flatMap((brief) => brief.experts.map((slot) => [slot.id, brief.slug])));
    for (const brief of pack.articles) {
      if (existsSync(join(worktree, COFFEE.articlesDir, `${brief.slug}.ts`))) throw new CoffeeStop(2, `${brief.slug}: статья уже есть в разделе`);
    }
    const schema = coffeeArticleSchema();
    const items = [];
    for (const brief of pack.articles) {
      const messages = buildCoffeeMessages(brief, { experts: live, avoid: [...avoid] });
      writeJson(join(outDir, brief.slug, "messages.json"), messages);
      const build = (raw) => {
        const article = assembleCoffeeArticle(brief, raw);
        const problems = checkCoffeeArticle(article, brief, { experts: live, repoDir: worktree, avoid, siteQuotes: quotesOnSite, packExperts });
        return { article, problems };
      };
      let raw;
      if (args.offline) {
        const file = join(resolve(args.fixtures ?? join(outDir, "fixtures")), `${brief.slug}.json`);
        if (!existsSync(file)) throw new CoffeeStop(2, `--offline: нет ${file} (поля статьи JSON)`);
        raw = readJson(file);
        state.calls.push({ name: `${brief.slug}-offline`, costRub: 0, note: file });
      } else {
        const call = draftCall(brief.slug, `${brief.slug}-generate`, messages, schema);
        if (call.skipped) throw new CoffeeStop(5, `${brief.slug}: черновик не помещается в лимит ${formatRub(COFFEE.maxRubPerDraft)} на статью (модель ${model}) – вызов не сделан`);
        raw = call.article;
      }
      if (!raw) throw new CoffeeStop(2, `${brief.slug}: Райтер не вернул JSON`);
      let result = build(raw);
      let errors = result.problems.filter((problem) => problem.severity === "error");
      log(`${brief.slug}: ошибок ${errors.length}, предупреждений ${result.problems.length - errors.length}`);
      if (errors.length && !args.offline && COFFEE.draft.repair && !args["no-repair"]) {
        const call = draftCall(brief.slug, `${brief.slug}-repair`, buildCoffeeRepairMessages(messages, raw, result.problems), schema);
        if (call.skipped) log(`${brief.slug}: исправление пропущено – не помещается в лимит ${formatRub(COFFEE.maxRubPerDraft)} на статью (потрачено ${formatRub(call.spentOnDraft)})`);
        const repaired = call.article;
        if (repaired) {
          raw = repaired;
          result = build(raw);
          errors = result.problems.filter((problem) => problem.severity === "error");
          log(`${brief.slug} после исправления: ошибок ${errors.length}`);
        }
      }
      writeJson(join(outDir, brief.slug, "fields.json"), raw);
      writeText(join(outDir, brief.slug, `${brief.slug}.ts`), toTsModule(result.article, { packId: pack.pack, model }));
      for (const problem of result.problems) log(`  ${problem.severity === "error" ? "✗" : "⚠"} ${brief.slug} ${problem.field}: ${problem.message}`);
      const briefWarnings = (brief.warnings ?? []).map((message) => ({ field: "experts", severity: "warning", message }));
      state.articles.push({ slug: brief.slug, errors, warnings: [...briefWarnings, ...result.problems.filter((problem) => problem.severity !== "error")] });
      for (const key of uniqueKeys(result.article)) avoid.add(key);
      items.push({ brief, article: result.article });
    }
    if (state.articles.some((article) => article.errors.length)) throw new CoffeeStop(2, `пакет не прошёл проверки шаблона coffee – PR не создан (черновики в ${outDir})`);

    const applied = applyCoffeePack(worktree, { items, packId: pack.pack, model });
    state.files = applied.changed;
    const smoke = run("npx", ["tsx", "-e", `import { listVerticalArticles } from "./src/lib/business/vertical-guides/registry"; const s = new Set(listVerticalArticles("coffee").map((a) => a.slug)); for (const slug of ${JSON.stringify(items.map(({ article }) => article.slug))}) if (!s.has(slug)) { console.error("нет " + slug); process.exit(1); }`], { cwd: worktree, timeoutMs: 180 * 1000 });
    if (smoke.status !== 0) throw new CoffeeStop(3, `статьи не загружаются из реестра: ${smoke.stderr.trim().slice(-400)}`);
    if (!args["skip-build"]) {
      log("coffee: npx tsc --noEmit");
      const tsc = run("npx", ["tsc", "--noEmit", "-p", "."], { cwd: worktree, timeoutMs: 15 * 60 * 1000 });
      if (tsc.status !== 0) throw new CoffeeStop(3, `tsc: ${tsc.stdout.trim().split("\n").slice(-10).join("\n")}`);
    }

    mustRun("git", ["switch", "-q", "-c", branch], { cwd: worktree });
    state.headSha = commit(worktree, state.files, `content(coffee): пакет ${pack.pack} – ${articlesWord(items.length)} (Райтер, шаблон ${COFFEE.templateId})`);
    const scan = secretScan(worktree, state.baseSha);
    state.secretScan = scan;
    if (!scan.ok) throw new CoffeeStop(4, `поиск секретов: ${scan.findings.join("; ")}`);
    const title = `Райтер (кофейни): пакет ${pack.pack} – ${articlesWord(items.length)}`;
    const body = prBody(state, items, pack);
    writeText(join(outDir, "pr-body.md"), body);
    if (args["dry-run"] || args.offline) {
      log(`--dry-run: коммит ${state.headSha.slice(0, 8)} в ${worktree}, PR не создан`);
    } else {
      state.prUrl = pushAndOpenDraft(worktree, { branch, title, body, label: `Райтер (Cloud.ru ${model.split("/").pop()})`, outDir, repo: COFFEE.repo });
      log(`черновой PR: ${state.prUrl}`);
    }
  } catch (error) {
    code = typeof error.code === "number" ? error.code : 1;
    state.failure = error.message;
    log(`СТОП: ${error.message}`);
  }
  state.finishedAt = mskNow();
  writeJson(join(outDir, "report.json"), state);
  if (!args["keep-worktree"] && existsSync(worktree) && (code !== 0 || state.prUrl)) {
    run("git", ["worktree", "remove", "--force", worktree], { cwd: repo });
    run("git", ["branch", "-D", branch], { cwd: repo });
  }
  log(`итого Cloud.ru: ${formatRub(state.spentRub)}; отчёт ${join(outDir, "report.json")}`);
  return { code, state };
}

export function prBody(state, items, pack) {
  return [
    `Пакет **${pack.pack}** раздела «${COFFEE.byline}» (audiolad.ru/b/coffee): ${articlesWord(items.length)}. Темы – из задачи Сергея: ${pack.task}. Шаблон Райтера \`${COFFEE.templateId}\` (\`--site coffee\`), подпись – «${COFFEE.byline}», эталон – ${COFFEE.referenceUrl}.`,
    "",
    "**Это черновик Райтера, не публикация.** С пакета №2 Райтер пишет черновик по шаблону coffee, а Codex делает финальную доводку и публикует.",
    "",
    "## Статьи",
    ...items.map(({ brief }) => `- \`/b/coffee/${brief.slug}\` – «${brief.title}» (запрос «${brief.primaryQuery}»; эксперты: ${brief.experts.map((slot) => slot.id).join(", ")})`),
    "",
    "## Проверки",
    "- правила шаблона coffee (scripts/writer/lib/sites/coffee/rules.mjs): ошибок 0",
    ...state.articles.flatMap((article) => article.warnings.map((warning) => `- ⚠ ${article.slug} ${warning.field}: ${warning.message}`)),
    `- секреты: ${state.secretScan?.ok ? "чисто" : "–"}`,
    `- Cloud.ru: ${formatRub(state.spentRub)} за ${state.calls.length} вызовов (${state.model})`,
    "",
    "## Доводка Codex (перед merge)",
    "- Codex дорабатывает тексты в этой ветке обычными коммитами, без force-push;",
    "- обновить ожидания scripts/business-coffee-guide-unit.mts (сейчас тест считает эталон единственной статьёй и сверяет sitemap);",
    "- независимая вычитка: факты, вступление сразу по теме (без истории), эксперты по источникам, ссылки;",
    "- тон: предупреждения о повелительных формах и запретах «Не …йте» проверить по тексту, детектор может пропустить просьбу в предложении с «вы» (scripts/writer/README.md, «Тон: известные ограничения»);",
    "- публикацию (merge и деплой) делает Codex после доводки; Райтер не публикует.",
  ].join("\n");
}
