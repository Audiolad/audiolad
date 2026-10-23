// Local checks of sergey-zoya-site (its GitHub Actions are billing-blocked, so the PR body carries
// these results). `npm test` is split into its individual `node scripts/…` steps and each step is
// compared with the clean-main baseline: only steps that were green on main and fail after the
// pack are blocking; pre-existing failures are reported as non-blocking.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { run, tail } from "../../util.mjs";

export function testSteps(repoDir) {
  const script = JSON.parse(readFileSync(join(repoDir, "package.json"), "utf8")).scripts?.test ?? "";
  return script.split("&&").map((part) => part.trim()).filter(Boolean);
}

const STEP_TIMEOUT_MS = 10 * 60 * 1000;

function exec(repoDir, command, { log = () => {}, timeoutMs = STEP_TIMEOUT_MS } = {}) {
  const [bin, ...rest] = command.split(/\s+/);
  const started = Date.now();
  const result = run(bin, rest, { cwd: repoDir, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", CI: "1" }, timeoutMs });
  const seconds = Math.round((Date.now() - started) / 1000);
  const timedOut = result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM";
  log(`  ${result.status === 0 ? "ok" : timedOut ? "TIMEOUT" : "FAIL"} ${seconds}s ${command}`);
  const output = `${timedOut ? `[таймаут ${Math.round(timeoutMs / 1000)} с]\n` : ""}${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { command, ok: result.status === 0, status: result.status, seconds, output: tail(output, 12) };
}

/** Runs npm-test steps, tsc and (optionally) next build. */
export function runSzChecks(repoDir, { build = true, extraSteps = [], log, timeoutMs } = {}) {
  const options = { log, timeoutMs };
  const steps = [...new Set([...testSteps(repoDir), ...extraSteps])].map((command) => exec(repoDir, command, options));
  const tsc = exec(repoDir, "npx tsc --noEmit", options);
  const next = build ? exec(repoDir, "npx next build", options) : null;
  return { steps, tsc, build: next };
}

/** Blocking = green on baseline and red after (or new step red). */
export function compareSzChecks(baseline, after) {
  const before = new Map(baseline.steps.map((step) => [step.command, step]));
  const blocking = [];
  const preexisting = [];
  for (const step of after.steps) {
    if (step.ok) continue;
    const was = before.get(step.command);
    if (was && !was.ok) preexisting.push(step);
    else blocking.push(step);
  }
  for (const key of ["tsc", "build"]) {
    const now = after[key];
    if (!now || now.ok) continue;
    if (baseline[key] && !baseline[key].ok) preexisting.push(now);
    else blocking.push(now);
  }
  return { ok: blocking.length === 0, blocking, preexisting };
}

export function checksMarkdown(after, verdict) {
  const passed = after.steps.filter((step) => step.ok).length;
  const lines = [
    `- npm test: ${passed}/${after.steps.length} шагов зелёные`,
    `- tsc --noEmit: ${after.tsc.ok ? "ok" : "ошибка"}`,
    `- next build: ${after.build ? (after.build.ok ? "ok" : "ошибка") : "пропущен (--skip-build)"}`,
  ];
  for (const step of verdict.blocking) lines.push(`- ✗ блокирует: \`${step.command}\`\n\n\`\`\`\n${step.output}\n\`\`\``);
  for (const step of verdict.preexisting) lines.push(`- ⚠ падало и на чистом main (не блокирует): \`${step.command}\``);
  return lines.join("\n");
}
