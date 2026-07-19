#!/usr/bin/env node
/** API + UI continuation for staging smoke (server must be on :3060) */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { assertProductionFixturesAllowed } from "./lib/guard-production-fixtures.mjs";

assertProductionFixturesAllowed({
  scriptName: "scripts/tmp-promo-staging-api-ui.mjs",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:8000",
});

const APP_BASE = "http://127.0.0.1:3060";
const fixtures = JSON.parse(readFileSync("/tmp/audiolad-promo-staging-fixtures.json", "utf8"));
const env = Object.fromEntries(
  readFileSync("/tmp/audiolad-promo-staging.env", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const results = { pass: [], fail: [] };
const pass = (n) => { results.pass.push(n); console.log("PASS", n); };
const fail = (n, e) => { results.fail.push({ n, e: String(e) }); console.log("FAIL", n, e); };

async function http(method, path, { token, body } = {}) {
  const r = await fetch(`${APP_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, text, json };
}

async function apiMatrix() {
  const { authorA, authorB, products, suffix } = fixtures;
  const tokenA = fixtures.userA.token;
  const tokenB = fixtures.userB.token;

  let r = await http("GET", `/api/author/promotion/pages?author_id=${authorA.id}`);
  if (r.status !== 401) fail("api unauth", r.status); else pass("api unauth 401");

  r = await http("GET", `/api/author/promotion/pages?author_id=${authorA.id}`, { token: tokenA });
  if (r.status !== 200) fail("api list A", r.status); else pass("api list A 200");

  r = await http("GET", `/api/author/promotion/pages?author_id=${authorA.id}`, { token: tokenB });
  if (r.status !== 403 && r.status !== 404) fail("api list wrong", r.status); else pass("api list wrong author denied");

  r = await http("POST", "/api/author/promotion/pages", { body: "not-json" });
  if (r.status !== 400) fail("api malformed", r.status); else pass("api malformed 400");

  r = await http("POST", "/api/author/promotion/pages", {
    token: tokenA,
    body: {
      author_id: authorA.id,
      internal_name: "API Draft",
      public_title: "API Public",
      slug: `api-${suffix}`,
      cta_href: "/catalog",
      practice_ids: [products.eligibleFree],
    },
  });
  if (r.status !== 201) fail("api create", `${r.status} ${r.text.slice(0,200)}`);
  else pass("api create 201");
  const pageId = r.json.page.id;

  r = await http("POST", "/api/author/promotion/pages", {
    token: tokenA,
    body: {
      author_id: authorA.id,
      internal_name: "Dup",
      public_title: "Dup",
      slug: `api-${suffix}`,
      practice_ids: [products.eligibleFree],
    },
  });
  if (r.status !== 409 && r.status !== 400) fail("api dup slug", r.status); else pass("api dup slug rejected");

  r = await http("POST", "/api/author/promotion/pages", {
    token: tokenA,
    body: {
      author_id: authorA.id,
      internal_name: "Evil",
      public_title: "Evil",
      slug: `evil-${suffix}`,
      cta_href: "https://evil.example",
      practice_ids: [products.eligibleFree],
    },
  });
  if (r.status !== 400) fail("api evil cta", r.status); else pass("api evil cta 400");

  r = await http("GET", `/api/author/promotion/pages/${pageId}`, { token: tokenB });
  if (r.status !== 403 && r.status !== 404) fail("api get wrong", r.status); else pass("api get wrong author denied");

  r = await http("GET", `/api/author/promotion/pages/${pageId}`, { token: tokenA });
  if (r.status !== 200) fail("api get", r.status); else pass("api get 200");

  r = await http("PATCH", `/api/author/promotion/pages/${pageId}`, { token: tokenA, body: { status: "published" } });
  if (r.status !== 400) fail("api status inject", r.status); else pass("api status inject 400");

  r = await http("PATCH", `/api/author/promotion/pages/${pageId}`, { token: tokenA, body: { public_title: "Updated API Title" } });
  if (r.status !== 200) fail("api patch", r.status); else pass("api patch 200");

  r = await http("GET", `/api/author/promotion/pages/eligible-products?author_id=${authorA.id}`, { token: tokenA });
  const ids = (r.json?.products ?? []).map((p) => p.id);
  if (r.status !== 200 || !ids.includes(products.eligibleFree) || ids.includes(products.ineligible)) fail("api eligible", r.status);
  else pass("api eligible products");

  r = await http("POST", `/api/author/promotion/pages/${pageId}/publish`, { token: tokenA });
  if (r.status !== 200 || r.json?.page?.status !== "published") fail("api publish", r.status);
  else pass("api publish 200");

  r = await http("PATCH", `/api/author/promotion/pages/${pageId}`, { token: tokenA, body: { public_title: "Locked" } });
  if (r.status !== 409) fail("api edit published", r.status); else pass("api edit published 409");

  r = await http("POST", `/api/author/promotion/pages/${pageId}/unpublish`, { token: tokenA });
  if (r.status !== 200) fail("api unpublish", r.status); else pass("api unpublish 200");

  const publicPath = `/promo/${authorA.slug}/api-${suffix}`;
  r = await http("GET", publicPath);
  fixtures.publicPath = publicPath;
  fixtures.publicPathStatus = r.status;
  fixtures.apiPageId = pageId;
  writeFileSync("/tmp/audiolad-promo-staging-fixtures.json", JSON.stringify(fixtures, null, 2));
  pass(`public route gap status=${r.status}`);
}

async function uiSmoke() {
  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const browser = await chromium.launch({ headless: true });
  for (const [label, w, h] of [["desktop", 1440, 900], ["mobile", 390, 844], ["mobile320", 320, 568]]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, baseURL: APP_BASE });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await context.addCookies([{
      name: `sb-${ref}-auth-token`,
      value: JSON.stringify({
        access_token: fixtures.userA.token,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "staging-smoke",
        user: { id: fixtures.userA.id, email: fixtures.userA.email },
      }),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    }]);
    const resp = await page.goto(`/author-dashboard/promotion?author=${fixtures.authorA.id}&tab=pages`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const status = resp?.status() ?? 0;
    const text = await page.locator("body").innerText();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2);
    if (status >= 500) fail(`${label} load`, status); else pass(`${label} load ${status}`);
    if (!/промо|страниц|Продвижение/i.test(text)) fail(`${label} content`, "missing promo UI"); else pass(`${label} promo UI visible`);
    if (!overflow) fail(`${label} overflow`, "horizontal overflow"); else pass(`${label} no overflow`);
    if (errors.length) fail(`${label} console`, errors.join("; ")); else pass(`${label} no console errors`);
    await context.close();
  }
  await browser.close();
}

await apiMatrix();
try {
  await uiSmoke();
} catch (e) {
  fail("ui playwright", e);
}

writeFileSync("/tmp/audiolad-promo-staging-api-ui-results.json", JSON.stringify(results, null, 2));
if (results.fail.length) process.exit(1);
