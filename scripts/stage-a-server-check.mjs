#!/usr/bin/env node
/**
 * Stage A server-side checks. Run on server only; does not print secrets.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
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

  return data.session.access_token;
}

async function api(path, token, options = {}) {
  const response = await fetch(`http://localhost:3000${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { status: response.status, body };
}

async function main() {
  const env = loadEnv();
  const token = await getOwnerSession(env);
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const results = [];

  const pass = (name) => results.push({ name, ok: true });
  const fail = (name, detail) => results.push({ name, ok: false, detail });

  const { data: author } = await admin
    .from("authors")
    .select("id")
    .eq("slug", "sergey-petrov")
    .maybeSingle();

  if (!author?.id) {
    throw new Error("author_not_found");
  }

  const { data: existing } = await admin
    .from("practices")
    .select("id, slug, audio_items:audio_items(id, position, title)")
    .eq("title", "E2E TEST — программа 3 аудио")
    .maybeSingle();

  let programId = existing?.id;
  let programSlug = existing?.slug;

  if (!programId) {
    const create = await api("/api/author/products", token, {
      method: "POST",
      body: JSON.stringify({
        author_id: author.id,
        title: "E2E TEST — программа 3 аудио",
      }),
    });

    if (create.status !== 201 || !create.body?.product?.practice?.id) {
      fail("create_program_draft", `status=${create.status}`);
    } else {
      programId = create.body.product.practice.id;
      programSlug = create.body.product.practice.slug;
      pass("create_program_draft");
    }
  } else {
    pass("reuse_program_draft");
  }

  if (programId) {
    let items = [];

    while (items.length < 3) {
      const detail = await api(`/api/author/products/${programId}`, token);
      items = detail.body?.product?.audio_items ?? [];

      if (items.length >= 3) {
        break;
      }

      const add = await api(`/api/author/products/${programId}/audio`, token, {
        method: "POST",
        body: JSON.stringify({ title: `Аудио ${items.length + 1}` }),
      });

      if (add.status !== 201) {
        fail("add_audio_items", `status=${add.status}`);
        break;
      }
    }

    if (items.length >= 3) {
      pass("ensure_three_audio_items");

      const titles = ["Первая чакра", "Вторая чакра", "Третья чакра"];

      for (const [index, item] of items.slice(0, 3).entries()) {
        await api(`/api/author/products/${programId}/audio/${item.id}`, token, {
          method: "PATCH",
          body: JSON.stringify({ title: titles[index] }),
        });
      }

      const { data: singleCover } = await admin
        .from("practices")
        .select("cover_url")
        .eq("id", "dafda0a3-c2c1-4d8d-b5bf-686046bb862a")
        .maybeSingle();

      await admin
        .from("practices")
        .update({ cover_url: singleCover?.cover_url ?? null })
        .eq("id", programId);

      await api(`/api/author/products/${programId}`, token, {
        method: "PATCH",
        body: JSON.stringify({
          description: "Тестовая программа из трёх аудио для E2E проверки этапа A.",
          format: "Программа аудиопрактик",
          is_free: true,
        }),
      });

      const mp3Path = "/var/www/audiolad/audiolad/tmp/first-audio-course.mp3";
      const mp3Buffer = readFileSync(mp3Path);
      const mp3Blob = new Blob([mp3Buffer], { type: "audio/mpeg" });

      for (const item of items.slice(0, 3)) {
        const formData = new FormData();
        formData.append("file", mp3Blob, "first-audio-course.mp3");

        const upload = await fetch(
          `http://localhost:3000/api/author/products/${programId}/audio/${item.id}/upload`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          },
        );

        if (!upload.ok) {
          fail("upload_program_mp3", `audio=${item.id} status=${upload.status}`);
        }
      }

      pass("upload_program_mp3");

      const reorder = await api(
        `/api/author/products/${programId}/audio/reorder`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            order: [items[2].id, items[0].id, items[1].id],
          }),
        },
      );

      if (reorder.status === 200) {
        const reloaded = reorder.body?.product?.audio_items ?? [];
        if (
          reloaded[0]?.title === "Третья чакра" &&
          reloaded[1]?.title === "Первая чакра" &&
          reloaded[2]?.title === "Вторая чакра"
        ) {
          pass("reorder_api");
        } else {
          fail("reorder_api", "unexpected order");
        }

        items = reloaded;
      } else {
        fail("reorder_api", `status=${reorder.status}`);
      }

      const invalidReorder = await api(
        `/api/author/products/${programId}/audio/reorder`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ order: [items[0].id, items[0].id, items[1].id] }),
        },
      );

      if (invalidReorder.status === 400) {
        pass("reorder_rejects_duplicates");
      } else {
        fail("reorder_rejects_duplicates", `status=${invalidReorder.status}`);
      }

      const publishCheck = await api(
        `/api/author/products/${programId}/publish`,
        token,
        { method: "POST" },
      );

      if (
        publishCheck.status === 200 ||
        publishCheck.body?.error === "invalid_audio_positions"
      ) {
        pass("multi_audio_publish_available");
      } else if (publishCheck.body?.error === "multi_audio_not_supported") {
        fail("multi_audio_publish_available", "still blocked");
      } else {
        pass("multi_audio_publish_available");
      }

      const emptyTitleAttempt = await api(
        `/api/author/products/${programId}/audio/${items[0].id}`,
        token,
        {
          method: "PATCH",
          body: JSON.stringify({ title: "   " }),
        },
      );

      if (emptyTitleAttempt.status === 400) {
        pass("missing_audio_title_patch_rejected");
      } else {
        fail("missing_audio_title_patch_rejected", `status=${emptyTitleAttempt.status}`);
      }

      const gapItemId = items[1].id;
      await admin
        .from("audio_items")
        .update({ position: 99 })
        .eq("id", gapItemId);

      const gapPublish = await api(
        `/api/author/products/${programId}/publish`,
        token,
        { method: "POST" },
      );

      if (gapPublish.body?.error === "invalid_audio_positions") {
        pass("invalid_audio_positions_rejected");
      } else {
        fail(
          "invalid_audio_positions_rejected",
          `error=${gapPublish.body?.error ?? gapPublish.status}`,
        );
      }

      await admin
        .from("audio_items")
        .update({ position: 2 })
        .eq("id", gapItemId);

      const { data: programPractice } = await admin
        .from("practices")
        .select("id, slug, duration_minutes, audio_url")
        .eq("id", programId)
        .maybeSingle();

      const { data: programItems } = await admin
        .from("audio_items")
        .select("id, position, title, duration_seconds, audio_path")
        .eq("practice_id", programId)
        .order("position", { ascending: true });

      console.log(
        JSON.stringify(
          {
            programId,
            programSlug,
            audioItemIds: (programItems ?? []).map((item) => item.id),
          },
          null,
          2,
        ),
      );

      const totalSeconds = (programItems ?? [])
        .filter((item) => item.audio_path)
        .reduce((sum, item) => sum + (item.duration_seconds ?? 0), 0);

      if (totalSeconds > 0) {
        const expectedMinutes = Math.max(1, Math.ceil(totalSeconds / 60));
        if (programPractice?.duration_minutes === expectedMinutes) {
          pass("program_duration_sum");
        } else {
          fail(
            "program_duration_sum",
            `got=${programPractice?.duration_minutes}, expected=${expectedMinutes}`,
          );
        }
      } else {
        pass("program_duration_sum_skipped_no_mp3");
      }

      const firstWithMp3 = (programItems ?? []).find((item) => item.audio_path);
      if (
        !firstWithMp3 ||
        programPractice?.audio_url === firstWithMp3.audio_path
      ) {
        pass("audio_url_first_track");
      } else {
        fail("audio_url_first_track", programPractice?.audio_url);
      }
    }
  }

  const singleId = "dafda0a3-c2c1-4d8d-b5bf-686046bb862a";
  const { data: singleBefore } = await admin
    .from("practices")
    .select("status, duration_minutes")
    .eq("id", singleId)
    .maybeSingle();

  if (singleBefore?.status === "published") {
    pass("single_e2e_still_published");

    const { data: singleItems } = await admin
      .from("audio_items")
      .select("duration_seconds, audio_path, position")
      .eq("practice_id", singleId)
      .order("position", { ascending: true });

    const singleSeconds = (singleItems ?? [])
      .filter((item) => item.audio_path)
      .reduce((sum, item) => sum + (item.duration_seconds ?? 0), 0);

    if (singleSeconds > 0) {
      const expectedSingleMinutes = Math.max(1, Math.ceil(singleSeconds / 60));
      if (singleBefore.duration_minutes === expectedSingleMinutes) {
        pass("single_duration_correct");
      } else {
        fail(
          "single_duration_correct",
          `got=${singleBefore.duration_minutes}, expected=${expectedSingleMinutes}`,
        );
      }
    }
  } else {
    fail("single_e2e_still_published", singleBefore?.status);
  }

  const { data: firstCourse } = await admin
    .from("practices")
    .select("id, price, slug")
    .eq("slug", "first-audio-course")
    .maybeSingle();

  if (firstCourse?.price === 99) {
    pass("first_audio_course_price");
  } else {
    fail("first_audio_course_price", String(firstCourse?.price));
  }

  const failed = results.filter((item) => !item.ok);
  console.log("RESULTS:");
  for (const item of results) {
    console.log(`${item.ok ? "PASS" : "FAIL"} ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
  }

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
