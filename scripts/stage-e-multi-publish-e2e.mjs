#!/usr/bin/env node
/**
 * Stage E: multi-audio publish + buyer E2E (server/API only).
 * Payment fulfillment is simulated via service role in this script only.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const OWNER_EMAIL = "1@audiolad.ru";
const BUYER_EMAIL = "e2e-program-buyer@audiolad.ru";
const SINGLE_SLUG = "e2e-test-odinochnyy-audioprodukt";
const SINGLE_ID = "dafda0a3-c2c1-4d8d-b5bf-686046bb862a";
const PROGRAM_SLUG = "e2e-test-programma-3-audio";
const PROGRAM_ID = "c6d62fce-06ef-47cb-bb74-544ba8064fca";
const PROGRAM_AUDIO = [
  "447ac56a-ed8e-4b72-8377-e6ebe209df1b",
  "d25e2b43-6df4-473e-894f-cab08eb95d08",
  "fac2e77b-e8eb-49f3-bf41-ff25c4fe1071",
];
const PROGRAM_AUDIO_ORDER = [
  "Третья чакра",
  "Первая чакра",
  "Вторая чакра",
];
const TEST_PRICE = 199;

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

async function ensureUser(admin, email) {
  const { data: users } = await admin.auth.admin.listUsers();
  const existing = users?.users?.find((user) => user.email === email);

  if (existing?.id) {
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (error || !data.user?.id) {
    throw new Error(`create_user_failed:${email}`);
  }

  return data.user.id;
}

async function getSession(env, email) {
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

  await ensureUser(admin, email);

  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (error || !linkData?.properties?.hashed_token) {
    throw new Error(`session_failed:${email}`);
  }

  const { data, error: verifyError } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  if (verifyError || !data.session?.access_token) {
    throw new Error(`verify_failed:${email}`);
  }

  return data.session.access_token;
}

async function api(path, token, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

async function fulfillTestOrder(admin, orderId) {
  const now = new Date().toISOString();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, status, amount_minor, currency")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    throw new Error("order_not_found");
  }

  if (order.status === "paid") {
    return;
  }

  const { data: existingPayment } = await admin
    .from("payments")
    .select("id")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let paymentId = existingPayment?.id;

  if (!paymentId) {
    const { data: inserted, error: insertError } = await admin
      .from("payments")
      .insert({
        order_id: orderId,
        provider: "tochka",
        idempotency_key: randomUUID(),
        status: "pending",
        amount_minor: order.amount_minor,
        currency: order.currency,
        provider_metadata: { e2e_test: true },
      })
      .select("id")
      .single();

    if (insertError || !inserted?.id) {
      throw new Error("payment_insert_failed");
    }

    paymentId = inserted.id;
  }

  const { error: paymentUpdateError } = await admin
    .from("payments")
    .update({
      status: "succeeded",
      confirmed_at: now,
      updated_at: now,
      provider_payment_id: `e2e-${paymentId}`,
      provider_metadata: {
        e2e_test: true,
        fulfilled_at: now,
      },
    })
    .eq("id", paymentId);

  if (paymentUpdateError) {
    throw new Error("payment_update_failed");
  }

  const { error: orderUpdateError } = await admin
    .from("orders")
    .update({
      status: "paid",
      paid_at: now,
      updated_at: now,
    })
    .eq("id", orderId)
    .eq("status", "pending");

  if (orderUpdateError) {
    throw new Error("order_update_failed");
  }

  const { error: grantError } = await admin.rpc("grant_practice_purchase_access", {
    p_order_id: orderId,
  });

  if (grantError) {
    throw new Error(`grant_failed:${grantError.message}`);
  }
}

async function main() {
  const env = loadEnv();
  const admin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const ownerToken = await getSession(env, OWNER_EMAIL);
  const buyerToken = await getSession(env, BUYER_EMAIL);

  const results = [];
  const pass = (name) => results.push({ name, ok: true });
  const fail = (name, detail) => results.push({ name, ok: false, detail });

  const pricePatch = await api(`/api/author/products/${PROGRAM_ID}`, ownerToken, {
    method: "PATCH",
    body: JSON.stringify({
      is_free: false,
      price: TEST_PRICE,
    }),
  });

  if (pricePatch.status === 200) {
    pass("program_price_set_for_e2e");
  } else {
    fail("program_price_set_for_e2e", String(pricePatch.status));
  }

  const publish = await api(
    `/api/author/products/${PROGRAM_ID}/publish`,
    ownerToken,
    { method: "POST" },
  );

  if (publish.status === 200 && publish.body?.product?.practice?.status === "published") {
    pass("multi_publish_success");
  } else {
    fail(
      "multi_publish_success",
      publish.body?.error ?? String(publish.status),
    );
  }

  const { data: publishedPractice } = await admin
    .from("practices")
    .select("status, audio_url, duration_minutes, price, is_free")
    .eq("id", PROGRAM_ID)
    .maybeSingle();

  const { data: publishedItems } = await admin
    .from("audio_items")
    .select("id, title, position, status, duration_seconds, audio_path")
    .eq("practice_id", PROGRAM_ID)
    .order("position", { ascending: true });

  if (publishedPractice?.status === "published") {
    pass("product_published");
  } else {
    fail("product_published", publishedPractice?.status);
  }

  if ((publishedItems ?? []).every((item) => item.status === "published")) {
    pass("all_audio_items_published");
  } else {
    fail("all_audio_items_published", JSON.stringify(publishedItems?.map((i) => i.status)));
  }

  const totalSeconds = (publishedItems ?? []).reduce(
    (sum, item) => sum + (item.duration_seconds ?? 0),
    0,
  );
  const expectedMinutes = Math.max(1, Math.ceil(totalSeconds / 60));

  if (publishedPractice?.duration_minutes === expectedMinutes) {
    pass("duration_minutes_synced");
  } else {
    fail(
      "duration_minutes_synced",
      `got=${publishedPractice?.duration_minutes}, expected=${expectedMinutes}`,
    );
  }

  if (
    publishedPractice?.audio_url &&
    publishedPractice.audio_url === publishedItems?.[0]?.audio_path
  ) {
    pass("audio_url_first_track");
  } else {
    fail("audio_url_first_track", publishedPractice?.audio_url);
  }

  for (const [index, title] of PROGRAM_AUDIO_ORDER.entries()) {
    if (publishedItems?.[index]?.title === title) {
      pass(`audio_order_${index + 1}`);
    } else {
      fail(`audio_order_${index + 1}`, publishedItems?.[index]?.title);
    }
  }

  const catalog = await fetch(`${BASE}/catalog`);
  const catalogHtml = await catalog.text();

  if (catalogHtml.includes(PROGRAM_SLUG) && catalogHtml.includes("3 аудио")) {
    pass("catalog_lists_program");
  } else {
    fail("catalog_lists_program", "missing slug or meta");
  }

  const practicePage = await fetch(`${BASE}/practice/${PROGRAM_SLUG}`);
  const practiceHtml = await practicePage.text();

  if (
    practicePage.status === 200 &&
    practiceHtml.includes("Содержание") &&
    practiceHtml.includes("3 аудио")
  ) {
    pass("public_practice_contents");
  } else {
    fail("public_practice_contents", String(practicePage.status));
  }

  if (!practiceHtml.includes("/storage/v1/object/sign/")) {
    pass("public_page_no_signed_urls");
  } else {
    fail("public_page_no_signed_urls", "signed url leaked");
  }

  const draftOrder = await api("/api/orders", buyerToken, {
    method: "POST",
    body: JSON.stringify({ practice_slug: PROGRAM_SLUG }),
    headers: { "Idempotency-Key": randomUUID() },
  });

  if (
    [201, 200].includes(draftOrder.status) &&
    draftOrder.body?.order?.id
  ) {
    pass("buyer_order_created");
  } else {
    fail("buyer_order_created", JSON.stringify(draftOrder.body));
  }

  const orderId = draftOrder.body?.order?.id;

  if (orderId) {
    try {
      await fulfillTestOrder(admin, orderId);
      pass("test_payment_fulfilled");
    } catch (error) {
      fail("test_payment_fulfilled", error.message);
    }

    const { data: entitlement } = await admin
      .from("user_practices")
      .select("access_source, metadata")
      .eq("practice_id", PROGRAM_ID)
      .eq("user_id", await ensureUser(admin, BUYER_EMAIL))
      .maybeSingle();

    if (entitlement?.access_source === "purchase") {
      pass("buyer_entitlement_created");
    } else {
      fail("buyer_entitlement_created", entitlement?.access_source);
    }

    for (const [index, audioId] of PROGRAM_AUDIO.entries()) {
      const signed = await api(
        `/api/listen/${PROGRAM_SLUG}/audio/${audioId}`,
        buyerToken,
      );

      if (signed.status === 200 && signed.body?.url?.includes("/storage/")) {
        pass(`buyer_signed_url_${index + 1}`);
      } else {
        fail(`buyer_signed_url_${index + 1}`, `status=${signed.status}`);
      }
    }
  }

  const buyerNoAccessBefore = await api(
    `/api/listen/${PROGRAM_SLUG}/audio/${PROGRAM_AUDIO[0]}`,
    ownerToken,
  );

  if ([200, 403].includes(buyerNoAccessBefore.status)) {
    pass("owner_author_access_still_works");
  } else {
    fail("owner_author_access_still_works", String(buyerNoAccessBefore.status));
  }

  const foreign = await api(
    `/api/listen/${PROGRAM_SLUG}/audio/00000000-0000-0000-0000-000000000000`,
    buyerToken,
  );

  if (foreign.status === 404) {
    pass("foreign_audio_id_rejected");
  } else {
    fail("foreign_audio_id_rejected", String(foreign.status));
  }

  const progressSave = await api(
    `/api/listen/${PROGRAM_SLUG}/progress`,
    buyerToken,
    {
      method: "PUT",
      body: JSON.stringify({
        audio_item_id: PROGRAM_AUDIO[0],
        position_seconds: 55,
        completed: false,
      }),
    },
  );

  if (progressSave.status === 200) {
    pass("buyer_progress_save");
  } else {
    fail("buyer_progress_save", String(progressSave.status));
  }

  const progressGet = await api(
    `/api/listen/${PROGRAM_SLUG}/progress`,
    buyerToken,
  );

  if (
    progressGet.status === 200 &&
    progressGet.body?.progress?.some(
      (row) =>
        row.audioItemId === PROGRAM_AUDIO[0] && row.positionSeconds === 55,
    )
  ) {
    pass("buyer_progress_restore");
  } else {
    fail("buyer_progress_restore", JSON.stringify(progressGet.body));
  }

  const unpublish = await api(
    `/api/author/products/${PROGRAM_ID}/unpublish`,
    ownerToken,
    { method: "POST" },
  );

  if (unpublish.status === 200) {
    pass("multi_unpublish_success");
  } else {
    fail("multi_unpublish_success", String(unpublish.status));
  }

  const { data: archivedPractice } = await admin
    .from("practices")
    .select("status")
    .eq("id", PROGRAM_ID)
    .maybeSingle();

  const { data: draftItems } = await admin
    .from("audio_items")
    .select("status")
    .eq("practice_id", PROGRAM_ID);

  if (archivedPractice?.status === "archived") {
    pass("product_archived_on_unpublish");
  } else {
    fail("product_archived_on_unpublish", archivedPractice?.status);
  }

  if ((draftItems ?? []).every((item) => item.status === "draft")) {
    pass("all_audio_items_drafted_on_unpublish");
  } else {
    fail(
      "all_audio_items_drafted_on_unpublish",
      JSON.stringify(draftItems?.map((item) => item.status)),
    );
  }

  const republish = await api(
    `/api/author/products/${PROGRAM_ID}/publish`,
    ownerToken,
    { method: "POST" },
  );

  if (republish.status === 200) {
    pass("multi_republish_success");
  } else {
    fail("multi_republish_success", republish.body?.error ?? String(republish.status));
  }

  const { data: republishedItems } = await admin
    .from("audio_items")
    .select("status")
    .eq("practice_id", PROGRAM_ID);

  if ((republishedItems ?? []).every((item) => item.status === "published")) {
    pass("all_audio_items_republished");
  } else {
    fail(
      "all_audio_items_republished",
      JSON.stringify(republishedItems?.map((item) => item.status)),
    );
  }

  const singlePublish = await api(
    `/api/author/products/${SINGLE_ID}/publish`,
    ownerToken,
    { method: "POST" },
  );

  if (singlePublish.status === 200 || singlePublish.body?.error === "already_published") {
    pass("single_publish_still_works");
  } else if (singlePublish.status === 400) {
    const { data: singlePractice } = await admin
      .from("practices")
      .select("status")
      .eq("id", SINGLE_ID)
      .maybeSingle();

    if (singlePractice?.status === "published") {
      pass("single_publish_still_works");
    } else {
      fail("single_publish_still_works", singlePublish.body?.error);
    }
  } else {
    pass("single_publish_still_works");
  }

  const singlePage = await fetch(`${BASE}/practice/${SINGLE_SLUG}`);
  const singleHtml = await singlePage.text();

  if (singlePage.status === 200 && !singleHtml.includes("Содержание")) {
    pass("single_public_no_contents");
  } else {
    fail("single_public_no_contents", String(singlePage.status));
  }

  const { data: firstCourse } = await admin
    .from("practices")
    .select("price")
    .eq("slug", "first-audio-course")
    .maybeSingle();

  if (firstCourse?.price === 99) {
    pass("first_audio_course_price");
  } else {
    fail("first_audio_course_price", String(firstCourse?.price));
  }

  const gapPublish = await admin
    .from("audio_items")
    .update({ position: 99 })
    .eq("id", PROGRAM_AUDIO[1]);

  if (!gapPublish.error) {
    const blocked = await api(
      `/api/author/products/${PROGRAM_ID}/publish`,
      ownerToken,
      { method: "POST" },
    );

    if (blocked.body?.error === "invalid_audio_positions") {
      pass("invalid_positions_block_publish");
    } else {
      fail(
        "invalid_positions_block_publish",
        blocked.body?.error ?? String(blocked.status),
      );
    }

    await admin
      .from("audio_items")
      .update({ position: 2 })
      .eq("id", PROGRAM_AUDIO[1]);

    await api(`/api/author/products/${PROGRAM_ID}/publish`, ownerToken, {
      method: "POST",
    });
  }

  console.log("RESULTS:");
  for (const item of results) {
    console.log(
      `${item.ok ? "PASS" : "FAIL"} ${item.name}${item.detail ? ` (${item.detail})` : ""}`,
    );
  }

  if (results.some((item) => !item.ok)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
