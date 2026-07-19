#!/usr/bin/env node
/**
 * Interactive admin user deletion UI check with hydrated production server.
 *
 * Usage:
 *   node scripts/admin-users-deletion-interactive-check.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const BASE = process.argv[2] ?? "http://127.0.0.1:3020";
const OUT_DIR = path.join(
  process.cwd(),
  "scripts/screenshots/admin-users-deletion",
);
const PREFIX = "admin-delete-check";

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

async function getAuthCookies(baseUrl, email) {
  const env = loadEnv();
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
    email,
  });

  if (error || !linkData?.properties?.hashed_token) {
    throw new Error(`auth_link_failed:${email}`);
  }

  const { data, error: verifyError } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  if (verifyError || !data.session) {
    throw new Error(`auth_verify_failed:${email}`);
  }

  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const host = new URL(baseUrl).hostname;
  const cookieBase = {
    domain: host,
    path: "/",
    httpOnly: false,
    secure: host !== "localhost" && host !== "127.0.0.1",
    sameSite: "Lax",
  };

  const payload = JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: "bearer",
    user: data.session.user,
  });

  return [
    {
      ...cookieBase,
      name: `sb-${projectRef}-auth-token`,
      value: encodeURIComponent(payload),
    },
  ];
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function dismissConsent(page) {
  for (const name of ["Разрешить", "Отклонить"]) {
    const button = page.getByRole("button", { name });
    if (await button.count()) {
      await button.first().click({ timeout: 3000 }).catch(() => {});
      return;
    }
  }
}

async function selectDeletableRow(page, testId) {
  const checkbox = page.getByTestId(testId);
  await checkbox.waitFor({ state: "visible", timeout: 30000 });

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await checkbox.check();
    const bulkVisible = await page
      .getByRole("button", { name: /Удалить выбранных \(\d+\)/ })
      .isVisible()
      .catch(() => false);

    if (bulkVisible) {
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new Error(`row_selection_not_hydrated:${testId}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const env = loadEnv();
  const service = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const tempEmail = `${PREFIX}-${randomUUID()}@audiolad.test`;
  let tempUserId = null;

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: tempEmail,
    password: `Check-${randomUUID()}-Aa1!`,
    email_confirm: true,
    user_metadata: {
      first_name: "Delete",
      last_name: "Check",
      full_name: "Delete Check",
    },
  });

  if (createError || !created.user?.id) {
    throw new Error(`temp_user_create_failed:${createError?.message ?? "missing_user"}`);
  }

  tempUserId = created.user.id;
  const checks = [];

  try {
    const browser = await chromium.launch({ headless: true });
    const cookies = await getAuthCookies(BASE, "1@audiolad.ru");
    const consentInitScript = () => {
      window.localStorage.setItem("audiolad_analytics_cookies", "denied");
    };
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    await desktopContext.addInitScript(consentInitScript);
    await desktopContext.addCookies(cookies);
    const page = await desktopContext.newPage();

    await page.goto(`${BASE}/admin/users?q=${encodeURIComponent(tempEmail)}`, {
      waitUntil: "networkidle",
    });
    await dismissConsent(page);
    await page.getByRole("heading", { name: "Пользователи" }).waitFor();

    const ownerSearch = page.goto(`${BASE}/admin/users?q=1%40audiolad.ru`, {
      waitUntil: "networkidle",
    });
    await ownerSearch;
    await dismissConsent(page);
    const ownerDisabled = page.locator("tbody input[type='checkbox']:disabled").first();
    assert((await ownerDisabled.count()) > 0, "owner row has disabled checkbox");
    checks.push("protected_owner_disabled");

    await page.goto(`${BASE}/admin/users?q=${encodeURIComponent(tempEmail)}`, {
      waitUntil: "networkidle",
    });
    await dismissConsent(page);
    await page.getByRole("heading", { name: "Пользователи" }).waitFor();

    await selectDeletableRow(page, `admin-user-select-${tempUserId}`);
    checks.push("single_row_selection");

    await page.screenshot({
      path: path.join(OUT_DIR, "desktop-selected-users.png"),
      fullPage: true,
    });

    await page.getByRole("button", { name: /Удалить выбранных \(1\)/ }).click();
    await page.getByRole("heading", { name: "Удалить выбранных пользователей?" }).waitFor();
    const focusedTag = await page.evaluate(
      () => document.activeElement?.textContent?.trim() ?? "",
    );
    assert(focusedTag === "Отмена", "modal focuses cancel button");
    checks.push("bulk_modal_focus");

    await page.screenshot({
      path: path.join(OUT_DIR, "desktop-bulk-delete-modal.png"),
      fullPage: true,
    });

    await page.keyboard.press("Escape");
    await page
      .getByRole("heading", { name: "Удалить выбранных пользователей?" })
      .waitFor({ state: "hidden" });
    checks.push("bulk_modal_escape");

    await page
      .getByRole("button", { name: "Действия для Delete Check" })
      .click();
    await page.getByRole("menuitem", { name: "Удалить пользователя" }).click();
    await page.getByRole("heading", { name: "Удалить пользователя?" }).waitFor();
    await page.getByRole("button", { name: "Отмена" }).click();
    checks.push("single_modal_cancel");

    const selectAll = page.getByRole("checkbox", {
      name: "Выбрать всех пользователей на странице",
    });
    await selectAll.check();
    const bulkCount = await page.getByRole("button", { name: /Удалить выбранных/ }).innerText();
    assert(/Удалить выбранных \(1\)/.test(bulkCount), "select all current page only");
    checks.push("select_all_current_page");

    await page.goto(`${BASE}/admin/users?q=${encodeURIComponent(tempEmail)}&page=1`, {
      waitUntil: "networkidle",
    });
    await dismissConsent(page);
    await page.getByTestId(`admin-user-select-${tempUserId}`).waitFor({
      state: "visible",
    });
    assert(
      (await page.getByRole("button", { name: /Удалить выбранных/ }).count()) === 0,
      "selection resets after navigation",
    );
    checks.push("selection_reset");

    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await mobileContext.addInitScript(consentInitScript);
    await mobileContext.addCookies(cookies);
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${BASE}/admin/users?q=${encodeURIComponent(tempEmail)}`, {
      waitUntil: "networkidle",
    });
    await dismissConsent(mobilePage);
    await selectDeletableRow(mobilePage, `admin-user-select-mobile-${tempUserId}`);
    await mobilePage.getByRole("button", { name: /Удалить выбранных \(1\)/ }).click();
    await mobilePage
      .getByRole("heading", { name: "Удалить выбранных пользователей?" })
      .waitFor();
    await mobilePage.screenshot({
      path: path.join(OUT_DIR, "mobile-bulk-delete-modal.png"),
      fullPage: true,
    });
    checks.push("mobile_bulk_modal");

    await mobilePage.getByRole("dialog").getByRole("button", { name: "Удалить", exact: true }).click();
    await mobilePage.getByRole("status").waitFor({ timeout: 15000 });
    tempUserId = null;

    const { data: profileAfterDelete } = await service
      .from("profiles")
      .select("id")
      .eq("id", created.user.id)
      .maybeSingle();
    assert(!profileAfterDelete, "profile removed after UI delete");

    const { data: authAfterDelete } = await service.auth.admin.getUserById(
      created.user.id,
    );
    assert(!authAfterDelete.user, "auth user removed after UI delete");
    checks.push("ui_delete_persisted");

    await browser.close();

    writeFileSync(
      path.join(OUT_DIR, "interactive-results.json"),
      JSON.stringify({ base: BASE, checks, tempEmail }, null, 2),
    );

    console.log(
      JSON.stringify({ ok: true, base: BASE, checks, screenshotsDir: OUT_DIR }, null, 2),
    );
  } finally {
    if (tempUserId) {
      await service.auth.admin.deleteUser(tempUserId).catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error("admin-users-deletion-interactive-check failed:", error.message ?? error);
  process.exit(1);
});
