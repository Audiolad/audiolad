#!/usr/bin/env node
/**
 * Admin panel verification: SQL stats, access control, applications.
 *
 * Usage:
 *   node scripts/admin-panel-verification.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";

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

function daysAgoIso(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

async function sqlStats(service) {
  const sevenDaysAgo = daysAgoIso(7);
  const thirtyDaysAgo = daysAgoIso(30);

  const [
    usersTotal,
    users7d,
    users30d,
    authorsTotal,
    applicationsTotal,
    applicationsNew,
    publishedPractices,
    completedListens,
    paidOrders,
    revenueResult,
  ] = await Promise.all([
    service.from("profiles").select("*", { count: "exact", head: true }),
    service
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo),
    service
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo),
    service.from("author_members").select("user_id", { count: "exact", head: true }),
    service.from("author_applications").select("*", { count: "exact", head: true }),
    service
      .from("author_applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "submitted"),
    service
      .from("practices")
      .select("*", { count: "exact", head: true })
      .eq("status", "published"),
    service
      .from("practice_audio_progress")
      .select("*", { count: "exact", head: true })
      .eq("completed", true),
    service
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("status", "paid"),
    service.from("orders").select("amount_minor").eq("status", "paid"),
  ]);

  const { data: practices } = await service
    .from("practices")
    .select("id")
    .eq("status", "published");

  let publishedPrograms = 0;

  if (practices?.length) {
    const { data: audioItems } = await service
      .from("audio_items")
      .select("practice_id")
      .in(
        "practice_id",
        practices.map((row) => row.id),
      )
      .eq("status", "published");

    const counts = new Map();

    for (const item of audioItems ?? []) {
      counts.set(item.practice_id, (counts.get(item.practice_id) ?? 0) + 1);
    }

    publishedPrograms = [...counts.values()].filter((count) => count >= 2).length;
  }

  const revenueMinor = (revenueResult.data ?? []).reduce(
    (sum, row) => sum + (typeof row.amount_minor === "number" ? row.amount_minor : 0),
    0,
  );

  return {
    usersTotal: usersTotal.count ?? 0,
    users7d: users7d.count ?? 0,
    users30d: users30d.count ?? 0,
    authorsTotal: authorsTotal.count ?? 0,
    applicationsTotal: applicationsTotal.count ?? 0,
    applicationsNew: applicationsNew.count ?? 0,
    publishedPractices: publishedPractices.count ?? 0,
    publishedPrograms,
    completedListens: completedListens.count ?? 0,
    paidOrders: paidOrders.count ?? 0,
    revenueRub: revenueMinor / 100,
  };
}

async function fetchAdminOverviewNumbers(page) {
  const cards = await page.locator("article").all();
  const result = {};

  for (const card of cards) {
    const label = (await card.locator("p").first().textContent())?.trim() ?? "";
    const valueText = (await card.locator("p").nth(1).textContent())?.trim() ?? "";
    const unavailable = (await card.locator("p").nth(1).textContent())?.includes(
      "не собираются",
    );

    if (label.includes("не собираются") || unavailable) {
      continue;
    }

    const numeric = valueText.replace(/[^\d,.-]/g, "").replace(",", ".");
    const parsed = Number.parseFloat(numeric);

    if (label.includes("выручка")) {
      result.revenueRub = parsed;
    } else if (label.includes("Всего пользователей")) {
      result.usersTotal = parsed;
    } else if (label.includes("7 дней")) {
      result.users7d = parsed;
    } else if (label.includes("30 дней")) {
      result.users30d = parsed;
    } else if (label.includes("авторов")) {
      result.authorsTotal = parsed;
    } else if (label.includes("Новых заявок")) {
      result.applicationsNew = parsed;
    } else if (label.includes("Всего заявок")) {
      result.applicationsTotal = parsed;
    } else if (label.includes("аудиопрактик")) {
      result.publishedPractices = parsed;
    } else if (label.includes("программ")) {
      result.publishedPrograms = parsed;
    } else if (label.includes("Дослушиваний")) {
      result.completedListens = parsed;
    } else if (label.includes("заказов")) {
      result.paidOrders = parsed;
    }
  }

  return result;
}

function assertEq(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

async function main() {
  const env = loadEnv();
  const service = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const stats = await sqlStats(service);
  console.log("sql_stats", stats);

  const { data: ownerProfile } = await service
    .from("profiles")
    .select("id, role")
    .eq("role", "platform_owner")
    .maybeSingle();

  if (!ownerProfile) {
    throw new Error("platform_owner_missing");
  }

  const { data: listenerProfile } = await service
    .from("profiles")
    .select("id, role, email")
    .eq("role", "listener")
    .limit(1)
    .maybeSingle();

  if (!listenerProfile?.email) {
    throw new Error("listener_missing");
  }

  const { data: authorMember } = await service
    .from("author_members")
    .select("user_id")
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  let authorEmail = null;

  if (authorMember?.user_id) {
    const { data: authUser } = await service.auth.admin.getUserById(
      authorMember.user_id,
    );
    authorEmail = authUser.user?.email ?? null;
  }

  const { data: applications } = await service
    .from("author_applications")
    .select("id, status, admin_note, review_comment, user_id")
    .order("submitted_at", { ascending: false });

  const applicationId = applications?.[0]?.id;

  if (!applicationId) {
    throw new Error("application_missing");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });

  try {
    // Owner access
    const ownerCookies = await getAuthCookies(BASE, "1@audiolad.ru");
    await context.addCookies(ownerCookies);

    const ownerPage = await context.newPage();
    await ownerPage.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
    await ownerPage.getByRole("heading", { name: "Платформа" }).waitFor();
    await ownerPage.getByRole("link", { name: "Панель управления" }).waitFor();

    await ownerPage.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await ownerPage.getByRole("heading", { name: "Обзор" }).waitFor();

    const uiStats = await fetchAdminOverviewNumbers(ownerPage);
    console.log("ui_stats", uiStats);

    assertEq("usersTotal", uiStats.usersTotal, stats.usersTotal);
    assertEq("users7d", uiStats.users7d, stats.users7d);
    assertEq("users30d", uiStats.users30d, stats.users30d);
    assertEq("authorsTotal", uiStats.authorsTotal, stats.authorsTotal);
    assertEq("applicationsNew", uiStats.applicationsNew, stats.applicationsNew);
    assertEq("applicationsTotal", uiStats.applicationsTotal, stats.applicationsTotal);
    assertEq("publishedPractices", uiStats.publishedPractices, stats.publishedPractices);
    assertEq("publishedPrograms", uiStats.publishedPrograms, stats.publishedPrograms);
    assertEq("completedListens", uiStats.completedListens, stats.completedListens);
    assertEq("paidOrders", uiStats.paidOrders, stats.paidOrders);
    assertEq("revenueRub", uiStats.revenueRub, stats.revenueRub);

    await ownerPage.goto(`${BASE}/admin/author-applications`, {
      waitUntil: "networkidle",
    });
    const applicationCards = await ownerPage
      .locator("article, tbody tr")
      .count();
    if (applicationCards < stats.applicationsTotal) {
      throw new Error(
        `applications_list: expected at least ${stats.applicationsTotal}, got ${applicationCards}`,
      );
    }

    await ownerPage.goto(`${BASE}/admin/author-applications/${applicationId}`, {
      waitUntil: "networkidle",
    });
    await ownerPage.getByRole("heading", { name: "Данные заявки" }).waitFor();

    const testNote = `admin-note-test-${Date.now()}`;
    await ownerPage.locator('textarea[name="adminNote"]').fill(testNote);
    await ownerPage.getByRole("button", { name: "Сохранить изменения" }).click();
    await ownerPage.getByText("Изменения сохранены.").waitFor();

    const { data: updatedApp } = await service
      .from("author_applications")
      .select("admin_note, review_comment, status")
      .eq("id", applicationId)
      .single();

    if (updatedApp.admin_note !== testNote) {
      throw new Error("admin_note_not_saved");
    }

    if (updatedApp.review_comment === testNote) {
      throw new Error("admin_note_leaked_to_review_comment");
    }

    // Applicant cannot see admin_note
    const applicantId = applications[0].user_id;
    const { data: applicantAuth } = await service.auth.admin.getUserById(applicantId);
    const applicantEmail = applicantAuth.user?.email;

    if (applicantEmail) {
      const applicantContext = await browser.newContext();
      const applicantCookies = await getAuthCookies(BASE, applicantEmail);
      await applicantContext.addCookies(applicantCookies);
      const applicantPage = await applicantContext.newPage();
      await applicantPage.goto(`${BASE}/become-author`, { waitUntil: "networkidle" });
      const pageText = await applicantPage.content();
      if (pageText.includes(testNote)) {
        throw new Error("admin_note_visible_to_applicant");
      }
      await applicantContext.close();
    }

    // Restore admin_note
    await service
      .from("author_applications")
      .update({ admin_note: applications[0].admin_note })
      .eq("id", applicationId);

    await ownerPage.goto(`${BASE}/admin/users`, { waitUntil: "networkidle" });
    await ownerPage.getByRole("heading", { name: "Пользователи" }).waitFor();

    await context.clearCookies();

    // Listener denied
    const listenerCookies = await getAuthCookies(BASE, listenerProfile.email);
    await context.addCookies(listenerCookies);
    const listenerPage = await context.newPage();
    await listenerPage.goto(`${BASE}/profile`, { waitUntil: "networkidle" });
    const platformSection = listenerPage.getByRole("heading", { name: "Платформа" });
    if (await platformSection.count()) {
      throw new Error("listener_sees_platform_section");
    }

    for (const path of [
      "/admin",
      "/admin/users",
      "/admin/author-applications",
      `/admin/author-applications/${applicationId}`,
    ]) {
      const response = await listenerPage.goto(`${BASE}${path}`, {
        waitUntil: "domcontentloaded",
      });
      const body = await listenerPage.content();
      if (response?.status() !== 404 && !body.includes("404")) {
        throw new Error(`listener_access_not_denied:${path}`);
      }
    }

    await context.clearCookies();

    // Author member denied (if distinct from owner)
    if (authorEmail && authorEmail !== "1@audiolad.ru") {
      const authorCookies = await getAuthCookies(BASE, authorEmail);
      await context.addCookies(authorCookies);
      const authorPage = await context.newPage();
      const response = await authorPage.goto(`${BASE}/admin`, {
        waitUntil: "domcontentloaded",
      });
      const body = await authorPage.content();
      if (response?.status() !== 404 && !body.includes("404")) {
        throw new Error("author_member_access_not_denied");
      }
    }

    console.log("admin-panel-verification: all checks passed");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
