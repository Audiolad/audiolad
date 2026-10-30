// `--site coffee`: a pack of up to 5 AudioLad coffee guides → ONE draft PR to Audiolad/audiolad.
// Flow: coffee pack brief (site/template id checked) → clean worktree of origin/main → per article:
// prompt (fields JSON) → assemble VerticalGuideArticle → coffee rules → one repair → apply
// (article modules + registry) → type check → commit → secret scan → draft PR.
// Never merges, deploys or publishes. Shares only the generic Cloud.ru caller and git helpers
// with other modes; nothing from the sz template folder is imported.
import { existsSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";

import { makeCaller } from "../../call.mjs";
import { formatRub } from "../../cost.mjs";
import { commit, pushAndOpenDraft, secretScan } from "../../publish.mjs";
import { log, mskDate, mskNow, mustRun, readJson, run, writeJson, writeText } from "../../util.mjs";
import { applyCoffeePack } from "./apply.mjs";
import { assembleCoffeeArticle, toTsModule } from "./assemble.mjs";
import { loadCoffeeExperts, loadCoffeePack } from "./brief.mjs";
import { COFFEE } from "./config.mjs";
import { buildCoffeeMessages, buildCoffeeRepairMessages, coffeeArticleSchema } from "./prompt.mjs";
import { checkCoffeeArticle, uniqueKeys } from "./rules.mjs";

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

function prepareWorktree(repo, worktree) {
  mustRun("git", ["fetch", "-q", "origin", "main"], { cwd: repo });
  if (existsSync(worktree)) throw new Error(`worktree уже существует: ${worktree}`);
  mustRun("git", ["worktree", "add", "-q", "--detach", worktree, "origin/main"], { cwd: repo });
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

export async function runCoffeePipeline(args, { model, maxRub, maxTokens, generate }) {
  const repo = resolve(args.repo ?? mustRun("git", ["rev-parse", "--show-toplevel"]).trim());
  const experts = loadCoffeeExperts(repo);
  const pack = loadCoffeePack(resolve(args.briefs ?? args.brief), { experts, repoDir: repo });
  const today = mskDate();
  const stamp = mskNow().slice(11, 16).replace(":", "");
  const runId = `${today}-${stamp}-coffee-${pack.pack}`.slice(0, 100);
  const outDir = resolve(args.out ?? join(process.env.HOME ?? ".", ".cache/writer/runs", runId));
  const worktree = join(outDir, "site");
  const branch = `writer/coffee-${pack.pack}`;
  if (!args.offline) assertBranchFree(repo, branch);
  const budget = Math.min(maxRub, pack.maxRub ?? Infinity);
  const state = { site: COFFEE.site, template: COFFEE.templateId, runId, model, startedAt: mskNow(), calls: [], spentRub: 0, outDir, branch, articles: [] };
  mkdirSync(outDir, { recursive: true });
  writeJson(join(outDir, "pack.json"), pack);
  const callWriter = makeCaller({ model, maxTokens, maxRub: budget, outDir, runId, state, schemaName: COFFEE.schemaName, generate });

  let code = 0;
  try {
    log(`coffee: старт ${runId}, ${articlesWord(pack.articles.length)}, модель ${model}, бюджет ${formatRub(budget)}`);
    state.baseSha = prepareWorktree(repo, worktree);
    const live = loadCoffeeExperts(worktree);
    const avoid = new Set(sectionKeys(worktree).map((text) => text.toLowerCase().replace(/ё/g, "е")));
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
        const problems = checkCoffeeArticle(article, brief, { experts: live, storyCount: (raw.story ?? []).length, repoDir: worktree, avoid });
        return { article, problems };
      };
      let raw;
      if (args.offline) {
        const file = join(resolve(args.fixtures ?? join(outDir, "fixtures")), `${brief.slug}.json`);
        if (!existsSync(file)) throw new CoffeeStop(2, `--offline: нет ${file} (поля статьи JSON)`);
        raw = readJson(file);
        state.calls.push({ name: `${brief.slug}-offline`, costRub: 0, note: file });
      } else {
        raw = callWriter(`${brief.slug}-generate`, messages, schema);
      }
      if (!raw) throw new CoffeeStop(2, `${brief.slug}: Райтер не вернул JSON`);
      let result = build(raw);
      let errors = result.problems.filter((problem) => problem.severity === "error");
      log(`${brief.slug}: ошибок ${errors.length}, предупреждений ${result.problems.length - errors.length}`);
      if (errors.length && !args.offline && !args["no-repair"]) {
        const repaired = callWriter(`${brief.slug}-repair`, buildCoffeeRepairMessages(messages, raw, result.problems), schema);
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
      state.articles.push({ slug: brief.slug, errors, warnings: result.problems.filter((problem) => problem.severity !== "error") });
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
    `Пакет **${pack.pack}** раздела «Музыка для кофейни» (audiolad.ru/b/coffee): ${articlesWord(items.length)}. Шаблон Райтера \`${COFFEE.templateId}\` (\`--site coffee\`), подпись – «${COFFEE.byline}», эталон – ${COFFEE.referenceUrl}.`,
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
    "## Перед merge",
    "- обновить ожидания scripts/business-coffee-guide-unit.mts (сейчас тест считает эталон единственной статьёй и сверяет sitemap);",
    "- независимая вычитка: факты, история (без имён, тёплая), эксперты по источникам, ссылки;",
    "- merge и деплой – вручную, Райтер их не делает.",
  ].join("\n");
}
