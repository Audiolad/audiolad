#!/usr/bin/env node
/**
 * Destructive only to the explicitly allowlisted disposable Supabase stack.
 * The stack must contain Audiolad's schema immediately before the shared
 * asset migration; this harness creates legacy data, applies the migration,
 * then exercises HTTP and Storage contracts.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
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
  assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, URL, "NEXT_PUBLIC_SUPABASE_URL must be exactly http://127.0.0.1:54321");
  const stack = required("AUDIOLAD_STUDIO_TEST_STACK_DIR");
  assert(!/(^|\/)(var\/www|opt\/supabase)(\/|$)/.test(stack), "production stack paths are forbidden");
  assert(existsSync(path.join(stack, "docker-compose.yml")), "test stack docker-compose.yml is required");
  assert(existsSync(migration), "shared asset migration is required from this checkout");
  return stack;
}
function sqlLiteral(value: string) { return `'${value.replaceAll("'", "''")}'`; }
function guestHeaders(token: string) {
  return { Cookie: `audiolad_studio_guest=${token}`, "Content-Type": "application/json" };
}
async function mustNotExist(service: SupabaseClient, bucket: string, storagePath: string, message: string) {
  const { data, error } = await service.storage.from(bucket).download(storagePath);
  assert(error || !data, message);
}
async function assertSources(
  service: SupabaseClient, projectId: string, expected: number,
) {
  const refs = await service.from("studio_project_assets")
    .select("id,source_id,storage_path,deleted_at").eq("project_id", projectId);
  assert.ifError(refs.error);
  assert.equal(refs.data?.filter((row) => !row.deleted_at).length, expected);
  assert(refs.data?.every((row) => row.source_id), "all references have a source_id");
  return refs.data ?? [];
}
function sql(stack: string, statement: string) {
  const password = readFileSync(path.join(stack, ".env"), "utf8")
    .match(/^POSTGRES_PASSWORD=(.+)$/m)?.[1]?.trim();
  if (!password) throw new Error("isolated_sql_missing_postgres_password");
  const result = spawnSync("docker", [
    "compose", "-f", path.join(stack, "docker-compose.yml"), "exec", "-T",
    "-e", `PGPASSWORD=${password}`, "db", "psql", "-U", "supabase_admin",
    "-d", "postgres", "-tA", "-v", "ON_ERROR_STOP=1",
  ], { input: statement, encoding: "utf8" });
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
  for (const item of ["src", "public", "next.config.ts", "postcss.config.mjs", "tsconfig.json", "package.json"]) {
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
function wavFile(label: string) {
  const bytes = new Uint8Array(44 + 8_000);
  const view = new DataView(bytes.buffer);
  bytes.set([82, 73, 70, 70], 0); view.setUint32(4, bytes.length - 8, true);
  bytes.set([87, 65, 86, 69, 102, 109, 116, 32], 8); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8_000, true);
  view.setUint32(28, 8_000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  bytes.set([100, 97, 116, 97], 36); view.setUint32(40, bytes.length - 44, true);
  return new File([bytes], `${label}.wav`, { type: "audio/wav" });
}
function replacementForm(label: string) {
  const form = new FormData(); form.append("file", wavFile(label)); return form;
}
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
    sql(stack, `INSERT INTO public.authors (id,name,slug,access_status) VALUES (${sqlLiteral(authorId)}::uuid,${sqlLiteral(`Shared ${run}`)},${sqlLiteral(`shared-${run}`)},'free'); INSERT INTO public.author_members (author_id,user_id,role) VALUES (${sqlLiteral(authorId)}::uuid,${sqlLiteral(user.data.user.id)}::uuid,'owner'); INSERT INTO public.studio_projects (id,author_id,name,project_data,schema_version,revision,status) VALUES (${sqlLiteral(projectId)}::uuid,${sqlLiteral(authorId)}::uuid,'Название',${sqlLiteral(JSON.stringify(data))}::jsonb,2,7,'active');`);
    for (const [id, storage_path] of [[voiceId, voicePath], [musicId, musicPath]] as const) {
      sql(stack, `INSERT INTO public.studio_project_assets (id,project_id,storage_path,original_name,mime_type,size_bytes,duration_seconds,source_type) VALUES (${sqlLiteral(id)}::uuid,${sqlLiteral(projectId)}::uuid,${sqlLiteral(storage_path)},${sqlLiteral(path.basename(storage_path))},'audio/wav',4,2,'upload');`);
      assert.ifError((await service.storage.from(BUCKET).upload(storage_path, new Uint8Array([1,2,3,4]), { contentType: "audio/wav" })).error);
    }
    sql(stack, readFileSync(migration, "utf8"));
    const refs = await service.from("studio_project_assets").select("id,source_id,storage_path").eq("project_id", projectId);
    assert.ifError(refs.error); assert.equal(refs.data?.length, 2); assert(refs.data?.every((row) => row.source_id === row.id));
    const integrity = sql(stack, "SELECT count(*) FROM studio_project_assets r LEFT JOIN studio_asset_sources s ON s.id=r.source_id WHERE s.id IS NULL OR r.source_id IS NULL;");
    assert.equal(integrity.trim(), "0");
    const next = await startNext();
    try {
      // Guest ownership is isolated by its opaque cookie-backed session. Three
      // creates are allowed; the fourth (and a duplicate at the limit) is not.
      const guestSessionId = randomUUID();
      const guestToken = randomBytes(32).toString("base64url");
      sql(stack, `INSERT INTO public.studio_guest_sessions (id, token_hash, created_at, last_seen_at, expires_at) VALUES (${sqlLiteral(guestSessionId)}::uuid, ${sqlLiteral(createHash("sha256").update(guestToken).digest("hex"))}, now(), now(), now() + interval '1 day');`);
      const guestProjects: Array<{ id: string; revision: number }> = [];
      for (let index = 1; index <= 3; index += 1) {
        const response = await fetch(`${next.value}/api/studio/projects`, {
          method: "POST", headers: guestHeaders(guestToken), body: JSON.stringify({ name: `Guest ${run} ${index}` }),
        });
        assert.equal(response.status, 201, `guest project ${index} is created`);
        guestProjects.push((await response.json()).project);
      }
      const guestFourth = await fetch(`${next.value}/api/studio/projects`, {
        method: "POST", headers: guestHeaders(guestToken), body: JSON.stringify({ name: "Guest overflow" }),
      });
      assert.equal(guestFourth.status, 403, "guest has a strict three-project limit");
      const guestDuplicate = await fetch(`${next.value}/api/studio/projects/${guestProjects[0]!.id}/duplicate`, {
        method: "POST", headers: { Cookie: `audiolad_studio_guest=${guestToken}` },
      });
      assert.equal(guestDuplicate.status, 403, "guest duplicate observes the same project limit");
      // A: duplicate over the actual HTTP contract preserves sources but remaps
      // every project-local identity. It starts at its own revision.
      const duplicate = await fetch(`${next.value}/api/studio/projects/${projectId}/duplicate`, { method: "POST", headers: headers(token) });
      assert.equal(duplicate.status, 201); const duplicateId = (await duplicate.json()).project.id as string;
      const copied = await service.from("studio_project_assets").select("id,source_id,storage_path").eq("project_id", duplicateId);
      assert.ifError(copied.error); assert.equal(copied.data?.length, 2);
      assert.deepEqual(new Set(copied.data?.map((row) => row.source_id)), new Set(refs.data?.map((row) => row.source_id)));
      assert.notDeepEqual(new Set(copied.data?.map((row) => row.id)), new Set(refs.data?.map((row) => row.id)));
      const duplicateRow = await service.from("studio_projects").select("author_id,guest_session_id,revision,name").eq("id", duplicateId).single();
      assert.ifError(duplicateRow.error); assert.equal(duplicateRow.data.author_id, authorId);
      assert.equal(duplicateRow.data.guest_session_id, null); assert.equal(duplicateRow.data.revision, 1);
      const numbered = await fetch(`${next.value}/api/studio/projects/${projectId}/duplicate`, { method: "POST", headers: headers(token) });
      assert.equal(numbered.status, 201); const numberedProject = (await numbered.json()).project;
      assert.equal(numberedProject.name, "Название — копия 2");
      assert.equal((await fetch(`${next.value}/api/studio/projects/${numberedProject.id}?expectedRevision=${numberedProject.revision}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })).status, 204);
      const hole = await fetch(`${next.value}/api/studio/projects/${projectId}/duplicate`, { method: "POST", headers: headers(token) });
      assert.equal(hole.status, 201); assert.equal((await hole.json()).project.name, "Название — копия 2", "name hole reuses copy 2");
      // A controlled disposable-only trigger proves the RPC rolls back its
      // project/reference graph when failure happens after the project insert.
      sql(stack, "CREATE OR REPLACE FUNCTION public.audiolad_harness_duplicate_abort() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audiolad_harness_abort'; END $$; CREATE TRIGGER audiolad_harness_duplicate_abort AFTER INSERT ON public.studio_projects FOR EACH ROW EXECUTE FUNCTION public.audiolad_harness_duplicate_abort();");
      const beforeRollback = await service.from("studio_projects").select("id", { count: "exact", head: true }).eq("author_id", authorId).eq("status", "active");
      const rejected = await fetch(`${next.value}/api/studio/projects/${projectId}/duplicate`, { method: "POST", headers: headers(token) });
      assert.equal(rejected.status, 500, "controlled trigger failure is reported safely");
      sql(stack, "DROP TRIGGER audiolad_harness_duplicate_abort ON public.studio_projects; DROP FUNCTION public.audiolad_harness_duplicate_abort();");
      const afterRollback = await service.from("studio_projects").select("id", { count: "exact", head: true }).eq("author_id", authorId).eq("status", "active");
      assert.equal(afterRollback.count, beforeRollback.count, "trigger failure rolls back duplicate project insertion");
      const sourceCount = await service.from("studio_asset_sources").select("*", { count: "exact", head: true });
      assert.equal(sourceCount.count, 2, "duplicate must not create physical sources");
      const b = await fetch(`${next.value}/api/studio/projects/${duplicateId}`, { headers: headers(token) });
      assert.equal(b.status, 200);
      const bData = (await b.json()).project;
      const autosave = await fetch(`${next.value}/api/studio/projects/${duplicateId}`, { method: "PUT", headers: headers(token), body: JSON.stringify({ expectedRevision: bData.revision, name: bData.name, projectData: bData.projectData }) });
      assert.equal(autosave.status, 200);
      assert.equal((await autosave.json()).project.revision, 2, "B: duplicate autosave owns its revision");
      // C: replacement is copy-on-write: the duplicate gets a new source while
      // the source project continues to resolve the original object.
      const replace = await fetch(`${next.value}/api/studio/projects/${duplicateId}/assets/${copied.data![0]!.id}`, {
        method: "PUT", headers: { Authorization: `Bearer ${token}` }, body: replacementForm(`replacement-${run}`),
      });
      assert.equal(replace.status, 200, "replace uses the application HTTP contract");
      const afterReplace = await assertSources(service, duplicateId, 2);
      assert.notEqual(afterReplace.find((asset) => asset.id === copied.data![0]!.id)?.source_id, copied.data![0]!.source_id);
      assert(!((await service.storage.from(BUCKET).download(voicePath)).error), "original physical object survives replacement");
      // D: a render request produces a job only for the requested source project;
      // duplication itself must never enqueue a render job.
      const render = await fetch(`${next.value}/api/studio/projects/${projectId}/render`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      assert.equal(render.status, 202, "render snapshot validates through the actual render endpoint");
      const renderJobs = await service.from("studio_render_jobs").select("id", { count: "exact", head: true }).eq("project_id", duplicateId);
      assert.ifError(renderJobs.error); assert.equal(renderJobs.count, 0, "duplicate has no render job");
      const a = await fetch(`${next.value}/api/studio/projects/${projectId}`, { headers: headers(token) }); const aData = (await a.json()).project;
      assert.equal((await fetch(`${next.value}/api/studio/projects/${projectId}?expectedRevision=${aData.revision}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })).status, 204);
      const asset = copied.data![0]!;
      assert(!((await service.storage.from(BUCKET).download(asset.storage_path)).error), "shared object must survive original delete");
      const duplicateData = (await (await fetch(`${next.value}/api/studio/projects/${duplicateId}`, { headers: headers(token) })).json()).project;
      assert.equal((await fetch(`${next.value}/api/studio/projects/${duplicateId}?expectedRevision=${duplicateData.revision}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })).status, 204);
      await mustNotExist(service, BUCKET, musicPath, "last reference deletion removes shared storage");
      // Keep the disposable stack reusable even if its normal fixture cleanup
      // is disabled; no guest project/session is intentionally retained.
      sql(stack, `DELETE FROM public.studio_projects WHERE guest_session_id = ${sqlLiteral(guestSessionId)}::uuid; DELETE FROM public.studio_guest_sessions WHERE id = ${sqlLiteral(guestSessionId)}::uuid;`);
      console.log(JSON.stringify({ run, duplicateId, sharedSources: 2, integrity: "ok" }));
    } finally { await stop(next.child, next.sandbox); }
  } finally {
    // Fixture cleanup is intentionally best-effort: preserve the first test
    // failure, but leave a reusable disposable stack as clean as possible.
    try {
      const paths = await service.from("studio_asset_sources").select("storage_path")
        .like("storage_path", `studio/${authorId}/%`);
      if (!paths.error && paths.data?.length) await service.storage.from(BUCKET).remove(paths.data.map((row) => row.storage_path));
      sql(stack, `DELETE FROM public.studio_render_jobs WHERE author_id = ${sqlLiteral(authorId)}::uuid; DELETE FROM public.studio_project_assets WHERE project_id IN (SELECT id FROM public.studio_projects WHERE author_id = ${sqlLiteral(authorId)}::uuid); DELETE FROM public.studio_projects WHERE author_id = ${sqlLiteral(authorId)}::uuid; DELETE FROM public.studio_asset_sources WHERE storage_path LIKE ${sqlLiteral(`studio/${authorId}/%`)}; DELETE FROM public.author_members WHERE author_id = ${sqlLiteral(authorId)}::uuid; DELETE FROM public.authors WHERE id = ${sqlLiteral(authorId)}::uuid;`);
    } catch (cleanupError) {
      console.error("studio-shared-assets-isolated: fixture cleanup failed", cleanupError instanceof Error ? cleanupError.message : "unknown");
    }
    await service.auth.admin.deleteUser(user.data.user.id);
  }
}
main().catch((error) => { console.error("studio-shared-assets-isolated:", error); process.exitCode = 1; });
