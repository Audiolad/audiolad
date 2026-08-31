#!/usr/bin/env node
/**
 * Destructive only to the explicitly allowlisted disposable Supabase stack.
 * The stack must contain Audiolad's schema immediately before the shared
 * asset migration; this harness creates legacy data, applies the migration,
 * then exercises HTTP and Storage contracts.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = "http://127.0.0.1:54321";
const BUCKET = "studio-draft-assets";
const PASSWORD = "StudioSharedAssets-2026!";
const migration = path.join(process.cwd(), "supabase/migrations/20260912120000_studio_shared_asset_sources_and_duplicate_project.sql");

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`missing_required_environment:${name}`);
  return value;
}
function assertSafety() {
  assert.equal(process.env.AUDIOLAD_TEST_DATABASE, "1", "AUDIOLAD_TEST_DATABASE=1 is required");
  assert.equal(process.env.AUDIOLAD_STUDIO_PERSISTENCE_ISOLATED, "1", "AUDIOLAD_STUDIO_PERSISTENCE_ISOLATED=1 is required");
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, URL, "only the isolated localhost Supabase URL is allowed");
  const stack = required("AUDIOLAD_STUDIO_TEST_STACK_DIR");
  assert(!/(^|\/)(var\/www|opt\/supabase)(\/|$)/.test(stack), "production stack paths are forbidden");
  assert(existsSync(path.join(stack, "docker-compose.yml")), "test stack docker-compose.yml is required");
  assert(existsSync(migration), "shared asset migration is required from this checkout");
  return stack;
}
function sql(stack: string, statement: string) {
  const result = spawnSync("docker", ["compose", "-f", path.join(stack, "docker-compose.yml"), "exec", "-T", "db", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: statement, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`isolated_sql_failed:${result.stderr}`);
  return result.stdout;
}
async function port() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address(); assert(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}
async function startNext() {
  const sandbox = await mkdtemp(path.join(tmpdir(), "audiolad-studio-shared-assets-"));
  for (const item of ["src", "public", "next.config.ts", "postcss.config.mjs", "tsconfig.json", "next-env.d.ts", "package.json"]) {
    await cp(path.join(process.cwd(), item), path.join(sandbox, item), { recursive: true });
  }
  await symlink(path.join(process.cwd(), "node_modules"), path.join(sandbox, "node_modules"));
  const value = `http://127.0.0.1:${await port()}`;
  const child = spawn(process.execPath, ["./node_modules/next/dist/bin/next", "dev", "--webpack", "--hostname", "127.0.0.1", "--port", value.split(":").at(-1)!], { cwd: sandbox, env: process.env, stdio: "inherit" });
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) throw new Error(`next_exited:${child.exitCode}`);
    try { if ((await fetch(`${value}/api/studio/projects`)).status < 500) return { child, sandbox, value }; } catch { /* retry */ }
    await delay(250);
  }
  throw new Error("next_not_ready");
}
async function stop(child: ChildProcess, sandbox: string) {
  if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.race([new Promise<void>((resolve) => child.once("exit", () => resolve())), delay(5_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  await rm(sandbox, { recursive: true, force: true });
}
function headers(token: string) { return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }; }
async function main() {
  const stack = assertSafety();
  const anon = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const service = createClient(URL, required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
  assert.equal(sql(stack, "SELECT to_regclass('public.studio_asset_sources') IS NULL;").trim(), "t", "stack must be pre-migration");
  const run = randomUUID();
  const user = await service.auth.admin.createUser({ email: `studio-shared-${run}@audiolad.test`, password: PASSWORD, email_confirm: true });
  assert.ifError(user.error); assert(user.data.user);
  const browser = createClient(URL, anon, { auth: { autoRefreshToken: false, persistSession: false } });
  const login = await browser.auth.signInWithPassword({ email: `studio-shared-${run}@audiolad.test`, password: PASSWORD });
  assert.ifError(login.error); const token = login.data.session!.access_token;
  const authorId = randomUUID(), projectId = randomUUID(), voiceId = randomUUID(), musicId = randomUUID();
  const data = { schemaVersion: 2, studioVersion: 1, editor: { currentTime: 0 }, slots: [{ id: "voice-slot", name: "Голос", audioTrackId: "voice", trackKind: "voice" }, { id: "music-slot", name: "Музыка", audioTrackId: "music", trackKind: "music" }], tracks: [
    { id: "voice", assetId: voiceId, name: "Voice", volume: 1, muted: false, trackKind: "voice", voicePreset: "none", clips: [{ id: "voice-clip", startTime: 0, offset: 0, duration: 1, fadeInDuration: 0, fadeOutDuration: 0 }] },
    { id: "music", assetId: musicId, name: "Music", volume: .5, muted: false, trackKind: "music", voicePreset: "none", clips: [{ id: "music-clip", startTime: 0, offset: 0, duration: 1, fadeInDuration: .1, fadeOutDuration: .1 }] },
  ]};
  const voicePath = `studio/${authorId}/${projectId}/${voiceId}/voice.wav`, musicPath = `studio/${authorId}/${projectId}/${musicId}/music.wav`;
  try {
    assert.ifError((await service.from("authors").insert({ id: authorId, name: `Shared ${run}`, slug: `shared-${run}`, access_status: "free" })).error);
    assert.ifError((await service.from("author_members").insert({ author_id: authorId, user_id: user.data.user.id, role: "owner" })).error);
    assert.ifError((await service.from("studio_projects").insert({ id: projectId, author_id: authorId, name: "Название", project_data: data, schema_version: 2, revision: 7, status: "active" })).error);
    for (const [id, storage_path] of [[voiceId, voicePath], [musicId, musicPath]] as const) {
      assert.ifError((await service.from("studio_project_assets").insert({ id, project_id: projectId, storage_path, original_name: path.basename(storage_path), mime_type: "audio/wav", size_bytes: 4, duration_seconds: 2, source_type: "upload" })).error);
      assert.ifError((await service.storage.from(BUCKET).upload(storage_path, new Uint8Array([1,2,3,4]), { contentType: "audio/wav" })).error);
    }
    sql(stack, readFileSync(migration, "utf8"));
    const refs = await service.from("studio_project_assets").select("id,source_id,storage_path").eq("project_id", projectId);
    assert.ifError(refs.error); assert.equal(refs.data?.length, 2); assert(refs.data?.every((row) => row.source_id === row.id));
    const integrity = sql(stack, "SELECT count(*) FROM studio_project_assets r LEFT JOIN studio_asset_sources s ON s.id=r.source_id WHERE s.id IS NULL OR r.source_id IS NULL;");
    assert.equal(integrity.trim(), "0");
    const next = await startNext();
    try {
      const duplicate = await fetch(`${next.value}/api/studio/projects/${projectId}/duplicate`, { method: "POST", headers: headers(token) });
      assert.equal(duplicate.status, 201); const duplicateId = (await duplicate.json()).project.id as string;
      const copied = await service.from("studio_project_assets").select("id,source_id,storage_path").eq("project_id", duplicateId);
      assert.ifError(copied.error); assert.equal(copied.data?.length, 2);
      assert.deepEqual(new Set(copied.data?.map((row) => row.source_id)), new Set(refs.data?.map((row) => row.source_id)));
      assert.notDeepEqual(new Set(copied.data?.map((row) => row.id)), new Set(refs.data?.map((row) => row.id)));
      const sourceCount = await service.from("studio_asset_sources").select("*", { count: "exact", head: true });
      assert.equal(sourceCount.count, 2, "duplicate must not create physical sources");
      const b = await fetch(`${next.value}/api/studio/projects/${duplicateId}`, { headers: headers(token) });
      assert.equal(b.status, 200);
      const bData = (await b.json()).project;
      const autosave = await fetch(`${next.value}/api/studio/projects/${duplicateId}`, { method: "PUT", headers: headers(token), body: JSON.stringify({ expectedRevision: bData.revision, name: bData.name, projectData: bData.projectData }) });
      assert.equal(autosave.status, 200);
      const a = await fetch(`${next.value}/api/studio/projects/${projectId}`, { headers: headers(token) }); const aData = (await a.json()).project;
      assert.equal((await fetch(`${next.value}/api/studio/projects/${projectId}?expectedRevision=${aData.revision}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })).status, 204);
      const asset = copied.data![0]!;
      assert(!((await service.storage.from(BUCKET).download(asset.storage_path)).error), "shared object must survive original delete");
      console.log(JSON.stringify({ run, duplicateId, sharedSources: 2, integrity: "ok" }));
    } finally { await stop(next.child, next.sandbox); }
  } finally {
    // VM is disposable; cleanup fixtures best-effort. The migration itself persists until stack reset.
    await service.auth.admin.deleteUser(user.data.user.id);
  }
}
main().catch((error) => { console.error("studio-shared-assets-isolated:", error); process.exitCode = 1; });
