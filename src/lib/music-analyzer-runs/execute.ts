import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collectAnalyzerDocuments, parseAnalyzerJsonFiles } from "./analyze-output";
import {
  MUSIC_ANALYZER_ANALYZE_TIMEOUT_MS,
  MUSIC_ANALYZER_CHECKPOINT_FILENAME,
  MUSIC_ANALYZER_VERSION_FALLBACK,
} from "./constants";
import { audioLooksLikeWav, sha256Hex } from "./policy";
import {
  analyzerChildEnv,
  buildAnalyzeTrackArgs,
  buildAnalyzerProvenance,
  verifyAnalyzerCheckout,
  type CommandRunner,
} from "./python-plan";
import type { MusicAnalyzerExecuteResult } from "./worker";

export class MusicAnalyzerRunError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MusicAnalyzerRunError";
  }
}

export class MusicAnalyzerAbortedError extends Error {
  constructor() {
    super("aborted");
    this.name = "MusicAnalyzerAbortedError";
  }
}

type SpawnResult = { code: number; stdout: string; stderr: string };

const checkpointHashCache = new Map<string, string>();

function asRunError(error: unknown): MusicAnalyzerRunError {
  if (error instanceof MusicAnalyzerRunError) return error;
  if (error instanceof Error && error.message.startsWith("analyzer_")) {
    return new MusicAnalyzerRunError(error.message);
  }
  return new MusicAnalyzerRunError("analyze_failed");
}

export function spawnCaptured(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new MusicAnalyzerAbortedError());
      return;
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const take = (chunk: Buffer, into: "stdout" | "stderr") => {
      const next = (into === "stdout" ? stdout : stderr) + chunk.toString("utf8");
      const clipped = next.slice(-65_536);
      if (into === "stdout") stdout = clipped;
      else stderr = clipped;
    };
    child.stdout?.on("data", (chunk: Buffer) => take(chunk, "stdout"));
    child.stderr?.on("data", (chunk: Buffer) => take(chunk, "stderr"));
    const timer = options.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGTERM");
        }, options.timeoutMs)
      : null;
    const onAbort = () => child.kill("SIGTERM");
    options.signal?.addEventListener("abort", onAbort);
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new MusicAnalyzerRunError("analyzer_runtime_missing"));
        return;
      }
      reject(new MusicAnalyzerRunError("analyze_failed"));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (options.signal?.aborted) {
        reject(new MusicAnalyzerAbortedError());
        return;
      }
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function hashFile(path: string): Promise<string> {
  const info = await stat(path);
  const cacheKey = `${path}:${info.mtimeMs}:${info.size}`;
  const cached = checkpointHashCache.get(cacheKey);
  if (cached) return cached;
  const hash = createHash("sha256");
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  const digest = hash.digest("hex");
  checkpointHashCache.set(cacheKey, digest);
  return digest;
}

async function readJsonDir(dir: string): Promise<Record<string, unknown>> {
  const names = await readdir(dir);
  const files = await Promise.all(names.filter((name) => name.toLowerCase().endsWith(".json")).map(async (name) => ({
    name,
    text: await readFile(join(dir, name), "utf8"),
  })));
  return parseAnalyzerJsonFiles(files);
}

export async function executePinnedAnalysis(input: {
  bytes: Uint8Array;
  filename: string;
  expectedSha256: string;
  root: string;
  pythonPath: string;
  checkpointPath: string;
  signal?: AbortSignal;
  runCommand?: CommandRunner;
}): Promise<MusicAnalyzerExecuteResult> {
  const signal = input.signal ?? new AbortController().signal;
  if (signal.aborted) throw new MusicAnalyzerAbortedError();
  const actualSha = sha256Hex(input.bytes);
  if (actualSha !== input.expectedSha256) {
    throw new MusicAnalyzerRunError("source_sha_mismatch");
  }
  const runner = input.runCommand ?? (async (command, args, options) => {
    try {
      return await spawnCaptured(command, args, { cwd: options.cwd, signal, timeoutMs: 15_000 });
    } catch (error) {
      if (error instanceof MusicAnalyzerAbortedError) throw error;
      throw new MusicAnalyzerRunError("analyzer_runtime_missing");
    }
  });

  let checkout: { head: string; content: string };
  try {
    checkout = await verifyAnalyzerCheckout(input.root, runner);
  } catch (error) {
    if (error instanceof MusicAnalyzerAbortedError) throw error;
    throw asRunError(error);
  }

  let checkpointSha256: string;
  try {
    await stat(input.checkpointPath);
    checkpointSha256 = await hashFile(input.checkpointPath);
  } catch (error) {
    if (error instanceof MusicAnalyzerAbortedError) throw error;
    throw new MusicAnalyzerRunError("checkpoint_missing");
  }
  try {
    await stat(join(input.root, "analyze_track.py"));
    await stat(input.pythonPath);
  } catch {
    throw new MusicAnalyzerRunError("analyzer_runtime_missing");
  }

  const workspace = join(tmpdir(), `audiolad-music-analyzer-${actualSha.slice(0, 12)}-${Date.now()}`);
  await mkdir(workspace, { recursive: true });
  try {
    const sourcePath = join(workspace, "source.bin");
    await writeFile(sourcePath, input.bytes);
    let wavPath = sourcePath;
    if (!audioLooksLikeWav(input.bytes)) {
      wavPath = join(workspace, "input.wav");
      const converted = await spawnCaptured(
        "ffmpeg",
        ["-y", "-i", sourcePath, "-acodec", "pcm_s16le", "-ar", "44100", wavPath],
        { signal, timeoutMs: 120_000 },
      );
      if (converted.code !== 0) throw new MusicAnalyzerRunError("wav_convert_failed");
    }
    const outputDir = join(workspace, "out");
    await mkdir(outputDir, { recursive: true });
    const analyzed = await spawnCaptured(
      input.pythonPath,
      buildAnalyzeTrackArgs(wavPath, outputDir),
      {
        cwd: input.root,
        env: analyzerChildEnv(process.env, input.pythonPath),
        signal,
        timeoutMs: MUSIC_ANALYZER_ANALYZE_TIMEOUT_MS,
      },
    );
    if (analyzed.code !== 0) throw new MusicAnalyzerRunError("analyze_failed");
    let files: Record<string, unknown>;
    try {
      files = await readJsonDir(outputDir);
    } catch (error) {
      const stdout = analyzed.stdout.trim();
      if (stdout.startsWith("{") && stdout.endsWith("}")) {
        files = parseAnalyzerJsonFiles([{ name: "stdout.json", text: stdout }]);
      } else {
        throw asRunError(error);
      }
    }
    const collected = collectAnalyzerDocuments(files);
    return {
      analyzerVersion: collected.hints.analyzerVersion ?? MUSIC_ANALYZER_VERSION_FALLBACK,
      analyzerGitCommit: checkout.head,
      analyzerContentCommit: checkout.content,
      modelCheckpoint: MUSIC_ANALYZER_CHECKPOINT_FILENAME,
      taxonomyVersion: collected.hints.taxonomyVersion,
      promptVersion: collected.hints.promptVersion,
      device: "cpu",
      rawJson: collected.raw,
      normalizedJson: collected.normalized,
      provenance: buildAnalyzerProvenance({
        head: checkout.head,
        content: checkout.content,
        checkpointFilename: MUSIC_ANALYZER_CHECKPOINT_FILENAME,
        checkpointSha256,
        normalizedSource: collected.normalizedSource,
        outputFiles: collected.outputFiles,
        pythonPath: input.pythonPath,
      }),
    };
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
