// Shared helpers for the Райтер article pipeline (no secrets handled here).
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const EM_DASH = "\u2014";
export const EN_DASH = "\u2013";

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** Moscow time label, e.g. "2026-10-23 18:40 MSK". */
export function mskNow(date = new Date()) {
  const msk = new Date(date.getTime() + 3 * 3600 * 1000);
  return `${msk.toISOString().slice(0, 16).replace("T", " ")} MSK`;
}

export function mskDate(date = new Date()) {
  return new Date(date.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * Run a command without a shell. stdin is always empty (equivalent of </dev/null).
 * Returns { status, stdout, stderr }.
 */
export function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    input: options.input ?? "",
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeoutMs ?? 30 * 60 * 1000,
  });
  return {
    status: result.status ?? (result.error ? 127 : 1),
    stdout: result.stdout ?? "",
    stderr: (result.stderr ?? "") + (result.error ? String(result.error.message) : ""),
  };
}

export function mustRun(cmd, args, options = {}) {
  const result = run(cmd, args, options);
  if (result.status !== 0) {
    const tail = `${result.stdout}\n${result.stderr}`.trim().split("\n").slice(-20).join("\n");
    throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} … завершился с кодом ${result.status}\n${tail}`);
  }
  return result.stdout;
}

export function tail(text, lines = 25) {
  return String(text).trim().split("\n").slice(-lines).join("\n");
}

export function log(message) {
  process.stdout.write(`[writer ${mskNow().slice(11)}] ${message}\n`);
}
