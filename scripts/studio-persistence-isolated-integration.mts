#!/usr/bin/env node
/**
 * Disposable integration coverage for the Studio project persistence routes.
 *
 * This test is deliberately opt-in and only permits the local isolated
 * Supabase stack. It owns its temporary GoTrue users, relational fixtures and
 * Storage objects, then removes them through service-role supabase-js calls.
 *
 * Required environment:
 *   AUDIOLAD_TEST_DATABASE=1
 *   AUDIOLAD_STUDIO_PERSISTENCE_ISOLATED=1
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const ASSETS_BUCKET = "studio-draft-assets";
const PASSWORD = "StudioHarness-2026!";

type Resource =
  | { type: "auth_user"; id: string }
  | { type: "profile"; id: string }
  | { type: "author"; id: string }
  | { type: "author_member"; authorId: string; userId: string }
  | { type: "studio_project"; id: string }
  | { type: "studio_asset"; id: string; storagePath?: string };

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing_required_environment:${name}`);
  return value;
}

function assertIsolatedTarget(url: string) {
  const parsed = new URL(url);
  assert.equal(parsed.protocol, "http:", "isolated harness requires plain local HTTP");
  assert.equal(parsed.hostname, "127.0.0.1", "isolated harness requires 127.0.0.1");
  assert.equal(parsed.port, "54321", "isolated harness requires port 54321");
  assert.equal(parsed.origin, LOCAL_SUPABASE_URL, "isolated harness target drift");
}

async function reserveFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string", "failed to reserve a local port");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(baseUrl: string, process: ChildProcess) {
  let lastError = "no response";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (process.exitCode !== null) {
      throw new Error(`managed_next_server_exited:${process.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/studio/projects`);
      if (response.status < 500) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`managed_next_server_not_ready:${lastError}`);
}

async function stopServer(process: ChildProcess | null) {
  if (!process || process.exitCode !== null) return;
  process.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => process.once("exit", () => resolve())),
    delay(5_000),
  ]);
  if (process.exitCode === null) process.kill("SIGKILL");
}

async function createManagedNextSandbox(projectRoot: string): Promise<string> {
  const sandbox = await mkdtemp(path.join(tmpdir(), "audiolad-studio-persistence-"));
  for (const entry of [
    "src",
    "public",
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json",
    "next-env.d.ts",
    "package.json",
  ]) {
    await cp(path.join(projectRoot, entry), path.join(sandbox, entry), { recursive: true });
  }
  await symlink(path.join(projectRoot, "node_modules"), path.join(sandbox, "node_modules"));
  return sandbox;
}

class StudioFixtureRegistry {
  readonly resources: Resource[] = [];

  constructor(private readonly service: SupabaseClient) {}

  register(resource: Resource) {
    this.resources.push(resource);
    return resource;
  }

  async cleanup() {
    const assets = this.resources.filter((resource): resource is Extract<Resource, { type: "studio_asset" }> =>
      resource.type === "studio_asset",
    );
    for (const asset of assets) {
      const { data, error } = await this.service
        .from("studio_project_assets")
        .select("storage_path")
        .eq("id", asset.id)
        .maybeSingle();
      if (error) throw new Error(`cleanup_asset_path_lookup_failed:${error.message}`);
      const storagePath = data?.storage_path ?? asset.storagePath;
      if (data?.storage_path) asset.storagePath = data.storage_path;
      if (storagePath) {
        const { error: storageError } = await this.service.storage
          .from(ASSETS_BUCKET)
          .remove([storagePath]);
        if (storageError) throw new Error(`cleanup_storage_remove_failed:${storageError.message}`);
      }
      const { error: assetError } = await this.service
        .from("studio_project_assets")
        .delete()
        .eq("id", asset.id);
      if (assetError) throw new Error(`cleanup_asset_row_delete_failed:${assetError.message}`);
    }

    for (const project of this.resources.filter((resource): resource is Extract<Resource, { type: "studio_project" }> =>
      resource.type === "studio_project",
    )) {
      const { error } = await this.service.from("studio_projects").delete().eq("id", project.id);
      if (error) throw new Error(`cleanup_project_delete_failed:${error.message}`);
    }
    for (const membership of this.resources.filter((resource): resource is Extract<Resource, { type: "author_member" }> =>
      resource.type === "author_member",
    )) {
      const { error } = await this.service
        .from("author_members")
        .delete()
        .eq("author_id", membership.authorId)
        .eq("user_id", membership.userId);
      if (error) throw new Error(`cleanup_member_delete_failed:${error.message}`);
    }
    for (const author of this.resources.filter((resource): resource is Extract<Resource, { type: "author" }> =>
      resource.type === "author",
    )) {
      const { error } = await this.service.from("authors").delete().eq("id", author.id);
      if (error) throw new Error(`cleanup_author_delete_failed:${error.message}`);
    }
    for (const profile of this.resources.filter((resource): resource is Extract<Resource, { type: "profile" }> =>
      resource.type === "profile",
    )) {
      const { error } = await this.service.from("profiles").delete().eq("id", profile.id);
      if (error) throw new Error(`cleanup_profile_delete_failed:${error.message}`);
    }
    for (const user of this.resources.filter((resource): resource is Extract<Resource, { type: "auth_user" }> =>
      resource.type === "auth_user",
    )) {
      const { error } = await this.service.auth.admin.deleteUser(user.id);
      // GoTrue returns a 404 after the first successful deletion: cleanup must
      // remain safe to run more than once.
      if (error && error.status !== 404) {
        throw new Error(`cleanup_auth_user_delete_failed:${error.message}`);
      }
    }
  }

  async assertZeroLeftovers() {
    for (const resource of this.resources) {
      if (resource.type === "studio_asset") {
        const { count, error } = await this.service
          .from("studio_project_assets")
          .select("*", { count: "exact", head: true })
          .eq("id", resource.id);
        assert.ifError(error);
        assert.equal(count, 0, `leftover studio asset ${resource.id}`);
        if (resource.storagePath) {
          const { data: storageData, error: storageError } = await this.service.storage
            .from(ASSETS_BUCKET)
            .download(resource.storagePath);
          assert(
            storageError || !storageData,
            `leftover studio Storage object ${resource.storagePath}`,
          );
        }
      } else if (resource.type === "studio_project") {
        const { count, error } = await this.service
          .from("studio_projects")
          .select("*", { count: "exact", head: true })
          .eq("id", resource.id);
        assert.ifError(error);
        assert.equal(count, 0, `leftover studio project ${resource.id}`);
      } else if (resource.type === "author") {
        const { count, error } = await this.service
          .from("authors")
          .select("*", { count: "exact", head: true })
          .eq("id", resource.id);
        assert.ifError(error);
        assert.equal(count, 0, `leftover author ${resource.id}`);
      } else if (resource.type === "author_member") {
        const { count, error } = await this.service
          .from("author_members")
          .select("*", { count: "exact", head: true })
          .eq("author_id", resource.authorId)
          .eq("user_id", resource.userId);
        assert.ifError(error);
        assert.equal(count, 0, `leftover author membership ${resource.userId}`);
      } else if (resource.type === "profile") {
        const { count, error } = await this.service
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("id", resource.id);
        assert.ifError(error);
        assert.equal(count, 0, `leftover profile ${resource.id}`);
      } else {
        const { data, error } = await this.service.auth.admin.getUserById(resource.id);
        assert(error || !data.user, `leftover GoTrue user ${resource.id}`);
      }
    }
  }
}

function authHeaders(accessToken?: string): Headers {
  const headers = new Headers();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return headers;
}

function studioUploadForm() {
  const form = new FormData();
  form.append("sourceType", "upload");
  form.append("file", new Blob(["minimal studio audio"], { type: "audio/wav" }), "minimal.wav");
  return form;
}

function emptyProjectData() {
  return {
    schemaVersion: 2,
    studioVersion: 1,
    editor: { currentTime: 0 },
    slots: [],
    tracks: [],
  };
}

function jsonHeaders(accessToken?: string) {
  const headers = authHeaders(accessToken);
  headers.set("Content-Type", "application/json");
  return headers;
}

type ProjectDto = {
  id: string;
  revision: number;
  projectData: ReturnType<typeof emptyProjectData>;
};

async function createProject(
  baseUrl: string,
  accessToken: string,
  authorId: string,
  name: string,
): Promise<ProjectDto> {
  const response = await fetch(`${baseUrl}/api/studio/projects`, {
    method: "POST",
    headers: jsonHeaders(accessToken),
    body: JSON.stringify({ authorId, name }),
  });
  assert.equal(response.status, 201, `${name}: project creation is allowed`);
  const body = await response.json() as { project: ProjectDto };
  assert(body.project?.id, `${name}: project response includes an id`);
  return body.project;
}

async function createSignedInFixture(
  service: SupabaseClient,
  anonKey: string,
  registry: StudioFixtureRegistry,
  label: string,
) {
  const email = `studio-persistence-${label}-${randomUUID()}@audiolad.test`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  assert.ifError(error);
  assert(data.user, "GoTrue did not create fixture user");
  registry.register({ type: "auth_user", id: data.user.id });
  const profile = await service.from("profiles").select("id").eq("id", data.user.id).maybeSingle();
  if (!profile.error && profile.data?.id) {
    registry.register({ type: "profile", id: data.user.id });
  }

  const browser = createClient(LOCAL_SUPABASE_URL, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signedIn = await browser.auth.signInWithPassword({ email, password: PASSWORD });
  assert.ifError(signedIn.error);
  assert(signedIn.data.session?.access_token, "GoTrue did not issue an access token");
  return { id: data.user.id, accessToken: signedIn.data.session.access_token };
}

async function main() {
  assert.equal(process.env.AUDIOLAD_TEST_DATABASE, "1", "requires AUDIOLAD_TEST_DATABASE=1");
  assert.equal(
    process.env.AUDIOLAD_STUDIO_PERSISTENCE_ISOLATED,
    "1",
    "requires AUDIOLAD_STUDIO_PERSISTENCE_ISOLATED=1",
  );
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  assertIsolatedTarget(supabaseUrl);

  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const registry = new StudioFixtureRegistry(service);
  let nextServer: ChildProcess | null = null;
  let nextSandbox: string | null = null;

  try {
    const port = await reserveFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    nextSandbox = await createManagedNextSandbox(process.cwd());
    nextServer = spawn(
      process.execPath,
      [
        "./node_modules/next/dist/bin/next",
        "dev",
        "--webpack",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: nextSandbox,
        env: {
          ...process.env,
          NEXT_PUBLIC_SUPABASE_URL: LOCAL_SUPABASE_URL,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonKey,
          SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
        },
        stdio: "inherit",
      },
    );
    await waitForServer(baseUrl, nextServer);

    const owner = await createSignedInFixture(service, anonKey, registry, "owner");
    const editor = await createSignedInFixture(service, anonKey, registry, "editor");
    const outsider = await createSignedInFixture(service, anonKey, registry, "outsider");
    const secondWorkspaceOwner = await createSignedInFixture(
      service,
      anonKey,
      registry,
      "second-workspace-owner",
    );
    const authorId = randomUUID();
    const secondAuthorId = randomUUID();
    registry.register({ type: "author", id: authorId });
    registry.register({ type: "author", id: secondAuthorId });
    registry.register({ type: "author_member", authorId, userId: owner.id });
    registry.register({ type: "author_member", authorId, userId: editor.id });
    registry.register({
      type: "author_member",
      authorId: secondAuthorId,
      userId: secondWorkspaceOwner.id,
    });
    const suffix = randomUUID().slice(0, 8);
    assert.ifError((await service.from("authors").insert([
      {
        id: authorId,
        name: `Studio harness ${suffix}`,
        slug: `studio-harness-${suffix}`,
        access_status: "free",
      },
      {
        id: secondAuthorId,
        name: `Studio second workspace ${suffix}`,
        slug: `studio-second-workspace-${suffix}`,
        access_status: "free",
      },
    ])).error);
    assert.ifError((await service.from("author_members").insert([
      { author_id: authorId, user_id: owner.id, role: "owner" },
      { author_id: authorId, user_id: editor.id, role: "editor" },
      { author_id: secondAuthorId, user_id: secondWorkspaceOwner.id, role: "owner" },
    ])).error);

    const anonymousUpload = await fetch(`${baseUrl}/api/studio/projects/${randomUUID()}/assets`, {
      method: "POST",
      body: studioUploadForm(),
    });
    assert.equal(anonymousUpload.status, 401, "anonymous upload is denied");

    const createdProject = await createProject(
      baseUrl,
      owner.accessToken,
      authorId,
      "Disposable integration project",
    );
    const projectId = createdProject.id;
    registry.register({ type: "studio_project", id: projectId });
    const secondProject = await createProject(
      baseUrl,
      secondWorkspaceOwner.accessToken,
      secondAuthorId,
      "Second workspace project",
    );
    registry.register({ type: "studio_project", id: secondProject.id });

    const anonymousProjectGet = await fetch(`${baseUrl}/api/studio/projects/${projectId}`);
    assert.equal(anonymousProjectGet.status, 401, "anonymous project GET is denied");
    const anonymousProjectPut = await fetch(`${baseUrl}/api/studio/projects/${projectId}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({
        expectedRevision: createdProject.revision,
        name: "Anonymous mutation",
        projectData: emptyProjectData(),
      }),
    });
    assert.equal(anonymousProjectPut.status, 401, "anonymous project PUT is denied");

    const ownerGet = await fetch(`${baseUrl}/api/studio/projects/${projectId}`, {
      headers: authHeaders(owner.accessToken),
    });
    assert.equal(ownerGet.status, 200, "owner project GET is allowed");
    const ownerGetBody = await ownerGet.json() as { project: ProjectDto };
    assert.equal(ownerGetBody.project.revision, 1, "owner sees initial revision");
    const ownerPut = await fetch(`${baseUrl}/api/studio/projects/${projectId}`, {
      method: "PUT",
      headers: jsonHeaders(owner.accessToken),
      body: JSON.stringify({
        expectedRevision: ownerGetBody.project.revision,
        name: "Owner revision",
        projectData: emptyProjectData(),
      }),
    });
    assert.equal(ownerPut.status, 200, "owner project PUT is allowed");
    const ownerPutBody = await ownerPut.json() as { project: ProjectDto };
    assert.equal(ownerPutBody.project.revision, 2, "owner PUT increments revision");

    const editorGet = await fetch(`${baseUrl}/api/studio/projects/${projectId}`, {
      headers: authHeaders(editor.accessToken),
    });
    assert.equal(editorGet.status, 200, "editor project GET is allowed");
    const editorGetBody = await editorGet.json() as { project: ProjectDto };
    assert.equal(editorGetBody.project.revision, 2, "editor sees owner revision");
    const editorPut = await fetch(`${baseUrl}/api/studio/projects/${projectId}`, {
      method: "PUT",
      headers: jsonHeaders(editor.accessToken),
      body: JSON.stringify({
        expectedRevision: editorGetBody.project.revision,
        name: "Editor revision",
        projectData: emptyProjectData(),
      }),
    });
    assert.equal(editorPut.status, 200, "editor project PUT is allowed");
    const editorPutBody = await editorPut.json() as { project: ProjectDto };
    assert.equal(editorPutBody.project.revision, 3, "editor PUT increments revision");

    for (const [label, actor] of [
      ["outsider", outsider],
      ["second workspace owner", secondWorkspaceOwner],
    ] as const) {
      const get = await fetch(`${baseUrl}/api/studio/projects/${projectId}`, {
        headers: authHeaders(actor.accessToken),
      });
      assert.equal(get.status, 404, `${label} project GET is hidden`);
      const put: Response = await fetch(`${baseUrl}/api/studio/projects/${projectId}`, {
        method: "PUT",
        headers: jsonHeaders(actor.accessToken),
        body: JSON.stringify({
          expectedRevision: editorPutBody.project.revision,
          name: "Forbidden mutation",
          projectData: emptyProjectData(),
        }),
      });
      assert.equal(put.status, 404, `${label} project PUT is hidden`);
    }

    const upload = await fetch(`${baseUrl}/api/studio/projects/${projectId}/assets`, {
      method: "POST",
      headers: authHeaders(owner.accessToken),
      body: studioUploadForm(),
    });
    assert.equal(upload.status, 201, "owner upload is allowed");
    const uploadBody = await upload.json() as { asset: { id: string } };
    registry.register({ type: "studio_asset", id: uploadBody.asset.id });

    const ownerDownload = await fetch(
      `${baseUrl}/api/studio/projects/${projectId}/assets/${uploadBody.asset.id}`,
      { headers: authHeaders(owner.accessToken) },
    );
    assert.equal(ownerDownload.status, 200, "owner download is allowed");
    assert.deepEqual(
      new Uint8Array(await ownerDownload.arrayBuffer()),
      new TextEncoder().encode("minimal studio audio"),
      "downloaded bytes match upload",
    );
    const editorDownload = await fetch(
      `${baseUrl}/api/studio/projects/${projectId}/assets/${uploadBody.asset.id}`,
      { headers: authHeaders(editor.accessToken) },
    );
    assert.equal(editorDownload.status, 200, "editor asset download is allowed");
    assert.deepEqual(
      new Uint8Array(await editorDownload.arrayBuffer()),
      new TextEncoder().encode("minimal studio audio"),
      "editor receives bytes identical to owner upload",
    );
    const anonymousDownload = await fetch(
      `${baseUrl}/api/studio/projects/${projectId}/assets/${uploadBody.asset.id}`,
    );
    assert.equal(anonymousDownload.status, 401, "anonymous download is denied");
    for (const [label, actor] of [
      ["outsider", outsider],
      ["second workspace owner", secondWorkspaceOwner],
    ] as const) {
      const download = await fetch(
        `${baseUrl}/api/studio/projects/${projectId}/assets/${uploadBody.asset.id}`,
        { headers: authHeaders(actor.accessToken) },
      );
      assert.equal(download.status, 404, `${label} asset download is hidden`);
    }

    console.log("studio persistence isolated integration: scenario passed");
  } finally {
    await stopServer(nextServer);
    if (nextSandbox) await rm(nextSandbox, { recursive: true, force: true });
    await registry.cleanup();
    await registry.assertZeroLeftovers();
    await registry.cleanup();
    await registry.assertZeroLeftovers();
    console.log("studio persistence isolated integration: cleanup passed twice with zero leftovers");
  }
}

main().catch((error) => {
  console.error("studio persistence isolated integration failed:", error);
  process.exitCode = 1;
});
