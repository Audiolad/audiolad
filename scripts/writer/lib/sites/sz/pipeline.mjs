// `--site sz`: a pack of up to 5 sergey-zoya.ru articles → ONE draft PR to Audiolad/sergey-zoya-site.
// Flow: pack brief → clean worktree of the site's origin/main → per article: prompt (fields JSON)
// → assemble fixed blocks → site rules → one repair → pack checks (rotation, uniqueness) →
// apply (articles, OG, story openings, canonical counter, stage gate, SEO report) → local site
// checks vs clean-main baseline → commit → secret scan → draft PR. Never merges or deploys.
import { fileURLToPath } from "node:url";
import { copyFileSync, existsSync, mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";

import { BudgetError, makeCaller } from "../../call.mjs";
import { SUPPORTED_MODELS, formatRub, parseMaxTokens } from "../../cost.mjs";
import { commit, pushAndOpenDraft, secretScan } from "../../publish.mjs";
import { log, mskDate, mskNow, mustRun, readJson, run, writeJson, writeText } from "../../util.mjs";
import { DISCOMFORT_PATTERNS as BASE_DISCOMFORT } from "../../validate.mjs";
import { applyPack, ruleConfig } from "./apply.mjs";
import { assembleSzArticle, normalizeSzFields } from "./assemble.mjs";
import { loadPack } from "./brief.mjs";
import { checksMarkdown, compareSzChecks, runSzChecks } from "./checks.mjs";
import { SZ } from "./config.mjs";
import { loadSzContext } from "./context.mjs";
import { expertCard, loadExpertPool, rankExperts, rotationAdvice } from "./experts.mjs";
import { applySzRepairPatch, buildSzMessages, buildSzRepairMessages, buildSzTargetedRepair, szArticleSchema } from "./prompt.mjs";
import { checkSzArticle, checkSzPack, uniqueKeys } from "./rules.mjs";

export class SzStop extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Site view for one pack: published articles + pack siblings (they may link each other). */
export function packView(ctx, pack) {
  const siblings = new Map(pack.articles.map((article) => [article.slug, article.title]));
  const published = new Set([...ctx.articles.values()].filter((article) => !article.draft).map((article) => article.slug));
  const problems = [];
  for (const article of pack.articles) {
    if (ctx.articles.has(article.slug)) problems.push(`${article.slug}: статья уже есть на сайте`);
    for (const target of [...article.links.contextual, ...article.links.readmore]) {
      if (!published.has(target) && !siblings.has(target)) problems.push(`${article.slug}: ссылка /s/${target} – нет такой опубликованной статьи и статьи в пакете`);
    }
  }
  for (const slug of siblings.keys()) published.add(slug);
  const articles = new Map(ctx.articles);
  for (const [slug, title] of siblings) if (!articles.has(slug)) articles.set(slug, { slug, title, draft: false, listed: true, query: null });
  return { site: { ...ctx, articles }, published, siblings, problems };
}

/** Resolves expert cards (site card / KNOWN_CARDS / brief override) and checks portraits. */
export function resolveCards(pack, ctx) {
  const problems = [];
  const portraits = new Map();
  for (const article of pack.articles) {
    for (const expert of article.experts) {
      const card = expertCard(expert.name, { siteCards: ctx.expertCards, override: expert.card });
      expert.resolvedCard = card;
      if (expert.card?.photoFile && card.photo && !ctx.portraitExists(card.photo)) portraits.set(card.photo, expert.card.photoFile);
      if (!card.photo || (!ctx.portraitExists(card.photo) && !portraits.has(card.photo))) problems.push(`${article.slug}: у «${expert.name}» нет портрета в public/media/experts (${card.photo ?? "card.photo не задан"}) – добавьте портрет на сайт или выберите другого эксперта`);
      for (const key of ["alt", "credit"]) if (!card[key]) problems.push(`${article.slug}: у «${expert.name}» нет card.${key} (подпись портрета) – укажите в брифе`);
      if (!expert.role && !card.role) problems.push(`${article.slug}: у «${expert.name}» нет role – укажите в брифе`);
    }
  }
  return { problems, portraits };
}

const hideCredentials = (text) => String(text).replace(/(:\/\/)[^@/\s]+@/g, "$1***@");

/**
 * The pack branch must be free both locally and on origin. `git ls-remote --exit-code` returns 2
 * when the branch is absent (OK); 0 means it exists; anything else (no network, no auth, no
 * origin) is a stop too – without knowing, the run could spend the budget and fail at push.
 */
export function assertBranchFree(repo, branch) {
  if (run("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repo }).status === 0) {
    throw new SzStop(1, `ветка ${branch} уже есть в ${repo} – удалите её (git branch -D ${branch}) или смените pack`);
  }
  const remote = run("git", ["ls-remote", "--exit-code", "--heads", "origin", `refs/heads/${branch}`], {
    cwd: repo,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    timeoutMs: 60 * 1000,
  });
  if (remote.status === 0) {
    throw new SzStop(1, `ветка ${branch} уже есть на origin (${SZ.repo}) – закройте старый PR и удалите ветку или смените pack; генерация не запускалась`);
  }
  if (remote.status !== 2) {
    const why = hideCredentials(remote.stderr.trim().split("\n").slice(-3).join(" "));
    throw new SzStop(1, `не удалось проверить ветку ${branch} на origin (git ls-remote, код ${remote.status}${why ? `: ${why}` : ""}) – проверьте сеть и доступ к ${SZ.repo}; генерация не запускалась`);
  }
}

function prepareSiteWorktree(repo, worktree) {
  mustRun("git", ["fetch", "-q", "origin", "main"], { cwd: repo });
  if (existsSync(worktree)) throw new Error(`worktree уже существует: ${worktree}`);
  mustRun("git", ["worktree", "add", "-q", "--detach", worktree, "origin/main"], { cwd: repo });
  const modules = join(repo, "node_modules");
  if (!existsSync(modules)) throw new SzStop(1, `${repo}: нет node_modules – выполните npm ci в клоне сайта`);
  symlinkSync(realpathSync(modules), join(worktree, "node_modules"));
  return mustRun("git", ["rev-parse", "HEAD"], { cwd: worktree }).trim();
}

/** Least-used experts first – a helper for preparing the next pack's briefs. */
export function expertsReport(pool, ctx) {
  const rows = rankExperts(pool, ctx.expertUsage).map((expert) => {
    const card = expertCard(expert.name, { siteCards: ctx.expertCards });
    const portrait = card.photo && ctx.portraitExists(card.photo) ? card.photo : "нет портрета";
    return `| ${expert.name} | ${expert.gender}, ${expert.group} | ${expert.used} | ${portrait} | ${expert.caution ? "да" : ""} |`;
  });
  return ["| Эксперт | Пол, группа | Статей на сайте | Портрет | Осторожно |", "| --- | --- | --- | --- | --- |", ...rows].join("\n");
}

export async function runSzPipeline(args, { model, maxRub, maxTokens, generate }) {
  const repair = szRepairOptions(args, { model, maxTokens });
  const pool = loadExpertPool(args.experts ? resolve(args.experts) : undefined);
  const repo = resolve(args.repo ?? process.env.WRITER_SZ_REPO ?? "");
  if (!args.repo && !process.env.WRITER_SZ_REPO) throw new SzStop(1, "--repo <клон sergey-zoya-site> обязателен для --site sz");
  if (args["experts-report"]) {
    process.stdout.write(`${expertsReport(pool, loadSzContext(repo))}\n`);
    return { code: 0 };
  }
  const pack = loadPack(resolve(args.briefs ?? args.brief), { pool });
  const today = mskDate();
  const date = pack.publishedAt ?? today;
  const stamp = mskNow().slice(11, 16).replace(":", "");
  const runId = `${today}-${stamp}-sz-${pack.pack}`.slice(0, 100);
  const outDir = resolve(args.out ?? join(process.env.HOME ?? ".", ".cache/writer/runs", runId));
  const worktree = join(outDir, "site");
  const branch = `writer/sz-${pack.pack}`;
  // Fail before any Cloud.ru spend (also in --dry-run / --offline): the push step would hit an
  // existing branch only after the whole budget is spent.
  assertBranchFree(repo, branch);
  const budget = Math.min(maxRub, pack.maxRub ?? Infinity);
  const state = { site: "sz", runId, model, repairModel: repair.model, repairMaxTokens: repair.maxTokens, repairMode: repair.mode, startedAt: mskNow(), calls: [], spentRub: 0, outDir, branch, articles: [], warnings: [] };
  mkdirSync(outDir, { recursive: true });
  writeJson(join(outDir, "pack.json"), pack);
  const callWriter = makeCaller({ model, maxTokens, maxRub: budget, outDir, runId, state, schemaName: "sergey_zoya_article", generate });

  const callRepair = makeCaller({ ...repair, maxRub: budget, outDir, runId, state, schemaName: repair.mode === "targeted" ? "sergey_zoya_patch" : "sergey_zoya_article", generate });

  let code = 0;
  try {
    log(`sz: старт ${runId}, ${pack.articles.length} статей, модель ${model}, бюджет ${formatRub(budget)}`);
    state.baseSha = prepareSiteWorktree(repo, worktree);
    const ctx = loadSzContext(worktree);
    const view = packView(ctx, pack);
    const cards = resolveCards(pack, ctx);
    const problems = [...view.problems, ...cards.problems];
    if (problems.length) throw new SzStop(2, `бриф не согласуется с сайтом:\n- ${problems.join("\n- ")}`);
    state.warnings.push(...rotationAdvice(pack.articles, pool, ctx.expertUsage, {
      hasPortrait: (name) => Boolean(expertCard(name, { siteCards: ctx.expertCards }).photo),
      portraitOnSite: (name) => ctx.portraitExists(expertCard(name, { siteCards: ctx.expertCards }).photo),
    }));
    for (const warning of state.warnings) log(`  ⚠ ${warning}`);

    // New experts' portraits from the brief (card.photoFile) go into the site with the pack.
    for (const [photo, file] of cards.portraits) {
      mkdirSync(join(worktree, "public/media/experts"), { recursive: true });
      copyFileSync(file, join(worktree, "public/media/experts", photo));
      log(`портрет ${photo} ← ${file}`);
    }
    const env = { published: view.published, unique: ctx.unique, referenceGallery: ctx.referenceGallery, portraitExists: (src) => existsSync(join(worktree, "public", src)), discomfort: BASE_DISCOMFORT };
    const schema = szArticleSchema();
    const items = [];
    for (const brief of pack.articles) {
      const cfg = ruleConfig(brief, date, pool);
      const avoid = [
        ...ctx.unique.headings.keys(),
        ...items.flatMap((item) => Object.values(uniqueKeys(item.md)).flat()),
      ];
      const messages = buildSzMessages(brief, view.site, { avoid: avoid.reverse(), siblings: view.siblings });
      writeJson(join(outDir, brief.slug, "messages.json"), messages);
      const build = (raw) => {
        const { fields, changes } = normalizeSzFields(raw);
        if (changes.length) log(`${brief.slug}: нормализация – ${changes.join("; ")}`);
        const md = assembleSzArticle(brief, fields, view.site, { date });
        return { fields, md, problems: checkSzArticle(md, cfg, env) };
      };
      let raw;
      if (args.offline) {
        const file = join(resolve(args.fixtures ?? join(outDir, "fixtures")), `${brief.slug}.json`);
        if (!existsSync(file)) throw new SzStop(2, `--offline: нет ${file} (поля статьи JSON)`);
        raw = readJson(file);
        state.calls.push({ name: `${brief.slug}-offline`, costRub: 0, note: file });
      } else {
        raw = callWriter(`${brief.slug}-generate`, messages, schema);
      }
      if (!raw) throw new SzStop(2, `${brief.slug}: Райтер не вернул JSON`);
      const { result, errors, errorsBeforeRepair, repairSkipped } = repairSzArticle({
        brief, raw, build, messages, schema, repair, callRepair, state, args,
      });
      writeJson(join(outDir, brief.slug, "fields.json"), result.fields);
      writeText(join(outDir, brief.slug, `${brief.slug}.md`), result.md);
      for (const error of errors) log(`  ✗ ${brief.slug} ${error.field}: ${error.message}`);
      state.articles.push({ slug: brief.slug, errorsBeforeRepair, errorsAfterRepair: errors, repairSkipped, errors, warnings: result.problems.filter((problem) => problem.severity !== "error") });
      items.push({ brief, cfg, fields: result.fields, md: result.md });
    }
    const packProblems = checkSzPack(items);
    for (const problem of packProblems) log(`  ✗ пакет ${problem.slug ?? ""}: ${problem.message}`);
    state.packProblems = packProblems;
    if (packProblems.length || state.articles.some((article) => article.errors.length)) throw new SzStop(2, `пакет не прошёл проверки – PR не создан (черновики в ${outDir})`);

    const build = !args["skip-build"];
    log("sz: проверки на чистом main (baseline)");
    const baseline = runSzChecks(worktree, { build, log });
    const cost = `${formatRub(state.spentRub)} (${state.calls.length} вызовов)`;
    const applied = applyPack(worktree, { pack: pack.pack, stage: ctx.nextStage, date, items, cost, model, packBrief: pack.pack, pool });
    state.files = [...applied.changed, ...[...cards.portraits.keys()].map((photo) => `public/media/experts/${photo}`)];
    log(`sz: проверки после пакета (${applied.gateFile})`);
    const after = runSzChecks(worktree, { build, log, extraSteps: [`node scripts/${applied.gateFile}`] });
    const verdict = compareSzChecks(baseline, after);
    state.checks = { markdown: checksMarkdown(after, verdict), ok: verdict.ok };
    if (!verdict.ok) throw new SzStop(3, `проверки сайта не прошли: ${verdict.blocking.map((step) => step.command).join(", ")}`);

    mustRun("git", ["switch", "-q", "-c", branch], { cwd: worktree });
    state.headSha = commit(worktree, state.files, `content: пакет ${pack.pack} (stage ${ctx.nextStage}, ${items.length} статей, Райтер)`);
    const scan = secretScan(worktree, state.baseSha, { gitleaksConfig: fileURLToPath(new URL("./gitleaks.toml", import.meta.url)) });
    state.secretScan = scan;
    if (!scan.ok) throw new SzStop(4, `поиск секретов: ${scan.findings.join("; ")}`);
    const title = `Райтер: пакет ${pack.pack} – ${items.length} статей (stage ${ctx.nextStage})`;
    const body = prBody(state, items, pack, ctx.nextStage);
    writeText(join(outDir, "pr-body.md"), body);
    if (args["dry-run"]) {
      log(`--dry-run: коммит ${state.headSha.slice(0, 8)} в ${worktree}, PR не создан`);
    } else {
      state.prUrl = pushAndOpenDraft(worktree, { branch, title, body, label: `Райтер (Cloud.ru ${model.split("/").pop()})`, outDir, repo: SZ.repo });
      log(`черновой PR: ${state.prUrl}`);
    }
  } catch (error) {
    code = typeof error.code === "number" ? error.code : 1;
    state.failure = error.message;
    log(`СТОП: ${error.message}`);
  }
  state.finishedAt = mskNow();
  writeJson(join(outDir, "report.json"), state);
  writeText(join(outDir, "report.md"), szReportMarkdown(state));
  if (!args["keep-worktree"] && existsSync(worktree) && (code !== 0 || state.prUrl)) {
    run("git", ["worktree", "remove", "--force", worktree], { cwd: repo });
    run("git", ["branch", "-D", branch], { cwd: repo });
  }
  log(`итого Cloud.ru: ${formatRub(state.spentRub)}; отчёт ${join(outDir, "report.json")}`);
  return { code, state };
}

export function prBody(state, items, pack, stage) {
  return [
    `Пакет **${pack.pack}** для sergey-zoya.ru: ${items.length} статей, stage ${stage}. Тексты – «Райтер» (Cloud.ru ${state.model}), автор на сайте – ${SZ.author}.`,
    "",
    "## Статьи",
    ...items.map(({ brief }) => `- \`/s/${brief.slug}\` – «${brief.title}» (запрос «${brief.query}»; эксперты: ${brief.experts.map((expert) => expert.name).join(", ")})`),
    "",
    "## Проверки (локально; Actions сайта недоступны)",
    state.checks?.markdown ?? "–",
    "",
    `- секреты: ${state.secretScan?.ok ? `чисто (${state.secretScan.tool ?? "шаблоны"})` : "–"}`,
    `- Cloud.ru: ${formatRub(state.spentRub)} за ${state.calls.length} вызовов`,
    state.warnings.length ? `\n## Ротация экспертов (предупреждения)\n${state.warnings.map((warning) => `- ${warning}`).join("\n")}` : "",
    "",
    "## Перед merge",
    "- независимая вычитка каждой статьи (факты, цитаты по источникам, тон);",
    "- merge и деплой – вручную, Райтер их не делает.",
  ].join("\n");
}

export function szRepairOptions(args, { model, maxTokens }) {
  const repairModel = args["repair-model"] ?? model;
  for (const candidate of [model, repairModel]) {
    if (!SUPPORTED_MODELS.includes(candidate)) throw new SzStop(1, `Модель ${candidate} не поддерживается. Доступны: ${SUPPORTED_MODELS.join(", ")}`);
  }
  const mode = args["repair-mode"] ?? "full";
  if (!["full", "targeted"].includes(mode)) throw new SzStop(1, "--repair-mode: full или targeted");
  return { model: repairModel, maxTokens: parseMaxTokens(args["repair-max-tokens"] ?? maxTokens, "--repair-max-tokens"), mode };
}

export function szReportMarkdown(state) {
  const lines = ["# Отчёт Райтера sz", "", ...state.calls.map((call) => `- ${call.name}: ${call.model ?? "offline"} – ${formatRub(call.costRub)}${call.costEstimated ? " (худший случай: нет usage)" : ""}`), "", `Итого: ${formatRub(state.spentRub)}`, ""];
  for (const article of state.articles) {
    lines.push(`## ${article.slug}`, "", `repairSkipped: ${article.repairSkipped ?? "нет"}`, "", "До repair:", ...article.errorsBeforeRepair.map((p) => `- ${p.field}: ${p.message}`), "", "После repair:", ...article.errorsAfterRepair.map((p) => `- ${p.field}: ${p.message}`), "");
  }
  lines.push(...state.warnings.map((warning) => `- ⚠ ${warning}`));
  if (state.failure) lines.push("", `СТОП: ${state.failure}`);
  return lines.join("\n");
}

/** One repair attempt, shared by the pack loop and offline tests with an injected caller. */
export function repairSzArticle({ brief, raw, build, messages, schema = szArticleSchema(), repair, callRepair, state, args = {} }) {
  let result = build(raw);
  let errors = result.problems.filter((problem) => problem.severity === "error");
  log(`${brief.slug}: ошибок ${errors.length}, предупреждений ${result.problems.length - errors.length}`);
  const errorsBeforeRepair = errors;
  let repairSkipped = null;
  if (errors.length && !args.offline && !args["no-repair"]) {
    const target = repair.mode === "targeted" ? buildSzTargetedRepair(brief, raw, result.problems) : null;
    try {
      const answer = callRepair(`${brief.slug}-repair`, target?.messages ?? buildSzRepairMessages(messages, raw, result.problems), target?.schema ?? schema);
      const repaired = target ? applySzRepairPatch(raw, answer, target.schema) : answer;
      if (repaired) {
        raw = repaired;
        result = build(raw);
        errors = result.problems.filter((problem) => problem.severity === "error");
        log(`${brief.slug} после исправления: ошибок ${errors.length}`);
      } else if (target) {
        const warning = `${brief.slug}: невалидный/пустой patch – исходный вариант сохранён`;
        state.warnings.push(warning);
        log(warning);
      }
    } catch (error) {
      if (!(error instanceof BudgetError)) throw error;
      repairSkipped = "budget";
      log(`${brief.slug}: repair пропущен: бюджет`);
    }
  }
  return { result, errors, errorsBeforeRepair, repairSkipped };
}
