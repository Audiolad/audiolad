// Repository checks after conversion. Tests that already fail on the base commit are
// reported as pre-existing and do not block; only regressions block the PR.
import { run, tail } from "./util.mjs";

export const TESTS = [
  { name: "test:seo-topic-hub", cmd: "npm", args: ["run", "-s", "test:seo-topic-hub"] },
  { name: "test:articles-directory", cmd: "npm", args: ["run", "-s", "test:articles-directory"] },
  { name: "test:articles-directory-search", cmd: "npm", args: ["run", "-s", "test:articles-directory-search"] },
  { name: "test:geo-aeo-stage2a1", cmd: "npm", args: ["run", "-s", "test:geo-aeo-stage2a1"] },
  { name: "test:geo-aeo-stage2a2", cmd: "npm", args: ["run", "-s", "test:geo-aeo-stage2a2"] },
  { name: "test:seo-core-v1", cmd: "npm", args: ["run", "-s", "test:seo-core-v1"] },
  { name: "test:articles-evergreen-dates", cmd: "npm", args: ["run", "-s", "test:articles-evergreen-dates"] },
  { name: "geo-aeo-block2-unit", cmd: "npx", args: ["tsx", "scripts/geo-aeo-block2-unit.mjs"] },
  { name: "seo-operational-master-unit", cmd: "npx", args: ["tsx", "scripts/seo-operational-master-unit.mts"] },
];

export function runTests(repoDir) {
  return TESTS.map((test) => {
    const result = run(test.cmd, test.args, { cwd: repoDir, timeoutMs: 10 * 60 * 1000 });
    return { name: test.name, ok: result.status === 0, output: tail(`${result.stdout}\n${result.stderr}`, 15) };
  });
}

export function runChecks(repoDir, changedFiles, baseline) {
  const results = [];
  const env = { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" };
  const tsc = run("node", ["--max-old-space-size=4096", "node_modules/typescript/bin/tsc", "--noEmit"], {
    cwd: repoDir,
    env,
    timeoutMs: 20 * 60 * 1000,
  });
  results.push({ name: "tsc --noEmit", ok: tsc.status === 0, blocking: true, output: tail(tsc.stdout + tsc.stderr) });
  const lintable = changedFiles.filter((file) => /\.(?:ts|tsx|mjs|mts|js)$/.test(file));
  const eslint = run("node", ["node_modules/eslint/bin/eslint.js", ...lintable], { cwd: repoDir, env, timeoutMs: 10 * 60 * 1000 });
  results.push({ name: `eslint (${lintable.length} файлов)`, ok: eslint.status === 0, blocking: true, output: tail(eslint.stdout + eslint.stderr) });
  const baseByName = new Map((baseline ?? []).map((item) => [item.name, item]));
  for (const test of runTests(repoDir)) {
    const base = baseByName.get(test.name);
    const preExisting = !test.ok && base && !base.ok;
    results.push({ ...test, blocking: !preExisting, preExisting: Boolean(preExisting) });
  }
  const failed = results.filter((item) => !item.ok && item.blocking);
  return { ok: failed.length === 0, results };
}
