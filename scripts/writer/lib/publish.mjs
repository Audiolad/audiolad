// Publisher: secret scan, commit, push a new branch and open a DRAFT pull request.
// It never merges, never force-pushes and never deploys.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { mustRun, run, tail } from "./util.mjs";

const REPO = process.env.WRITER_GITHUB_REPO ?? "Audiolad/audiolad";
const GIT_IDENTITY = [
  "-c", `user.name=${process.env.WRITER_GIT_NAME ?? "Audiolad"}`,
  "-c", `user.email=${process.env.WRITER_GIT_EMAIL ?? "Audiolad@users.noreply.github.com"}`,
];

const SECRET_PATTERNS = [
  /CLOUDRU_FM_API_KEY\s*=\s*\S/,
  /Bearer\s+[A-Za-z0-9._~+/=-]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9]{20,}/,
];

export function commit(repoDir, files, message) {
  mustRun("git", ["add", "--", ...files], { cwd: repoDir });
  mustRun("git", [...GIT_IDENTITY, "commit", "-q", "-m", message], { cwd: repoDir });
  return mustRun("git", ["rev-parse", "HEAD"], { cwd: repoDir }).trim();
}

/** gitleaks over the new commits plus a pattern scan of the diff. */
export function secretScan(repoDir, baseRef, { gitleaksConfig } = {}) {
  const findings = [];
  const diff = mustRun("git", ["diff", `${baseRef}..HEAD`], { cwd: repoDir });
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(diff)) findings.push(`шаблон ${pattern.source.slice(0, 20)}…`);
  }
  const reportPath = join(mkdtempSync(join(tmpdir(), "writer-gitleaks-")), "report.json");
  const gitleaks = run("gitleaks", ["git", "--no-banner", "--redact", ...(gitleaksConfig ? ["--config", gitleaksConfig] : []), `--log-opts=${baseRef}..HEAD`, "--exit-code", "1", "--report-format", "json", "--report-path", reportPath, "."], {
    cwd: repoDir,
  });
  if (gitleaks.status === 127) findings.push("gitleaks не установлен");
  else if (gitleaks.status !== 0) {
    // Only rule id, file and line (the report is redacted) – never the matched value.
    let where = "";
    try {
      where = JSON.parse(readFileSync(reportPath, "utf8")).map((leak) => `${leak.RuleID} ${leak.File}:${leak.StartLine}`).join(", ");
    } catch {
      where = tail(gitleaks.stdout + gitleaks.stderr, 5);
    }
    findings.push(`gitleaks: ${where}`);
  }
  return { ok: findings.length === 0, findings, tool: gitleaks.status === 127 ? null : "gitleaks" };
}

export function ensureLabel(label, repo = REPO) {
  const list = run("gh", ["label", "list", "-R", repo, "--search", label, "--json", "name", "--limit", "100"]);
  if (list.status === 0 && JSON.parse(list.stdout || "[]").some((item) => item.name === label)) return;
  mustRun("gh", ["label", "create", label, "-R", repo, "--color", "5319e7", "--description", "Черновик статьи, сгенерированный Райтером"]);
}

export function pushAndOpenDraft(repoDir, { branch, title, body, label, outDir, repo = REPO }) {
  const remote = run("git", ["ls-remote", "--heads", "origin", branch], { cwd: repoDir });
  if (remote.stdout.trim()) throw new Error(`ветка ${branch} уже существует на GitHub – выберите другой slug или закройте старую`);
  mustRun("git", ["push", "origin", `HEAD:refs/heads/${branch}`], { cwd: repoDir });
  ensureLabel(label, repo);
  const bodyPath = join(outDir, "pr-body.md");
  writeFileSync(bodyPath, body);
  const url = mustRun("gh", [
    "pr", "create", "-R", repo, "--draft", "--base", "main", "--head", branch,
    "--title", title, "--body-file", bodyPath, "--label", label,
  ], { cwd: repoDir }).trim();
  return url.split("\n").pop();
}
