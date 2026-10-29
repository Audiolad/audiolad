#!/usr/bin/env node
/**
 * Deploy-time article recrawl: manifest diff, script and deploy.sh hook.
 * Run: npx tsx scripts/article-recrawl-unit.mjs
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listVerticalGuideSitemapPaths } from "../src/lib/business/vertical-guides/sitemap.ts";
import { listArticleSlugs } from "../src/lib/seo/articles/registry.ts";
import {
  ARTICLE_RECRAWL_MANIFEST_FILE,
  ARTICLE_RECRAWL_REASONS,
  buildArticleRecrawlManifest,
  buildArticleRecrawlUrl,
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
});
assert.deepEqual(injected.map((entry) => [entry.path, entry.kind]), [
  ["/articles/a", "article"],
  ["/b/coffee/x", "vertical_guide"],
  ["/guide", "standalone"],
]);
const edited = listArticleRecrawlEntries({
  articles: [{ slug: "a" }],
  standalone: [{ path: "/guide", indexable: true }],
  verticalGuides: [{ path: "/b/coffee/x", content: { title: "x2" } }],
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
  skippedUpdates: 0,
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
assert.deepEqual(massPlan.changes.map((change) => change.path), ["/guide"], "new still queued");
assert.equal(massPlan.skippedUpdates, 2);

// --- script: writes manifest, queues nothing without a diff, never needs env for that
const tsx = path.join(root, "node_modules/.bin/tsx");
const script = path.join(root, "scripts/enqueue-article-recrawl.mts");
const childEnv = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
};
function runScript(args) {
  const result = spawnSync(tsx, [script, ...args], { cwd: root, env: childEnv, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
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

const envMissing = runScript(["--release-dir", dry, "--previous-dir", previous]);
assert.match(envMissing, /enqueue_skipped_env_missing/, "no env → skip, exit 0");

// --- deploy.sh hook: after the worker ensure, before inflight cleanup, non-blocking
const deploy = readFileSync(path.join(root, "deploy/scripts/deploy.sh"), "utf8");
const fnStart = deploy.indexOf("enqueue_article_recrawl() {");
assert.ok(fnStart > 0);
const fnBody = deploy.slice(fnStart, deploy.indexOf("\n}\n", fnStart));
assert.doesNotMatch(fnBody, /exit 1|send_deploy_alert/);
assert.match(fnBody, /NODE_ENV=production timeout/);
assert.match(fnBody, /log_warn "article_recrawl_enqueue_failed/);
const call = deploy.indexOf('enqueue_article_recrawl "$RELEASE_DIR" "$old_current"');
const workerEnsure = deploy.indexOf("search_recrawl_worker_ensure_failed");
const inflight = deploy.indexOf('rm -f "$RELEASE_DIR/.deploy-inflight"');
assert.ok(workerEnsure > 0 && call > workerEnsure && inflight > call, "hook order");

const doc = readFileSync(path.join(root, "docs/yandex-webmaster-recrawl.md"), "utf8");
assert.match(doc, /enqueue-article-recrawl\.mts/);
assert.doesNotMatch(doc, /SEO\s+articles stay unwired/);

console.log("article-recrawl-unit: ok");
