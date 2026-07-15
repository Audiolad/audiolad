#!/usr/bin/env node
/**
 * Diagnostic: trace save path for Kod Prityazheniya product.
 * Does not print secrets.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const PRACTICE_ID = "41f31832-e9e2-4e22-bb05-729bbc57c815";
const AUDIO_ID = "04aa4179-bdeb-4a2d-b223-c20d5cdff3d6";
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";

const TEST_DESC = "TEST-PRODUCT-DESCRIPTION-20260715-1053";
const TEST_AUDIO = "TEST-AUDIO-TITLE-20260715-1053";

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

async function api(token, path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

async function readDb(env) {
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: practice } = await admin
    .from("practices")
    .select("id, description, updated_at")
    .eq("id", PRACTICE_ID)
    .maybeSingle();

  const { data: audio } = await admin
    .from("audio_items")
    .select("id, title, status, updated_at")
    .eq("id", AUDIO_ID)
    .maybeSingle();

  return { practice, audio };
}

async function main() {
  const env = loadEnv();
  const token = await getOwnerSession(env);

  console.log("=== BEFORE PATCH (service role) ===");
  console.log(JSON.stringify(await readDb(env), null, 2));

  const productPayload = {
    title: "Код Притяжения",
    subtitle: null,
    description: TEST_DESC,
    format: "Медитация",
    is_free: true,
    price: 0,
  };

  console.log("\n=== PATCH product ===");
  const patchProduct = await api(token, `/api/author/products/${PRACTICE_ID}`, {
    method: "PATCH",
    body: JSON.stringify(productPayload),
  });
  console.log("status:", patchProduct.status);
  console.log(
    "response description:",
    patchProduct.json?.product?.practice?.description ?? patchProduct.json?.error,
  );

  console.log("\n=== PATCH audio (simulating blur save) ===");
  const patchAudio = await api(
    token,
    `/api/author/products/${PRACTICE_ID}/audio/${AUDIO_ID}`,
    {
      method: "PATCH",
      body: JSON.stringify({ title: TEST_AUDIO }),
    },
  );
  console.log("status:", patchAudio.status);
  console.log(
    "response audio title:",
    patchAudio.json?.product?.audio_items?.[0]?.title ?? patchAudio.json?.error,
  );

  console.log("\n=== GET product ===");
  const getProduct = await api(token, `/api/author/products/${PRACTICE_ID}`);
  console.log("status:", getProduct.status);
  console.log("description:", getProduct.json?.product?.practice?.description);
  console.log("audio title:", getProduct.json?.product?.audio_items?.[0]?.title);

  console.log("\n=== AFTER PATCH (service role) ===");
  console.log(JSON.stringify(await readDb(env), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
