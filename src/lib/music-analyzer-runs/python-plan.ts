import {
  MUSIC_ANALYZER_ACCEPTED_HEAD_PREFIXES,
  MUSIC_ANALYZER_CONTENT_COMMIT,
  MUSIC_ANALYZER_DEVICE,
  MUSIC_ANALYZER_FREEZE_BRANCH,
  MUSIC_ANALYZER_FREEZE_SNAPSHOT,
  MUSIC_ANALYZER_INSTRUMENT_STRATEGY,
  MUSIC_ANALYZER_SCRIPT,
  MUSIC_ANALYZER_VENV_DIR,
  MUSIC_ANALYZER_VOICE_THREADS,
  MUSIC_ANALYZER_VOICE_TIMEOUT_SECONDS,
} from "./constants";
import type { VoiceDetectorFlag } from "./voice-plan";

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type CommandRunner = (
  command: string,
  args: string[],
  options: { cwd?: string },
) => Promise<CommandResult>;

const CHILD_ENV_ALLOW = new Set([
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TMPDIR",
  "TEMP",
  "TMP",
  "USER",
  "LOGNAME",
  // Explicit local CPU detector paths; model inference stays offline.
  "MUSIC_ANALYZER_VOICE_PYTHON",
  "MUSIC_ANALYZER_PANNS_CHECKPOINT",
]);

export function buildAnalyzeTrackArgs(
  wavPath: string,
  outputDir: string,
  voiceDetector: VoiceDetectorFlag = "legacy",
): string[] {
  return [
    MUSIC_ANALYZER_SCRIPT,
    wavPath,
    "--output-dir",
    outputDir,
    "--device",
    MUSIC_ANALYZER_DEVICE,
    "--voice-detector",
    voiceDetector,
  ];
}

export function analyzerChildEnv(
  source: NodeJS.ProcessEnv,
  pythonPath: string,
  checkpointDir?: string,
  options?: { voiceThreads?: boolean },
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: source.NODE_ENV ?? "production",
    PYTHONNOUSERSITE: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
  };
  for (const key of CHILD_ENV_ALLOW) {
    const value = source[key];
    if (typeof value === "string" && value) env[key] = value;
  }
  const venv = pythonPath.slice(0, pythonPath.lastIndexOf("/bin/python"));
  if (venv) env.VIRTUAL_ENV = venv;
  if (checkpointDir) env.MUSIC_ANALYZER_CHECKPOINT_DIR = checkpointDir;
  if (options?.voiceThreads) {
    const threads = String(MUSIC_ANALYZER_VOICE_THREADS);
    env.MUSIC_ANALYZER_VOICE_TIMEOUT_SECONDS = String(MUSIC_ANALYZER_VOICE_TIMEOUT_SECONDS);
    env.OMP_NUM_THREADS = threads;
    env.MKL_NUM_THREADS = threads;
    env.OPENBLAS_NUM_THREADS = threads;
    env.NUMEXPR_NUM_THREADS = threads;
  }
  for (const key of Object.keys(env)) {
    if (/candidate[_-]?a/i.test(key) || /instrument[_-]?strateg/i.test(key)) {
      delete env[key];
    }
  }
  return env;
}

export function assertFrozenHead(head: string): string {
  const trimmed = head.trim();
  const known = MUSIC_ANALYZER_ACCEPTED_HEAD_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
  if (!known || !/^[0-9a-f]{7,40}$/.test(trimmed)) {
    throw new Error("analyzer_commit_mismatch");
  }
  return trimmed;
}

export function assertContentCommit(commit: string): string {
  const trimmed = commit.trim();
  if (!trimmed.startsWith(MUSIC_ANALYZER_CONTENT_COMMIT) || !/^[0-9a-f]{7,40}$/.test(trimmed)) {
    throw new Error("analyzer_content_missing");
  }
  return trimmed;
}

export async function verifyAnalyzerCheckout(
  root: string,
  run: CommandRunner,
): Promise<{ head: string; content: string }> {
  const headResult = await run("git", ["rev-parse", "HEAD"], { cwd: root });
  if (headResult.code !== 0) throw new Error("analyzer_runtime_missing");
  const head = assertFrozenHead(headResult.stdout);
  const contentResult = await run("git", ["rev-parse", `${MUSIC_ANALYZER_CONTENT_COMMIT}^{commit}`], { cwd: root });
  if (contentResult.code !== 0) throw new Error("analyzer_content_missing");
  const content = assertContentCommit(contentResult.stdout);
  const ancestor = await run("git", ["merge-base", "--is-ancestor", content, head], { cwd: root });
  if (ancestor.code !== 0) throw new Error("analyzer_content_not_ancestor");
  return { head, content };
}

export function buildAnalyzerProvenance(input: {
  head: string;
  content: string;
  checkpointFilename: string;
  checkpointSha256: string;
  normalizedSource: string;
  outputFiles: string[];
  pythonPath: string;
  voiceDetector?: VoiceDetectorFlag;
}): Record<string, unknown> {
  return {
    runtime: "timeweb-vps-pm2",
    host_role: "audiolad-app-vps",
    freeze_branch: MUSIC_ANALYZER_FREEZE_BRANCH,
    freeze_snapshot: MUSIC_ANALYZER_FREEZE_SNAPSHOT,
    analyzer_git_commit: input.head,
    analyzer_content_commit: input.content,
    invoke: [
      `${MUSIC_ANALYZER_VENV_DIR}/bin/python`,
      ...buildAnalyzeTrackArgs("<wav>", "<dir>", input.voiceDetector ?? "legacy"),
    ],
    python: input.pythonPath.endsWith(`/${MUSIC_ANALYZER_VENV_DIR}/bin/python`)
      ? `${MUSIC_ANALYZER_VENV_DIR}/bin/python`
      : "python",
    device: MUSIC_ANALYZER_DEVICE,
    checkpoint_filename: input.checkpointFilename,
    checkpoint_sha256: input.checkpointSha256,
    instrument_strategy: MUSIC_ANALYZER_INSTRUMENT_STRATEGY,
    candidate_a: false,
    normalized_source: input.normalizedSource,
    output_files: input.outputFiles,
  };
}
