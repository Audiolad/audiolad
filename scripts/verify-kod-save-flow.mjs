#!/usr/bin/env node
/**
 * End-to-end save verification for Kod Prityazheniya (simulates form Save flow).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const PRACTICE_ID = "41f31832-e9e2-4e22-bb05-729bbc57c815";
const AUDIO_ID = "04aa4179-bdeb-4a2d-b223-c20d5cdff3d6";
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const NEW_DESC =
  "Код Притяжения — обновлённое описание для проверки сохранения.";
const NEW_AUDIO = "Код Притяжения — Квант-Медитация";

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

  const { data: linkData } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: "1@audiolad.ru",
  });

  const { data } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  return data.session.access_token;
}

async function api(token, path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  return {
    status: response.status,
    json: await response.json(),
  };
}

async function readDb(env) {
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: practice } = await admin
    .from("practices")
    .select("description, updated_at")
    .eq("id", PRACTICE_ID)
    .maybeSingle();

  const { data: audio } = await admin
    .from("audio_items")
    .select("title, status, updated_at")
    .eq("id", AUDIO_ID)
    .maybeSingle();

  return { practice, audio };
}

async function main() {
  const env = loadEnv();
  const token = await getOwnerSession(env);

  console.log("1) PATCH product");
  const productPatch = await api(token, `/api/author/products/${PRACTICE_ID}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: "Код Притяжения",
      subtitle: null,
      description: NEW_DESC,
      format: "Медитация",
      is_free: true,
      price: 0,
    }),
  });

  console.log("2) PATCH audio (as Save now does for each item)");
  const audioPatch = await api(
    token,
    `/api/author/products/${PRACTICE_ID}/audio/${AUDIO_ID}`,
    {
      method: "PATCH",
      body: JSON.stringify({ title: NEW_AUDIO, description: null }),
    },
  );

  console.log("3) GET product (as reloadSavedProduct)");
  const reload = await api(token, `/api/author/products/${PRACTICE_ID}`);

  const db = await readDb(env);

  const ok =
    productPatch.status === 200 &&
    audioPatch.status === 200 &&
    reload.status === 200 &&
    reload.json?.product?.practice?.description === NEW_DESC &&
    reload.json?.product?.audio_items?.[0]?.title === NEW_AUDIO &&
    db.practice?.description === NEW_DESC &&
    db.audio?.title === NEW_AUDIO &&
    db.audio?.status === "published";

  console.log(JSON.stringify({ productPatch: productPatch.status, audioPatch: audioPatch.status, reload: reload.status, db, ok }, null, 2));

  if (!ok) {
    process.exit(1);
  }

  console.log("Verification passed. Values left in DB for manual UI check.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
