#!/usr/bin/env node
/**
 * Deploy-time article recrawl: manifest diff, script and deploy.sh hook.
 * Run: npx tsx scripts/article-recrawl-unit.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listVerticalGuideSitemapPaths } from "../src/lib/business/vertical-guides/sitemap.ts";
import { listArticleSlugs } from "../src/lib/seo/articles/registry.ts";
import { isPrivateIndexNowPath } from "../src/lib/seo/indexnow/urls.ts";
import { listIndexableListenPageDefinitions } from "../src/lib/seo/listens/registry.ts";
import { runArticleRecrawlStep } from "../src/lib/seo/search-recrawl/article-deploy-step.ts";
import {
  ARTICLE_RECRAWL_MANIFEST_FILE,
  ARTICLE_RECRAWL_REASONS,
  buildArticleRecrawlManifest,
  buildArticleRecrawlUrl,
  buildNextArticleRecrawlManifest,
  listArticleRecrawlEntries,
  parseArticleRecrawlManifest,
  planArticleRecrawl,
} from "../src/lib/seo/search-recrawl/articles.ts";
import { isAudioladRecrawlUrl } from "../src/lib/seo/search-recrawl/origin.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COFFEE_PATH = "/b/coffee/muzyka-dlya-kofeyni";

// --- current entries mirror the published article set
const entries = listArticleRecrawlEntries();
const paths = entries.map((entry) => entry.path);
assert.equal(new Set(paths).size, paths.length, "paths are unique");
assert.ok(paths.includes(COFFEE_PATH), "coffee guide is covered");
for (const slug of listArticleSlugs()) {
  assert.ok(paths.includes(`/articles/${slug}`), `article ${slug} covered`);
}
assert.ok(entries.some((entry) => entry.kind === "standalone"), "standalone guides covered");
const listenPages = listIndexableListenPageDefinitions().filter((page) => page.indexable !== false);
assert.ok(listenPages.length > 0);
for (const page of listenPages) {
  assert.ok(paths.includes(`/listens/${page.slug}`), `listen ${page.slug} covered`);
  assert.equal(isPrivateIndexNowPath(`/listens/${page.slug}`), false, "IndexNow accepts /listens");
}
const verticalPaths = new Set(listVerticalGuideSitemapPaths());
for (const entry of entries.filter((item) => item.kind === "vertical_guide")) {
  assert.ok(verticalPaths.has(entry.path), `${entry.path} is in the sitemap`);
}
assert.ok(!paths.includes("/b/coffee"), "section index is not an article");
for (const entry of entries) {
  assert.match(entry.fingerprint, /^[0-9a-f]{64}$/);
  assert.ok(isAudioladRecrawlUrl(buildArticleRecrawlUrl(entry.path)), entry.path);
}
assert.deepEqual(listArticleRecrawlEntries(), entries, "fingerprints are stable");

// --- injected sources
const injected = listArticleRecrawlEntries({
  articles: [{ slug: "a" }],
  standalone: [
    { path: "/guide", indexable: true },
    { path: "/hidden", indexable: false },
  ],
  verticalGuides: [{ path: "/b/coffee/x", content: { title: "x" } }],
  listens: [],
});
assert.deepEqual(injected.map((entry) => [entry.path, entry.kind]), [
  ["/articles/a", "article"],
  ["/b/coffee/x", "vertical_guide"],
  ["/guide", "standalone"],
]);
assert.deepEqual(
  listArticleRecrawlEntries({
    articles: [],
    standalone: [],
    verticalGuides: [],
    listens: [{ slug: "l" }, { slug: "off", indexable: false }],
  }).map((entry) => [entry.path, entry.kind]),
  [["/listens/l", "listen"]],
);
const edited = listArticleRecrawlEntries({
  articles: [{ slug: "a" }],
  standalone: [{ path: "/guide", indexable: true }],
  verticalGuides: [{ path: "/b/coffee/x", content: { title: "x2" } }],
  listens: [],
});
assert.notEqual(edited[1].fingerprint, injected[1].fingerprint, "content edit changes fingerprint");
assert.equal(edited[0].fingerprint, injected[0].fingerprint);

// --- manifest parse
const manifest = buildArticleRecrawlManifest(injected);
assert.deepEqual(parseArticleRecrawlManifest(JSON.stringify(manifest)), manifest);
assert.equal(parseArticleRecrawlManifest(null), null);
assert.equal(parseArticleRecrawlManifest(""), null);
assert.equal(parseArticleRecrawlManifest("{not json"), null);
assert.equal(parseArticleRecrawlManifest(JSON.stringify({ version: 2, entries: {} })), null);
assert.equal(parseArticleRecrawlManifest(JSON.stringify({ version: 1, entries: [] })), null);
assert.deepEqual(
  parseArticleRecrawlManifest(JSON.stringify({ version: 1, entries: { "/ok": "f", bad: "f", "/n": 1 } })),
  { version: 1, entries: { "/ok": "f" } },
);

// --- plan
assert.deepEqual(planArticleRecrawl(null, injected), { state: "seeded", total: 3 });
assert.deepEqual(planArticleRecrawl(manifest, injected), {
  state: "diff",
  total: 3,
  changes: [],
  deferred: [],
});
const previousWithoutGuide = { version: 1, entries: { "/articles/a": injected[0].fingerprint, "/gone": "x" } };
const plan = planArticleRecrawl(previousWithoutGuide, edited);
assert.equal(plan.state, "diff");
assert.deepEqual(plan.changes, [
  { path: "/b/coffee/x", url: "https://audiolad.ru/b/coffee/x", reason: ARTICLE_RECRAWL_REASONS.article_published },
  { path: "/guide", url: "https://audiolad.ru/guide", reason: ARTICLE_RECRAWL_REASONS.article_published },
]);
const updatePlan = planArticleRecrawl(manifest, edited);
assert.deepEqual(updatePlan.changes.map((change) => [change.path, change.reason]), [
  ["/b/coffee/x", "article_updated"],
]);
const massPlan = planArticleRecrawl(
  { version: 1, entries: { "/articles/a": "old", "/b/coffee/x": "old" } },
  edited,
  1,
);
assert.deepEqual(massPlan.changes.map((change) => change.path), ["/guide", "/articles/a"], "new + capped edits");
assert.deepEqual(massPlan.deferred.map((change) => change.path), ["/b/coffee/x"], "over-cap edit deferred");

// --- next manifest: unconfirmed paths keep the previous fingerprint or stay out
const prevManifest = { version: 1, entries: { "/articles/a": "old-a", "/b/coffee/x": "old-x", "/gone": "g" } };
assert.deepEqual(
  buildNextArticleRecrawlManifest(prevManifest, edited, new Set(["/b/coffee/x", "/guide"])),
  { version: 1, entries: { "/articles/a": edited[0].fingerprint, "/b/coffee/x": "old-x" } },
);
assert.deepEqual(buildNextArticleRecrawlManifest(null, edited, new Set(["/guide"])).entries, {
  "/articles/a": edited[0].fingerprint,
  "/b/coffee/x": edited[1].fingerprint,
});

// --- deploy step: failure on deploy N is retried on deploy N+1, over-cap edits deferred
const silent = () => {};
function fakeEnqueue(failUrls, calls) {
  return async (input) => {
    calls.push(`${input.engine} ${input.url} ${input.reason}`);
    if (failUrls.has(input.url) && input.engine === "indexnow") {
      return { outcome: "failed" };
    }
    return { outcome: "inserted", id: "00000000-0000-0000-0000-000000000001" };
  };
}
const stepDirs = [0, 1, 2, 3, 4].map((index) => mkdtempSync(path.join(tmpdir(), `article-step-${index}-`)));
const v1 = listArticleRecrawlEntries({
  articles: [{ slug: "a" }, { slug: "b" }, { slug: "c" }],
  standalone: [],
  verticalGuides: [],
  listens: [],
});
const deps = (entriesForDeploy, failUrls, calls, extra = {}) => ({
  entries: entriesForDeploy,
  prepareEnqueue: () => true,
  enqueue: fakeEnqueue(failUrls, calls),
  log: silent,
  ...extra,
});
const seed = await runArticleRecrawlStep({ releaseDir: stepDirs[0], previousDir: null }, deps(v1, new Set(), []));
assert.equal(seed.state, "seeded");

const v2 = listArticleRecrawlEntries({
  articles: [{ slug: "a" }, { slug: "b", v: 2 }, { slug: "c", v: 2 }, { slug: "new" }],
  standalone: [],
  verticalGuides: [],
  listens: [],
});
const callsN = [];
const deployN = await runArticleRecrawlStep(
  { releaseDir: stepDirs[1], previousDir: stepDirs[0] },
  deps(v2, new Set(["https://audiolad.ru/articles/new"]), callsN, { maxUpdates: 1 }),
);
assert.deepEqual(deployN.queued, ["/articles/b"]);
assert.deepEqual(deployN.failed, ["/articles/new"], "partial enqueue failure reported");
assert.deepEqual(deployN.deferred, ["/articles/c"]);
assert.equal(callsN.length, 4, "both engines tried for each queued change");

const callsN1 = [];
const deployN1 = await runArticleRecrawlStep(
  { releaseDir: stepDirs[2], previousDir: stepDirs[1] },
  deps(v2, new Set(), callsN1, { maxUpdates: 1 }),
);
assert.deepEqual(deployN1.queued, ["/articles/new", "/articles/c"], "failed URL and deferred edit go out next deploy");
assert.ok(callsN1.includes("yandex https://audiolad.ru/articles/new article_published"));
assert.ok(callsN1.includes("indexnow https://audiolad.ru/articles/c article_updated"));
assert.deepEqual(deployN1.failed, []);

const deployN2 = await runArticleRecrawlStep(
  { releaseDir: stepDirs[3], previousDir: stepDirs[2] },
  deps(v2, new Set(), [], { maxUpdates: 1 }),
);
assert.equal(deployN2.state, "no_changes", "converges once everything is queued");

// env missing / thrown enqueue: nothing advances
const envMissing = await runArticleRecrawlStep(
  { releaseDir: stepDirs[4], previousDir: stepDirs[0] },
  deps(v2, new Set(), [], { prepareEnqueue: () => false, maxUpdates: 1 }),
);
assert.equal(envMissing.state, "env_missing");
assert.deepEqual(
  parseArticleRecrawlManifest(readFileSync(path.join(stepDirs[4], ARTICLE_RECRAWL_MANIFEST_FILE), "utf8")),
  parseArticleRecrawlManifest(readFileSync(path.join(stepDirs[0], ARTICLE_RECRAWL_MANIFEST_FILE), "utf8")),
  "env missing keeps the previous manifest",
);
const throwing = await runArticleRecrawlStep(
  { releaseDir: mkdtempSync(path.join(tmpdir(), "article-step-throw-")), previousDir: stepDirs[0] },
  deps(v2, new Set(), [], {
    maxUpdates: 1,
    enqueue: async () => {
      throw new Error("boom");
    },
  }),
);
assert.deepEqual(throwing.failed, ["/articles/new", "/articles/b"]);

// --- script: writes manifest, queues nothing without a diff, never needs env for that
const tsx = path.join(root, "node_modules/.bin/tsx");
const script = path.join(root, "scripts/enqueue-article-recrawl.mts");
const childEnv = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
};
function runScript(args, expectedStatus = 0) {
  const result = spawnSync(tsx, [script, ...args], { cwd: root, env: childEnv, encoding: "utf8" });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return result.stdout;
}

const release = mkdtempSync(path.join(tmpdir(), "article-recrawl-release-"));
const seeded = runScript(["--release-dir", release]);
assert.match(seeded, /seeded_no_previous_manifest/);
const written = parseArticleRecrawlManifest(readFileSync(path.join(release, ARTICLE_RECRAWL_MANIFEST_FILE), "utf8"));
assert.deepEqual(written, buildArticleRecrawlManifest(entries));

const next = mkdtempSync(path.join(tmpdir(), "article-recrawl-next-"));
const same = runScript(["--release-dir", next, "--previous-dir", release]);
assert.match(same, /"changes":\[\]/);
assert.doesNotMatch(same, /enqueue_skipped_env_missing/);

const previous = mkdtempSync(path.join(tmpdir(), "article-recrawl-prev-"));
const withoutCoffee = { ...written.entries };
delete withoutCoffee[COFFEE_PATH];
writeFileSync(
  path.join(previous, ARTICLE_RECRAWL_MANIFEST_FILE),
  JSON.stringify({ version: 1, entries: withoutCoffee }),
);
const dry = mkdtempSync(path.join(tmpdir(), "article-recrawl-dry-"));
const dryOut = runScript(["--release-dir", dry, "--previous-dir", previous, "--dry-run"]);
assert.ok(dryOut.includes(`"url":"https://audiolad.ru${COFFEE_PATH}","reason":"article_published"`), dryOut);
assert.equal(existsSync(path.join(dry, ARTICLE_RECRAWL_MANIFEST_FILE)), false, "dry run writes nothing");

// deploy N without Supabase env: exit 2, manifest does not advance, deploy N+1 plans again
const failedRelease = mkdtempSync(path.join(tmpdir(), "article-recrawl-failed-"));
const failedRun = runScript(["--release-dir", failedRelease, "--previous-dir", previous], 2);
assert.match(failedRun, /enqueue_skipped_env_missing/);
const failedManifest = parseArticleRecrawlManifest(
  readFileSync(path.join(failedRelease, ARTICLE_RECRAWL_MANIFEST_FILE), "utf8"),
);
assert.equal(failedManifest.entries[COFFEE_PATH], undefined, "failed new URL stays out of the manifest");
const retryRelease = mkdtempSync(path.join(tmpdir(), "article-recrawl-retry-"));
const retryOut = runScript(["--release-dir", retryRelease, "--previous-dir", failedRelease, "--dry-run"]);
assert.ok(retryOut.includes(`"url":"https://audiolad.ru${COFFEE_PATH}","reason":"article_published"`), retryOut);

// --- deploy.sh hook: after the worker ensure, before inflight cleanup, non-blocking
const deploy = readFileSync(path.join(root, "deploy/scripts/deploy.sh"), "utf8");
const fnStart = deploy.indexOf("enqueue_article_recrawl() {");
assert.ok(fnStart > 0);
const fnBody = deploy.slice(fnStart, deploy.indexOf("\n}\n", fnStart));
assert.doesNotMatch(fnBody, /exit 1|send_deploy_alert/);
assert.match(fnBody, /NODE_ENV=production timeout -k "\$\{ARTICLE_RECRAWL_KILL_AFTER:-10s\}" "\$\{ARTICLE_RECRAWL_TIMEOUT:-120s\}"/);
assert.match(fnBody, /log_warn "article_recrawl_enqueue_failed/);
const call = deploy.indexOf('enqueue_article_recrawl "$RELEASE_DIR" "$old_current"');
const workerEnsure = deploy.indexOf("search_recrawl_worker_ensure_failed");
const inflight = deploy.indexOf('rm -f "$RELEASE_DIR/.deploy-inflight"');
assert.ok(workerEnsure > 0 && call > workerEnsure && inflight > call, "hook order");

// --- deploy.sh function behaviour with a stub tsx: success / failure / timeout / missing
const fnSource = `${fnBody}\n}\n`;
function runDeployHarness(stubBody, { withTsx = true, timeout = "5s" } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "article-recrawl-deploy-"));
  const release = path.join(dir, "release");
  mkdirSync(path.join(release, "scripts"), { recursive: true });
  mkdirSync(path.join(release, "node_modules/.bin"), { recursive: true });
  writeFileSync(path.join(release, "scripts/enqueue-article-recrawl.mts"), "// stub\n");
  if (withTsx) {
    const stub = path.join(release, "node_modules/.bin/tsx");
    writeFileSync(stub, `#!/usr/bin/env bash\necho "stub cwd=$(pwd) node_env=$NODE_ENV args=$*"\n${stubBody}\n`);
    chmodSync(stub, 0o755);
  }
  const harness = path.join(dir, "harness.sh");
  writeFileSync(
    harness,
    [
      "#!/usr/bin/env bash",
      "set -Eeuo pipefail",
      "trap 'echo ERR_TRAP_FIRED' ERR",
      'log_info() { echo "INFO $*"; }',
      'log_warn() { echo "WARN $*"; }',
      fnSource,
      `ARTICLE_RECRAWL_TIMEOUT=${timeout} ARTICLE_RECRAWL_KILL_AFTER=1s enqueue_article_recrawl "${release}" "${dir}"`,
      "echo DEPLOY_CONTINUES",
    ].join("\n"),
  );
  const result = spawnSync("bash", [harness], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /DEPLOY_CONTINUES/);
  assert.doesNotMatch(result.stdout, /ERR_TRAP_FIRED/);
  return { out: result.stdout, release, dir };
}
const ok = runDeployHarness("exit 0");
assert.match(ok.out, /INFO article_recrawl_enqueue_done/);
assert.ok(ok.out.includes(`stub cwd=${ok.release} node_env=production`), ok.out);
assert.ok(ok.out.includes(`--release-dir ${ok.release} --previous-dir ${ok.dir}`), ok.out);
assert.match(runDeployHarness("exit 2").out, /WARN article_recrawl_enqueue_failed exit_code=2 non_blocking=1/);
assert.match(runDeployHarness("sleep 30", { timeout: "1s" }).out, /WARN article_recrawl_enqueue_failed exit_code=124/);
assert.match(
  runDeployHarness("trap '' TERM; sleep 30", { timeout: "1s" }).out,
  /WARN article_recrawl_enqueue_failed exit_code=137/,
  "kill-after ends a child that ignores SIGTERM",
);
assert.match(runDeployHarness("", { withTsx: false }).out, /WARN article_recrawl_enqueue_skipped/);

const doc = readFileSync(path.join(root, "docs/yandex-webmaster-recrawl.md"), "utf8");
assert.match(doc, /enqueue-article-recrawl\.mts/);
assert.doesNotMatch(doc, /SEO\s+articles stay unwired/);

console.log("article-recrawl-unit: ok");
