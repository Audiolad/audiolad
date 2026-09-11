import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  formatStudioRenderWorkerEnvLog,
  redactStudioRenderWorkerSecrets,
  requireStudioRenderWorkerEnv,
  STUDIO_RENDER_WORKER_ENV_MISSING,
} from "../src/lib/studio/render/worker-env";

const SECRET_URL = "https://env-bootstrap-test.example.invalid";
const SECRET_KEY = "super-secret-service-role-key-do-not-log";

function readRepo(relPath: string): string {
  return readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
}

function snapshotEnv(keys: string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(snapshot)) {
    setEnv(key, value);
  }
}

function captureConsole(run: () => void): string[] {
  const lines: string[] = [];
  const push = (...args: unknown[]) => {
    lines.push(args.map((arg) => (typeof arg === "string" ? arg : String(arg))).join(" "));
  };
  const original = {
    log: console.log,
    info: console.info,
    error: console.error,
    warn: console.warn,
  };
  console.log = push;
  console.info = push;
  console.error = push;
  console.warn = push;
  try {
    run();
  } finally {
    console.log = original.log;
    console.info = original.info;
    console.error = original.error;
    console.warn = original.warn;
  }
  return lines;
}

function assertNoSecrets(text: string) {
  assert.doesNotMatch(text, new RegExp(SECRET_KEY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(text, new RegExp(SECRET_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

function testCleanPm2StartLoadsAuthoritativeEnv() {
  const dir = mkdtempSync(join(tmpdir(), "audiolad-render-worker-env-"));
  const envKeys = [
    "NODE_ENV",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "__NEXT_PROCESSED_ENV",
  ];
  const previous = snapshotEnv(envKeys);
  writeFileSync(
    join(dir, ".env.production"),
    [
      `NEXT_PUBLIC_SUPABASE_URL=${SECRET_URL}`,
      `SUPABASE_SERVICE_ROLE_KEY=${SECRET_KEY}`,
      "",
    ].join("\n"),
  );
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    setEnv("NODE_ENV", "production");

    const logs = captureConsole(() => {
      const presence = requireStudioRenderWorkerEnv({ dir, forceReload: true });
      console.log(formatStudioRenderWorkerEnvLog("studio_render_env_ready", presence));
    });

    assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, SECRET_URL);
    assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, SECRET_KEY);
    assert.equal(logs.some((line) => line.includes("studio_render_env_ready")), true);
    assert.equal(logs.some((line) => line.includes('"hasNextPublicSupabaseUrl":true')), true);
    assert.equal(logs.some((line) => line.includes('"hasSupabaseServiceRoleKey":true')), true);
    for (const line of logs) {
      assertNoSecrets(line);
    }
  } finally {
    restoreEnv(previous);
    rmSync(dir, { recursive: true, force: true });
  }
}

function testMissingEnvFileFailsClosedWithoutSecrets() {
  const dir = mkdtempSync(join(tmpdir(), "audiolad-render-worker-env-missing-"));
  const previous = snapshotEnv([
    "NODE_ENV",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "__NEXT_PROCESSED_ENV",
  ]);
  try {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    setEnv("NODE_ENV", "production");
    const logs = captureConsole(() => {
      assert.throws(
        () => requireStudioRenderWorkerEnv({ dir, forceReload: true }),
        (error: unknown) => error instanceof Error && error.message === STUDIO_RENDER_WORKER_ENV_MISSING,
      );
    });
    for (const line of logs) {
      assertNoSecrets(line);
    }
  } finally {
    restoreEnv(previous);
    rmSync(dir, { recursive: true, force: true });
  }
}

function testLogsCannotDumpSecretValues() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: SECRET_URL,
    SUPABASE_SERVICE_ROLE_KEY: SECRET_KEY,
  };
  const ready = formatStudioRenderWorkerEnvLog("studio_render_env_ready", {
    NEXT_PUBLIC_SUPABASE_URL: true,
    SUPABASE_SERVICE_ROLE_KEY: true,
  });
  assertNoSecrets(ready);
  assert.match(ready, /"hasNextPublicSupabaseUrl":true/);
  assert.match(ready, /"hasSupabaseServiceRoleKey":true/);

  const leaked = `failed url=${SECRET_URL} key=${SECRET_KEY}`;
  const redacted = redactStudioRenderWorkerSecrets(leaked, env);
  assertNoSecrets(redacted);
  assert.match(redacted, /\[redacted:NEXT_PUBLIC_SUPABASE_URL\]/);
  assert.match(redacted, /\[redacted:SUPABASE_SERVICE_ROLE_KEY\]/);
}

function testPm2CleanStartContract() {
  const config = readRepo("deploy/studio-render-worker.ecosystem.config.cjs");
  const runner = readRepo("scripts/run-studio-render-worker.mts");
  const helper = readRepo("src/lib/studio/render/worker-env.ts");

  assert.doesNotMatch(config, /cron_restart/);
  assert.match(config, /autorestart:\s*true/);
  assert.match(config, /NODE_ENV:\s*"production"/);
  assert.doesNotMatch(config, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(config, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(config, /@next\/env/);
  assert.match(config, /\.env\.production/);
  assert.match(config, /self-refresh/);
  assert.match(config, /OPS_STUDIO_WORKER_RECOVER/);
  assert.doesNotMatch(config, /pm2 restart audiolad-studio-render-worker --update-env/);

  assert.match(helper, /loadEnvConfig/);
  assert.match(helper, /from "@next\/env"/);
  assert.match(helper, /silentNextEnvLog/);
  assert.doesNotMatch(helper, /console\.log\(.*process\.env/);
  assert.doesNotMatch(helper, /JSON\.stringify\(process\.env/);

  assert.match(runner, /requireStudioRenderWorkerEnv/);
  assert.match(runner, /redactStudioRenderWorkerSecrets/);
  assert.match(runner, /studio_render_env_ready/);
  assert.match(runner, /studio_render_worker_boot/);
  assert.match(runner, /captureStudioRenderBootRelease/);
  assert.match(runner, /checkRelease/);
  assert.doesNotMatch(runner, /console\.(log|error)\([^)]*process\.env/);
}

function main() {
  testCleanPm2StartLoadsAuthoritativeEnv();
  testMissingEnvFileFailsClosedWithoutSecrets();
  testLogsCannotDumpSecretValues();
  testPm2CleanStartContract();
  console.log("studio-render-worker-env-unit: PASS");
}

main();
