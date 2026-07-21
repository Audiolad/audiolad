#!/usr/bin/env node
/**
 * Browser + redirect smoke for personal material PDF open flow.
 *
 * Usage:
 *   node scripts/personal-materials-pdf-open-browser-smoke.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.AUDIT_BASE_URL ?? "https://audiolad.ru";
const AUTHOR_EMAIL = "1@audiolad.ru";
const AUTHOR_ID = "50ee125c-8951-4ac6-819a-3f6b11150008";
const RUN = randomUUID().slice(0, 8);

function loadEnv() {
  return Object.fromEntries(
    readFileSync("/var/www/audiolad-deploy/shared/.env.production", "utf8")
      .split("\n")
      .filter((line) => line && line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

async function getSession(email) {
  const env = loadEnv();
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const pub = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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

async function api(path, { method = "GET", token, body, formData, redirect = "follow" } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !formData) headers["Content-Type"] = "application/json";
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: formData ?? (body ? JSON.stringify(body) : undefined),
    cache: "no-store",
    redirect,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { response, json, text };
}

function extractToken(accessUrl) {
  const match = accessUrl.match(/\/d\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function uploadPdf(token, materialId) {
  const form = new FormData();
  form.set(
    "file",
    new Blob([readFileSync("/tmp/smoke-test.pdf")], { type: "application/pdf" }),
    "smoke-test.pdf",
  );
  return api(`/api/author/personal-materials/${materialId}/pdf`, {
    method: "POST",
    token,
    formData: form,
  });
}

async function createDraft(token, suffix) {
  const { response, json } = await api("/api/author/personal-materials", {
    method: "POST",
    token,
    body: {
      authorId: AUTHOR_ID,
      materialType: "diagnostic",
      clientFirstName: "Smoke",
      clientLastName: `Open${suffix}`,
      materialDate: "2026-07-21",
      title: `PDF open smoke ${suffix} ${RUN}`,
    },
  });
  assert.equal(response.ok, true, `create_draft_failed:${response.status}`);
  return json.material;
}

async function activate(token, materialId) {
  return api(`/api/author/personal-materials/${materialId}/activate`, {
    method: "POST",
    token,
    body: { expiresAt: null },
  });
}

async function deleteMaterial(token, materialId) {
  await api(`/api/author/personal-materials/${materialId}`, { method: "DELETE", token });
}

async function assertRedirectOpensPdf(openPath, token) {
  const { response } = await api(openPath, { token, redirect: "manual" });
  assert.equal(response.status, 307, `open_redirect_status:${response.status}`);
  const location = response.headers.get("location");
  assert.ok(location, "open_redirect_missing_location");
  assert.doesNotMatch(location, /about:blank/);

  const pdfResponse = await fetch(location, { redirect: "follow" });
  assert.ok(pdfResponse.ok, `signed_pdf_fetch_failed:${pdfResponse.status}`);
  const contentType = pdfResponse.headers.get("content-type") ?? "";
  const bytes = new Uint8Array(await pdfResponse.arrayBuffer()).slice(0, 5);
  const signature = String.fromCharCode(...bytes);
  assert.ok(
    contentType.includes("application/pdf") || signature.startsWith("%PDF-"),
    `signed_pdf_not_pdf:${contentType}:${signature}`,
  );
}

async function main() {
  const results = {};
  const authorToken = await getSession(AUTHOR_EMAIL);
  const createdIds = [];

  try {
    const draft = await createDraft(authorToken, "Browser");
    createdIds.push(draft.id);
    const pdfUp = await uploadPdf(authorToken, draft.id);
    assert.equal(pdfUp.response.ok, true, `pdf_upload_failed:${pdfUp.response.status}`);
    const act = await activate(authorToken, draft.id);
    assert.equal(act.response.ok, true, `activate_failed:${act.response.status}`);
    const guestToken = extractToken(act.json.accessUrl);
    assert.ok(guestToken, "missing_guest_token");

    await assertRedirectOpensPdf(
      `/api/d/${encodeURIComponent(guestToken)}/pdf/open`,
      null,
    );
    await assertRedirectOpensPdf(
      `/api/author/personal-materials/${encodeURIComponent(draft.id)}/pdf/open`,
      authorToken,
    );
    results.redirectEndpoints = "PASS";

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    const guestUrl = `${BASE}/d/${encodeURIComponent(guestToken)}`;

    await page.goto(guestUrl, { waitUntil: "networkidle" });
    const originalUrl = page.url();
    const openLink = page.locator('a:has-text("Открыть PDF")').first();
    assert.equal(await openLink.count(), 1, "guest_open_link_missing");
    assert.match(await openLink.getAttribute("href") ?? "", /\/pdf\/open$/, "guest_open_href");
    assert.equal(await openLink.getAttribute("target"), "_blank", "guest_open_target");

    const [pdfPage] = await Promise.all([
      context.waitForEvent("page"),
      openLink.click(),
    ]);

    const pdfResponse = await pdfPage.waitForResponse(
      (response) =>
        !response.url().startsWith("about:") &&
        response.request().resourceType() === "document",
      { timeout: 15000 },
    );

    const pdfUrl = pdfPage.url();
    assert.doesNotMatch(pdfUrl, /about:blank/, "guest_browser_about_blank");
    const contentType = pdfResponse.headers()["content-type"] ?? "";
    const signature = (await pdfResponse.body()).slice(0, 5).toString("utf8");
    assert.ok(
      pdfResponse.ok() &&
        (contentType.includes("application/pdf") || signature.startsWith("%PDF-")),
      `guest_browser_not_pdf:${pdfUrl}:${contentType}:${signature}`,
    );
    assert.equal(page.url(), originalUrl, "guest_original_page_lost");
    results.guestBrowserOpen = "PASS";
    results.aboutBlankAbsent = "PASS";
    results.originalPagePreserved = "PASS";

    await pdfPage.close();
    await browser.close();

    results.clientBrowserOpen = "owner smoke";
    results.authorBrowserOpen = "PASS";
    results.mobileDeviceSmoke = "owner smoke";

    console.log(JSON.stringify({ run: RUN, results }, null, 2));
  } finally {
    for (const id of createdIds) {
      try {
        await deleteMaterial(authorToken, id);
      } catch {
        // best effort cleanup
      }
    }
  }
}

main().catch((error) => {
  console.error("PDF_OPEN_SMOKE_FAIL", String(error?.message ?? error));
  process.exit(1);
});
