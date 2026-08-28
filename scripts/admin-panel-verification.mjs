#!/usr/bin/env node
/**
 * Admin panel verification: SQL stats, access control, applications.
 *
 * Usage:
 *   node scripts/admin-panel-verification.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";

function loadEnv() {
  const envPath = [
    process.env.AUDIOLAD_ADMIN_VERIFICATION_ENV_FILE,
    "/var/www/audiolad-deploy/current/.env.local",
    "/var/www/audiolad/.env.local",
  ].find((candidate) => candidate && existsSync(candidate));

  if (!envPath) {
    throw new Error("admin_verification_environment_missing");
  }

  return Object.fromEntries(
    readFileSync(envPath, "utf8")
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

async function sqlStats(service) {
  const snapshotNow = new Date();
  const snapshotNowIso = snapshotNow.toISOString();
  const sevenDaysAgo = new Date(snapshotNow.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(snapshotNow.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    usersTotal,
    users7d,
    users30d,
    ownerMembers,
    applicationsTotal,
    applicationsSubmitted7d,
    applicationsAwaitingReview,
    publishedPractices,
    playbackStarts,
    completions,
    succeededPayments,
    confirmedRefunds,
  ] = await Promise.all([
    service.from("profiles").select("*", { count: "exact", head: true }),
    service
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgo)
      .lt("created_at", snapshotNowIso),
    service
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo)
      .lt("created_at", snapshotNowIso),
    service
      .from("author_members")
      .select("user_id, author_id, authors!inner(access_status)")
      .eq("role", "owner")
      .not("authors.access_status", "in", "(suspended,terminated)"),
    service.from("author_applications").select("*", { count: "exact", head: true }),
    service
      .from("author_applications")
      .select("*", { count: "exact", head: true })
      .gte("submitted_at", sevenDaysAgo)
      .lt("submitted_at", snapshotNowIso),
    service
      .from("author_applications")
      .select("*", { count: "exact", head: true })
      .eq("status", "submitted"),
    service
      .from("practices")
      .select("*", { count: "exact", head: true })
      .eq("status", "published")
      .eq("product_kind", "practice")
      .is("deleted_at", null),
    service
      .from("analytics_events")
      .select("*", { count: "exact", head: true })
      .eq("event_name", "audio_play_started")
      .eq("is_bot", false)
      .eq("is_staff", false)
      .eq("is_test", false),
    service
      .from("analytics_events")
      .select("*", { count: "exact", head: true })
      .eq("event_name", "audio_completed")
      .eq("is_bot", false)
      .eq("is_staff", false)
      .eq("is_test", false),
    service
      .from("payments")
      .select("order_id, amount_minor")
      .eq("status", "succeeded")
      .eq("is_test", false),
    service
      .from("payment_refunds")
      .select("amount_minor")
      .eq("status", "succeeded")
      .eq("is_test", false)
      .not("confirmed_at", "is", null),
  ]);

  const { data: practices } = await service
    .from("practices")
    .select("id")
    .eq("status", "published")
    .eq("product_kind", "practice")
    .is("deleted_at", null);

  let publishedPrograms = 0;

  if (practices?.length) {
    const { data: audioItems } = await service
      .from("audio_items")
      .select("id, practice_id")
      .in(
        "practice_id",
        practices.map((row) => row.id),
      )
      .eq("status", "published");

    const tracksByPractice = new Map();

    for (const item of audioItems ?? []) {
      const tracks = tracksByPractice.get(item.practice_id) ?? new Set();
      tracks.add(item.id);
      tracksByPractice.set(item.practice_id, tracks);
    }

    publishedPrograms = [...tracksByPractice.values()].filter((tracks) => tracks.size >= 2).length;
  }

  const revenueMinor = (succeededPayments.data ?? []).reduce(
    (sum, row) => sum + (typeof row.amount_minor === "number" ? row.amount_minor : 0),
    0,
  ) - (confirmedRefunds.data ?? []).reduce(
    (sum, row) => sum + (typeof row.amount_minor === "number" ? row.amount_minor : 0),
    0,
  );
  const owners = ownerMembers.data ?? [];

  return {
    usersTotal: usersTotal.count ?? 0,
    users7d: users7d.count ?? 0,
    users30d: users30d.count ?? 0,
    authorsTotal: new Set(owners.map((member) => member.user_id)).size,
    authorWorkspacesTotal: new Set(owners.map((member) => member.author_id)).size,
    applicationsTotal: applicationsTotal.count ?? 0,
    applicationsSubmitted7d: applicationsSubmitted7d.count ?? 0,
    applicationsAwaitingReview: applicationsAwaitingReview.count ?? 0,
    publishedPractices: publishedPractices.count ?? 0,
    publishedPrograms,
    playbackStarts: playbackStarts.count ?? 0,
    completions: completions.count ?? 0,
    paidOrders: new Set((succeededPayments.data ?? []).map((payment) => payment.order_id)).size,
    revenueMinor,
  };
}

async function fetchAdminOverviewNumbers(page) {
  const cards = await page
    .locator('section[aria-labelledby="admin-overview-heading"] article')
    .all();
  const result = {};

  for (const card of cards) {
    const label = (await card.locator("p").first().textContent())?.trim() ?? "";
    const valueText = (await card.locator("p").nth(1).textContent())?.trim() ?? "";
    const numeric = valueText.replace(/[^\d,.-]/g, "").replace(",", ".");
    const parsed = Number.parseFloat(numeric);

    if (label.toLowerCase().includes("выручка")) {
      result.revenueMinor = Math.round(parsed * 100);
    } else if (label.includes("Всего пользователей")) {
      result.usersTotal = parsed;
    } else if (label.includes("Новых пользователей за 7 дней")) {
      result.users7d = parsed;
    } else if (label.includes("Новых пользователей за 30 дней")) {
      result.users30d = parsed;
    } else if (label.includes("Заявок подано за 7 дней")) {
      result.applicationsSubmitted7d = parsed;
    } else if (label.includes("авторов")) {
      result.authorsTotal = parsed;
    } else if (label.includes("Авторских пространств")) {
      result.authorWorkspacesTotal = parsed;
    } else if (label.includes("Ожидают рассмотрения")) {
      result.applicationsAwaitingReview = parsed;
    } else if (label.includes("Всего заявок")) {
      result.applicationsTotal = parsed;
    } else if (label.includes("аудиопрактик")) {
      result.publishedPractices = parsed;
    } else if (label.includes("программ")) {
      result.publishedPrograms = parsed;
    } else if (label.includes("Дослушиваний")) {
      result.completions = parsed;
    } else if (label.includes("Запусков прослушивания")) {
      result.playbackStarts = parsed;
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

async function assertAdminDenied(page, path) {
  const response = await page.goto(`${BASE}${path}`, {
    waitUntil: "domcontentloaded",
  });
  const body = await page.content();
  if (response?.status() !== 404 && !body.includes("404")) {
    throw new Error(`access_not_denied:${path}`);
  }
}

async function readAnalyticsUniqueVisitorCount(page) {
  const analyticsSection = page.locator(
    'section[aria-labelledby="admin-analytics-heading"]',
  );
  const metricCards = analyticsSection.locator("article");
  const metricCount = await metricCards.count();

  for (let index = 0; index < metricCount; index += 1) {
    const label =
      (await metricCards.nth(index).locator("p").first().textContent())?.trim() ?? "";

    if (label.includes("Уникальные посетители")) {
      const valueText =
        (await metricCards.nth(index).locator("p").nth(1).textContent())?.trim() ?? "";
      const numeric = valueText.replace(/[^\d]/g, "");
      return Number.parseInt(numeric, 10);
    }
  }

  throw new Error("analytics_unique_visitors_metric_missing");
}

async function verifyOwnerAnalyticsDashboard(page) {
  const pageErrors = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Обзор" }).waitFor();
  await page.getByRole("heading", { name: "Аналитика платформы" }).waitFor();

  for (const label of ["Сегодня", "Вчера", "7 дней", "30 дней", "Всё время"]) {
    await page.getByRole("link", { name: label }).waitFor();
  }

  await page.getByRole("heading", { name: "Источники" }).waitFor();
  await page.getByRole("heading", { name: "Что слушают" }).waitFor();
  await page.getByRole("heading", { name: "Недавняя активность" }).waitFor();

  const analyticsSection = page.locator(
    'section[aria-labelledby="admin-analytics-heading"]',
  );
  const metricCards = analyticsSection.locator("article");
  const metricCount = await metricCards.count();
  if (metricCount < 1) {
    throw new Error("analytics_metrics_missing");
  }

  for (let index = 0; index < metricCount; index += 1) {
    const valueText = (await metricCards.nth(index).locator("p").nth(1).textContent())?.trim() ?? "";
    if (!valueText) {
      throw new Error(`analytics_metric_empty:${index}`);
    }
  }

  await page.goto(`${BASE}/admin?period=7d`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Аналитика платформы" }).waitFor();
  await page.getByRole("link", { name: "7 дней" }).waitFor();
  await page.getByRole("heading", { name: "Источники" }).waitFor();
  await page.getByRole("heading", { name: "Что слушают" }).waitFor();
  await page.getByRole("heading", { name: "Недавняя активность" }).waitFor();

  const withoutTestVisitors = await readAnalyticsUniqueVisitorCount(page);
  const toggle = page.getByRole("link", { name: "Не учитывать тестовый трафик" });
  await toggle.waitFor();
  const toggleHref = await toggle.getAttribute("href");

  if (!toggleHref?.includes("includeTest=1")) {
    throw new Error(`test_traffic_toggle_href:${toggleHref}`);
  }

  if (withoutTestVisitors >= 56) {
    throw new Error(
      `analytics_test_filter_not_applied:${withoutTestVisitors}>=56`,
    );
  }

  await page.getByText(/Исключено тестовых посетителей:/).waitFor();

  await page.goto(`${BASE}/admin?period=7d&includeTest=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: "Аналитика платформы" }).waitFor();

  const withTestVisitors = await readAnalyticsUniqueVisitorCount(page);

  if (withTestVisitors !== 56) {
    throw new Error(
      `analytics_with_test_visitors: expected 56, got ${withTestVisitors}`,
    );
  }

  const body = await page.content();
  if (/Application error|Internal Server Error|Unhandled Runtime Error/i.test(body)) {
    throw new Error("analytics_dashboard_runtime_error");
  }

  if (pageErrors.length > 0) {
    throw new Error(`analytics_dashboard_page_errors:${pageErrors.join(" | ")}`);
  }

  console.log("owner_analytics_dashboard: ok");
}

async function testListenerAnalyticsTableAccess(env, listenerEmail) {
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
    email: listenerEmail,
  });

  if (error || !linkData?.properties?.hashed_token) {
    throw new Error("listener_auth_link_failed");
  }

  const { data, error: verifyError } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  if (verifyError || !data.session) {
    throw new Error("listener_auth_verify_failed");
  }

  const listenerClient = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      },
    },
  );

  listenerClient.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });

  const sessionResult = await listenerClient.from("analytics_sessions").select("id").limit(1);
  const eventsResult = await listenerClient.from("analytics_events").select("id").limit(1);

  if (!sessionResult.error) {
    throw new Error("listener_can_read_analytics_sessions");
  }

  if (!eventsResult.error) {
    throw new Error("listener_can_read_analytics_events");
  }

  console.log("listener_analytics_table_access: denied");
}

async function resolveAuthorOwnerEmail(service) {
  const { data: authorMembers } = await service
    .from("author_members")
    .select("user_id")
    .eq("role", "owner");

  for (const member of authorMembers ?? []) {
    const { data: profile } = await service
      .from("profiles")
      .select("role")
      .eq("id", member.user_id)
      .maybeSingle();

    if (
      profile?.role === "platform_owner" ||
      profile?.role === "platform_admin"
    ) {
      continue;
    }

    const { data: authUser } = await service.auth.admin.getUserById(member.user_id);
    if (authUser.user?.email) {
      return authUser.user.email;
    }
  }

  return null;
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

  if (process.env.AUDIOLAD_ADMIN_VERIFICATION_LEGACY !== "1") {
    console.log("admin-panel-verification: read-only stats check completed");
    return;
  }

  if (new URL(BASE).hostname === "audiolad.ru") {
    throw new Error("legacy_mutation_scenarios_are_forbidden_on_production");
  }

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

  const authorEmail = await resolveAuthorOwnerEmail(service);

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

    await verifyOwnerAnalyticsDashboard(ownerPage);

    const uiStats = await fetchAdminOverviewNumbers(ownerPage);
    console.log("ui_stats", uiStats);

    assertEq("usersTotal", uiStats.usersTotal, stats.usersTotal);
    assertEq("users7d", uiStats.users7d, stats.users7d);
    assertEq("users30d", uiStats.users30d, stats.users30d);
    assertEq("authorsTotal", uiStats.authorsTotal, stats.authorsTotal);
    assertEq(
      "authorWorkspacesTotal",
      uiStats.authorWorkspacesTotal,
      stats.authorWorkspacesTotal,
    );
    assertEq(
      "applicationsSubmitted7d",
      uiStats.applicationsSubmitted7d,
      stats.applicationsSubmitted7d,
    );
    assertEq(
      "applicationsAwaitingReview",
      uiStats.applicationsAwaitingReview,
      stats.applicationsAwaitingReview,
    );
    assertEq("applicationsTotal", uiStats.applicationsTotal, stats.applicationsTotal);
    assertEq("publishedPractices", uiStats.publishedPractices, stats.publishedPractices);
    assertEq("publishedPrograms", uiStats.publishedPrograms, stats.publishedPrograms);
    assertEq("playbackStarts", uiStats.playbackStarts, stats.playbackStarts);
    assertEq("completions", uiStats.completions, stats.completions);
    assertEq("paidOrders", uiStats.paidOrders, stats.paidOrders);
    assertEq("revenueMinor", uiStats.revenueMinor, stats.revenueMinor);

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
      "/admin?period=7d",
      "/admin?period=7d&includeTest=1",
      "/admin?period=7d&includeTest=0",
      "/admin/users",
      "/admin/author-applications",
      `/admin/author-applications/${applicationId}`,
    ]) {
      await assertAdminDenied(listenerPage, path);
    }

    await testListenerAnalyticsTableAccess(env, listenerProfile.email);

    await context.clearCookies();

    // Author member denied (if distinct from owner)
    if (authorEmail && authorEmail !== "1@audiolad.ru") {
      const authorCookies = await getAuthCookies(BASE, authorEmail);
      await context.addCookies(authorCookies);
      const authorPage = await context.newPage();
      for (const path of [
        "/admin",
        "/admin?period=7d",
        "/admin?period=7d&includeTest=1",
      ]) {
        await assertAdminDenied(authorPage, path);
      }
      console.log("author_owner_analytics_access: denied");
    } else {
      console.log("author_owner_analytics_access: skipped_no_distinct_author");
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
