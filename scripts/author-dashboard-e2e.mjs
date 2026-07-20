#!/usr/bin/env node
/**
 * Author dashboard E2E acceptance script.
 * Run locally on server only. Does not print secrets or user UUIDs.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  bootstrapDataWriteScript,
  assertProjectEnvLocalSafeForFixtures,
} from "./lib/fixture-script-entry.mjs";

const SCRIPT_NAME = "scripts/author-dashboard-e2e.mjs";
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

const boot = bootstrapDataWriteScript({
  scriptName: SCRIPT_NAME,
  supabaseUrl: SUPABASE_URL,
  dockerExec: false,
});
if (boot.skipped) {
  process.exit(0);
}

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const TEST_TITLE = "Тест кабинета автора — удалить после проверки";
const MULTI_TITLE = "Тест нескольких аудио — удалить после проверки";

function loadEnv() {
  assertProjectEnvLocalSafeForFixtures({ envPath: "/var/www/audiolad/.env.local" });
  return Object.fromEntries(
    readFileSync("/var/www/audiolad/.env.local", "utf8")
      .split("\n")
      .filter((line) => line && line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

async function getOwnerSession(env) {
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const pub = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: "1@audiolad.ru",
  });

  if (error || !linkData?.properties?.hashed_token) {
    throw new Error("owner_session_failed");
  }

  const { data, error: verifyError } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  if (verifyError || !data.session?.access_token) {
    throw new Error("owner_verify_failed");
  }

  return data.session;
}

async function getListenerSession(env) {
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const pub = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: members, error: membersError } = await admin
    .from("author_members")
    .select("user_id");

  if (membersError) {
    throw new Error("listener_lookup_failed");
  }

  const memberIds = new Set((members ?? []).map((row) => row.user_id));

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id")
    .limit(20);

  if (profilesError) {
    throw new Error("profiles_lookup_failed");
  }

  const listenerProfile = (profiles ?? []).find((row) => !memberIds.has(row.id));

  if (!listenerProfile?.id) {
    return null;
  }

  const { data: userData, error: userError } =
    await admin.auth.admin.getUserById(listenerProfile.id);

  if (userError || !userData.user?.email) {
    return null;
  }

  const { data: linkData, error: linkError } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
    });

  if (linkError || !linkData?.properties?.hashed_token) {
    return null;
  }

  const { data, error: verifyError } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  if (verifyError || !data.session?.access_token) {
    return null;
  }

  return data.session;
}

async function api(path, options = {}) {
  const headers = {
    ...(options.headers ?? {}),
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return { status: response.status, body };
}

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

function makePngCover(path) {
  const pngBase64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  writeFileSync(path, Buffer.from(pngBase64, "base64"));
}

async function uploadCover(token, practiceId, coverPath) {
  const form = new FormData();
  const blob = new Blob([readFileSync(coverPath)], { type: "image/png" });
  form.set("file", blob, "cover.png");
  const response = await fetch(`${BASE}/api/author/products/${practiceId}/cover`, {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
  return { status: response.status, body: await response.json() };
}

async function uploadAudio(token, practiceId, audioId, mp3Path) {
  const form = new FormData();
  const blob = new Blob([readFileSync(mp3Path)], { type: "audio/mpeg" });
  form.set("file", blob, "test.mp3");
  const response = await fetch(
    `${BASE}/api/author/products/${practiceId}/audio/${audioId}/upload`,
    {
      method: "POST",
      headers: authHeaders(token),
      body: form,
    },
  );
  return { status: response.status, body: await response.json() };
}

const results = [];
function pass(name) {
  results.push({ name, ok: true });
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
}

async function main() {
  const env = loadEnv();
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const ownerSession = await getOwnerSession(env);
  const listenerSession = await getListenerSession(env);
  const ownerToken = ownerSession.access_token;

  const authorRes = await api("/api/author/authors", { token: ownerToken });
  if (authorRes.status === 200 && authorRes.body?.authors?.length === 3) {
    pass("owner_sees_three_authors");
  } else {
    fail("owner_sees_three_authors", `status=${authorRes.status}`);
  }

  const noAuth = await api("/api/author/authors");
  if (noAuth.status === 401) pass("api_no_auth_401");
  else fail("api_no_auth_401", `status=${noAuth.status}`);

  if (listenerSession) {
    const listenerAuthors = await api("/api/author/authors", {
      token: listenerSession.access_token,
    });
    if (listenerAuthors.status === 200 && listenerAuthors.body?.authors?.length === 0) {
      pass("listener_no_author_workspaces");
    } else {
      fail("listener_no_author_workspaces", JSON.stringify(listenerAuthors.body));
    }

    const { data: firstPractice } = await admin
      .from("practices")
      .select("id")
      .eq("slug", "first-audio-course")
      .single();

    if (firstPractice?.id) {
      const forbidden = await api(`/api/author/products/${firstPractice.id}`, {
        token: listenerSession.access_token,
      });
      if (forbidden.status === 403 || forbidden.status === 404) {
        pass("listener_cannot_edit_first_product");
      } else {
        fail("listener_cannot_edit_first_product", `status=${forbidden.status}`);
      }
    }
  } else {
    fail("listener_session", "no_listener_without_membership");
  }

  const authorRows = authorRes.body?.authors ?? [];
  const sergey = authorRows.find((a) => a.slug === "sergey-petrov");
  const joint = authorRows.find((a) => a.slug === "sergey-and-zoya");
  const zoya = authorRows.find((a) => a.slug === "zoya-petrova");

  if (sergey && joint && zoya) pass("author_slugs_present");
  else fail("author_slugs_present");

  const jointProducts = await api(
    `/api/author/products?author_id=${encodeURIComponent(joint.id)}`,
    { token: ownerToken },
  );
  const sergeyProducts = await api(
    `/api/author/products?author_id=${encodeURIComponent(sergey.id)}`,
    { token: ownerToken },
  );

  const jointHasFirst = (jointProducts.body?.products ?? []).some(
    (p) => p.slug === "first-audio-course",
  );
  const sergeyHasFirst = (sergeyProducts.body?.products ?? []).some(
    (p) => p.slug === "first-audio-course",
  );

  if (jointHasFirst && !sergeyHasFirst) pass("first_product_only_joint_author");
  else fail("first_product_only_joint_author", { jointHasFirst, sergeyHasFirst });

  const { data: firstDetail } = await admin
    .from("practices")
    .select("id, slug, price, audio_url, title, format, subtitle, description")
    .eq("slug", "first-audio-course")
    .single();

  const firstBefore = firstDetail;
  const firstApi = await api(`/api/author/products/${firstBefore.id}`, {
    token: ownerToken,
  });

  if (firstApi.status === 200) {
    const p = firstApi.body?.product?.practice;
    const audio = firstApi.body?.product?.audio_items ?? [];
    if (
      p?.price === 99 &&
      p?.slug === "first-audio-course" &&
      audio.length === 1 &&
      audio[0]?.duration_seconds === 688 &&
      audio[0]?.audio_path?.includes("audio.mp3")
    ) {
      pass("first_product_editor_load");
    } else {
      fail("first_product_editor_load", JSON.stringify({ p, audio }));
    }
  } else {
    fail("first_product_editor_load", `status=${firstApi.status}`);
  }

  const created = await api("/api/author/products", {
    method: "POST",
    token: ownerToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ author_id: sergey.id, title: TEST_TITLE }),
  });

  let singlePracticeId = created.body?.product?.practice?.id;
  let singleAudioId = created.body?.product?.audio_items?.[0]?.id;

  if (created.status === 201 && singlePracticeId && singleAudioId) {
    pass("create_draft");
  } else {
    fail("create_draft", JSON.stringify(created.body));
    console.log(JSON.stringify({ results, fatal: "draft_create_failed" }, null, 2));
    process.exit(1);
  }

  const patch = await api(`/api/author/products/${singlePracticeId}`, {
    method: "PATCH",
    token: ownerToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subtitle: "Тестовый подзаголовок",
      description: "Тестовое описание для проверки кабинета автора.",
      format: "Аудиопрактика",
      is_free: false,
      price: 99,
    }),
  });

  if (patch.status === 200 && patch.body?.product?.practice?.slug) {
    pass("save_metadata_and_slug");
  } else {
    fail("save_metadata_and_slug", JSON.stringify(patch.body));
  }

  makePngCover("/tmp/audiolad-test-cover.png");
  const coverUpload = await uploadCover(ownerToken, singlePracticeId, "/tmp/audiolad-test-cover.png");
  if (coverUpload.status === 200 && coverUpload.body?.product?.practice?.cover_url) {
    pass("cover_upload");
  } else {
    fail("cover_upload", JSON.stringify(coverUpload.body));
  }

  const audioUpload = await uploadAudio(
    ownerToken,
    singlePracticeId,
    singleAudioId,
    "/tmp/audiolad-test.mp3",
  );

  const uploadedPath = audioUpload.body?.product?.audio_items?.[0]?.audio_path;
  if (
    audioUpload.status === 200 &&
    uploadedPath?.match(new RegExp(`practices/${singlePracticeId}/audio/${singleAudioId}\\.mp3`))
  ) {
    pass("audio_upload_path");
  } else {
    fail("audio_upload_path", JSON.stringify(audioUpload.body));
  }

  if (audioUpload.body?.duration_seconds > 0) pass("ffprobe_duration");
  else fail("ffprobe_duration");

  const reload = await api(`/api/author/products/${singlePracticeId}`, {
    token: ownerToken,
  });
  if (reload.status === 200 && reload.body?.product?.audio_items?.[0]?.audio_path) {
    pass("reload_persists");
  } else {
    fail("reload_persists");
  }

  const publish = await api(`/api/author/products/${singlePracticeId}/publish`, {
    method: "POST",
    token: ownerToken,
  });

  if (publish.status === 200) {
    const { data: published } = await admin
      .from("practices")
      .select("status, published_at, audio_url, duration_minutes")
      .eq("id", singlePracticeId)
      .single();
    const { data: publishedAudio } = await admin
      .from("audio_items")
      .select("status, audio_path, duration_seconds")
      .eq("practice_id", singlePracticeId)
      .single();

    if (
      published?.status === "published" &&
      published?.published_at &&
      published?.audio_url === publishedAudio?.audio_path &&
      published?.duration_minutes >= 1 &&
      publishedAudio?.status === "published"
    ) {
      pass("single_publish");
    } else {
      fail("single_publish", JSON.stringify({ published, publishedAudio }));
    }
  } else {
    fail("single_publish", JSON.stringify(publish.body));
  }

  const multiCreated = await api("/api/author/products", {
    method: "POST",
    token: ownerToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ author_id: sergey.id, title: MULTI_TITLE }),
  });
  const multiId = multiCreated.body?.product?.practice?.id;
  let multiAudio = multiCreated.body?.product?.audio_items ?? [];

  const addSecond = await api(`/api/author/products/${multiId}/audio`, {
    method: "POST",
    token: ownerToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Аудио 2" }),
  });
  multiAudio = addSecond.body?.product?.audio_items ?? [];

  if (multiAudio.length === 2) pass("multi_two_audio");
  else fail("multi_two_audio", String(multiAudio.length));

  const ids = multiAudio.map((a) => a.id);
  const reorder = await api(`/api/author/products/${multiId}/audio/reorder`, {
    method: "POST",
    token: ownerToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order: [ids[1], ids[0]] }),
  });

  const reloaded = reorder.body?.product?.audio_items ?? [];
  if (reloaded[0]?.id === ids[1] && reloaded[1]?.id === ids[0]) pass("reorder_audio");
  else fail("reorder_audio");

  const multiPublish = await api(`/api/author/products/${multiId}/publish`, {
    method: "POST",
    token: ownerToken,
  });

  if (
    multiPublish.status === 400 &&
    multiPublish.body?.error === "multi_audio_not_supported"
  ) {
    pass("multi_publish_blocked");
  } else {
    fail("multi_publish_blocked", JSON.stringify(multiPublish.body));
  }

  const badPrice = await api(`/api/author/products/${multiId}`, {
    method: "PATCH",
    token: ownerToken,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ price: 12345, is_free: false }),
  });
  if (badPrice.status === 400) pass("reject_invalid_price");
  else fail("reject_invalid_price", `status=${badPrice.status}`);

  const badMime = await fetch(
    `${BASE}/api/author/products/${multiId}/audio/${multiAudio[0].id}/upload`,
    {
      method: "POST",
      headers: authHeaders(ownerToken),
      body: (() => {
        const form = new FormData();
        form.set("file", new Blob(["not audio"], { type: "text/plain" }), "bad.txt");
        return form;
      })(),
    },
  );
  if (badMime.status === 400) pass("reject_bad_mime");
  else fail("reject_bad_mime", `status=${badMime.status}`);

  if (listenerSession && multiId) {
    const listenerPatch = await api(`/api/author/products/${multiId}`, {
      method: "PATCH",
      token: listenerSession.access_token,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "hack" }),
    });
    if (listenerPatch.status === 403 || listenerPatch.status === 404) {
      pass("listener_patch_forbidden");
    } else {
      fail("listener_patch_forbidden", `status=${listenerPatch.status}`);
    }
  }

  const cleanupIds = [singlePracticeId, multiId].filter(Boolean);
  for (const practiceId of cleanupIds) {
    const { data: audioItems } = await admin
      .from("audio_items")
      .select("id, audio_path")
      .eq("practice_id", practiceId);

    for (const item of audioItems ?? []) {
      if (item.audio_path) {
        await admin.storage.from("practice-audio").remove([item.audio_path]);
      }
    }

    await admin.storage.from("practice-covers").remove([
      `practices/${practiceId}/cover.png`,
      `practices/${practiceId}/cover.jpg`,
      `practices/${practiceId}/cover.webp`,
    ]);

    await admin.from("audio_items").delete().eq("practice_id", practiceId);
    await admin.from("practices").delete().eq("id", practiceId);
  }

  const { count: orphanAudio } = await admin
    .from("audio_items")
    .select("id", { count: "exact", head: true })
    .in("practice_id", cleanupIds);
  const { data: firstAfter } = await admin
    .from("practices")
    .select("id, slug, price, audio_url")
    .eq("slug", "first-audio-course")
    .single();
  const orders = await admin.from("orders").select("id", { count: "exact" });
  const payments = await admin.from("payments").select("id", { count: "exact" });
  const accesses = firstAfter?.id
    ? await admin
        .from("user_practices")
        .select("id", { count: "exact" })
        .eq("practice_id", firstAfter.id)
    : { count: 0 };

  if ((orphanAudio ?? 0) === 0) pass("cleanup_orphans");
  else fail("cleanup_orphans", String(orphanAudio));

  if (
    firstAfter?.price === firstBefore.price &&
    firstAfter?.audio_url === firstBefore.audio_url &&
    firstAfter?.slug === "first-audio-course"
  ) {
    pass("first_product_unchanged");
  } else {
    fail("first_product_unchanged");
  }

  if ((orders.count ?? 0) === 3 && (payments.count ?? 0) === 3 && (accesses.count ?? 0) === 2) {
    pass("commerce_unchanged");
  } else {
    fail("commerce_unchanged", JSON.stringify({ orders, payments, accesses }));
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log(
    JSON.stringify(
      {
        summary: { passed, failed: failed.length, total: results.length },
        failed,
        results: results.map((r) => ({ name: r.name, ok: r.ok })),
      },
      null,
      2,
    ),
  );

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("fatal", error.message);
  process.exit(1);
});
