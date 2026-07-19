#!/usr/bin/env node
/**
 * Mobile bottom nav stability check (390px viewport, scroll + viewport resize).
 * Usage: AUDIT_BASE_URL=http://127.0.0.1:3017 node scripts/bottom-nav-mobile-stability-check.mjs
 */
import { chromium, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE_URL = process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3017";
const OUT_DIR = path.resolve("scripts/screenshots/bottom-nav-mobile-stability");

const PAGES = [
  { path: "/", label: "home" },
  { path: "/catalog", label: "catalog" },
  { path: "/my-practices", label: "library", requiresAuth: true },
];

function loadEnv() {
  return Object.fromEntries(
    readFileSync(path.resolve(".env.local"), "utf8")
      .split("\n")
      .filter((line) => line && line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

async function getAuthCookies(baseUrl) {
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
    email: "1@audiolad.ru",
  });

  if (error || !linkData?.properties?.hashed_token) {
    throw new Error("auth_link_failed");
  }

  const { data, error: verifyError } = await pub.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });

  if (verifyError || !data.session) {
    throw new Error("auth_verify_failed");
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

  return [
    {
      ...cookieBase,
      name: `sb-${projectRef}-auth-token`,
      value: JSON.stringify({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
        user: data.session.user,
      }),
    },
  ];
}

function collectNavMetrics() {
  const nav = document.querySelector(".bottom-nav");
  if (!nav) {
    return { found: false };
  }

  function hasFixedBreakingAncestor(el) {
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const style = window.getComputedStyle(node);
      if (
        style.transform !== "none" ||
        style.filter !== "none" ||
        style.perspective !== "none" ||
        style.contain.includes("paint") ||
        style.contain.includes("layout") ||
        style.willChange.includes("transform")
      ) {
        return {
          tag: node.tagName.toLowerCase(),
          className: node.className,
          transform: style.transform,
          filter: style.filter,
          perspective: style.perspective,
          contain: style.contain,
          willChange: style.willChange,
        };
      }
      node = node.parentElement;
    }
    return null;
  }

  const style = window.getComputedStyle(nav);
  const rect = nav.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const gapToBottom = viewportHeight - rect.bottom;
  const shellBody = document.querySelector(".listener-app-shell__body");
  const shellBodyStyle = shellBody ? window.getComputedStyle(shellBody) : null;
  const lastMainChild = document.querySelector(".listener-app-shell__body")
    ? document.querySelector(".listener-app-shell__center-scroll")?.lastElementChild
    : document.querySelector(".platform-mobile-shell")?.lastElementChild;

  let contentOverlap = null;
  if (lastMainChild && lastMainChild !== nav) {
    const contentRect = lastMainChild.getBoundingClientRect();
    contentOverlap = rect.top < contentRect.bottom;
  }

  return {
    found: true,
    position: style.position,
    left: style.left,
    right: style.right,
    bottom: style.bottom,
    transform: style.transform,
    zIndex: style.zIndex,
    paddingBottom: style.paddingBottom,
    rectTop: rect.top,
    rectBottom: rect.bottom,
    rectHeight: rect.height,
    viewportHeight,
    gapToBottom,
    flushToBottom: Math.abs(gapToBottom) <= 1,
    breakingAncestor: hasFixedBreakingAncestor(nav),
    parentTag: nav.parentElement?.tagName.toLowerCase() ?? null,
    parentClass: nav.parentElement?.className ?? null,
    isDirectBodyChild: nav.parentElement === document.body,
    shellBodyMinHeight: shellBodyStyle?.minHeight ?? null,
    contentOverlap,
    scrollY: window.scrollY,
  };
}

async function measureAtScrollPositions(page, label) {
  const positions = [
    { name: "top", y: 0 },
    { name: "middle", y: null },
    { name: "bottom", y: null },
  ];

  const maxScroll = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  positions[1].y = Math.max(0, Math.floor(maxScroll / 2));
  positions[2].y = Math.max(0, maxScroll);

  const results = {};

  for (const pos of positions) {
    await page.evaluate((y) => window.scrollTo(0, y), pos.y);
    await page.waitForTimeout(150);
    results[pos.name] = await page.evaluate(collectNavMetrics);
  }

  return { label, maxScroll, results };
}

async function measureViewportResize(page, label) {
  const metrics = {};

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_URL}${label === "home" ? "/" : "/catalog"}`, {
    waitUntil: "networkidle",
  });
  await page.waitForSelector(".bottom-nav", { timeout: 15000 });
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(150);

  metrics.tall = await page.evaluate(collectNavMetrics);

  await page.setViewportSize({ width: 390, height: 700 });
  await page.waitForTimeout(200);
  metrics.short = await page.evaluate(collectNavMetrics);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  metrics.restored = await page.evaluate(collectNavMetrics);

  return metrics;
}

function evaluatePass(report) {
  const issues = [];

  for (const page of report.pages) {
    for (const [posName, metrics] of Object.entries(page.scroll.results)) {
      if (!metrics.found) {
        issues.push(`${page.path}@${posName}: nav not found`);
        continue;
      }
      if (metrics.position !== "fixed") {
        issues.push(`${page.path}@${posName}: position=${metrics.position}`);
      }
      if (!metrics.flushToBottom) {
        issues.push(
          `${page.path}@${posName}: gapToBottom=${metrics.gapToBottom.toFixed(2)}`,
        );
      }
      if (metrics.breakingAncestor) {
        issues.push(
          `${page.path}@${posName}: breaking ancestor ${metrics.breakingAncestor.tag}.${metrics.breakingAncestor.className}`,
        );
      }
      if (metrics.left !== "0px" || metrics.right !== "0px") {
        issues.push(
          `${page.path}@${posName}: inset left=${metrics.left} right=${metrics.right}`,
        );
      }
      if (!metrics.isDirectBodyChild) {
        issues.push(`${page.path}@${posName}: nav parent is not body`);
      }
    }
  }

  for (const [phase, metrics] of Object.entries(report.viewportResize)) {
    if (!metrics.flushToBottom) {
      issues.push(`resize:${phase}: gapToBottom=${metrics.gapToBottom.toFixed(2)}`);
    }
  }

  return issues;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    viewport: { width: 390, height: 844 },
  });
  await context.addInitScript(() => {
    window.localStorage.setItem("audiolad_analytics_cookies", "denied");
  });
  await context.addCookies(await getAuthCookies(BASE_URL));
  const page = await context.newPage();

  const report = { baseUrl: BASE_URL, pages: [], viewportResize: {} };

  for (const item of PAGES) {
    await page.goto(`${BASE_URL}${item.path}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".bottom-nav", { timeout: 15000 });
    const scroll = await measureAtScrollPositions(page, item.label);
    report.pages.push({ path: item.path, scroll });

    await page.screenshot({
      path: path.join(OUT_DIR, `${item.label}-middle.png`),
      fullPage: false,
    });
  }

  report.viewportResize = await measureViewportResize(page, "home");

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await page.waitForSelector(".bottom-nav", { timeout: 15000 });
  await page.locator('.bottom-nav a[aria-label="Каталог"]').click();
  await page.waitForURL("**/catalog**", { timeout: 15000 });
  await page.waitForSelector(".bottom-nav", { timeout: 15000 });
  await page.locator('.bottom-nav a[aria-label="Аудиотека"]').click();
  await page.waitForURL("**/my-practices**", { timeout: 15000 });

  report.navigation = await page.evaluate(() => {
    const navs = document.querySelectorAll(".bottom-nav");
    return {
      count: navs.length,
      parentTags: [...navs].map((nav) => nav.parentElement?.tagName.toLowerCase() ?? null),
    };
  });

  const issues = evaluatePass(report);

  if (report.navigation.count !== 1) {
    issues.push(`navigation: bottom-nav count=${report.navigation.count}`);
  }

  report.pass = issues.length === 0;
  report.issues = issues;

  await writeFile(
    path.join(OUT_DIR, "results.json"),
    JSON.stringify(report, null, 2),
  );

  await browser.close();

  console.log(JSON.stringify({ pass: report.pass, issues: report.issues }, null, 2));
  if (!report.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
