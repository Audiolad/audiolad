#!/usr/bin/env node
/**
 * Authenticated smoke for promo pages block on /author-dashboard/promotion.
 * Read-only: does not create promo pages or fixtures.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3001";

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function getAuthorSession(env) {
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
    throw new Error("author_session_failed");
  }

  const { data, error: verifyError } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  if (verifyError || !data.session?.access_token) {
    throw new Error("author_verify_failed");
  }

  return data.session;
}

async function getAuthorWorkspaces(accessToken) {
  const response = await fetch(`${BASE}/api/author/authors`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return payload.authors ?? [];
}

async function main() {
  const env = loadEnv();
  const session = await getAuthorSession(env);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const host = new URL(BASE).hostname;
  const cookieBase = {
    domain: host,
    path: "/",
    httpOnly: false,
    secure: host !== "localhost" && host !== "127.0.0.1",
    sameSite: "Lax",
  };

  await context.addCookies([
    {
      ...cookieBase,
      name: `sb-${projectRef}-auth-token`,
      value: JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
        user: session.user,
      }),
    },
  ]);

  const health = await fetch(`${BASE}/author-dashboard/promotion`, {
    redirect: "manual",
  }).catch(() => null);

  assert(health && health.status !== 0, `candidate app unreachable at ${BASE}`);

  await page.goto(`${BASE}/author-dashboard/promotion`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });

  assert(!page.url().includes("/auth/sign-in"), "authenticated user reached promotion page");

  const bodyText = await page.locator("body").innerText();
  assert(bodyText.includes("Промостраницы"), "promo pages section visible");
  assert(
    bodyText.includes("Создавайте посадочные страницы с одной, двумя или тремя практиками."),
    "promo pages subtitle visible",
  );
  assert(bodyText.includes("Создать промостраницу"), "create promo page button visible");
  assert(bodyText.includes("Кампании"), "campaigns section still visible");
  assert(bodyText.includes("Статистика"), "stats section still visible");

  const createButton = page.getByRole("button", { name: "Создать промостраницу" }).first();
  await createButton.click();
  await page.waitForURL(/\?page=new/, { timeout: 15000 });

  const formText = await page.locator("body").innerText();
  assert(formText.includes("промостраниц") || formText.includes("Промостраниц"), "create form opened");

  await page.goBack({ waitUntil: "networkidle" });
  assert(page.url().includes("/author-dashboard/promotion"), "back returns to promotion page");
  assert(!page.url().includes("page=new"), "create form closed after back");

  const authorSelect = page.locator('select').first();
  const optionCount = await authorSelect.locator("option").count();

  if (optionCount > 1) {
    const firstSlug = await authorSelect.locator("option").nth(0).getAttribute("value");
    const secondSlug = await authorSelect.locator("option").nth(1).getAttribute("value");

    await authorSelect.selectOption(secondSlug ?? "");
    await page.waitForURL(new RegExp(`author=${secondSlug}`), { timeout: 15000 });

    const pagesRequest = page.waitForRequest(
      (request) =>
        request.url().includes("/api/author/promotion/pages?author_id=") &&
        request.method() === "GET",
      { timeout: 15000 },
    );
    await page.reload({ waitUntil: "networkidle" });
    await pagesRequest;

    await authorSelect.selectOption(firstSlug ?? "");
    await page.waitForURL(new RegExp(`author=${firstSlug}`), { timeout: 15000 });
  }

  await browser.close();
  console.log("author-promotion-promo-pages-auth-smoke: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
