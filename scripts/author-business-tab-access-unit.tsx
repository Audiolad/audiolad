/**
 * «АудиоЛад Бизнес» tab for authors without a commercial status (Sergey 17.10.2026, task 8dcba9d1):
 * the tab stays visible but muted, a click shows the notice with the EXISTING commercial-status
 * application link instead of opening Business, commercial authors keep the plain link, and the
 * /author-dashboard/business page is guarded server-side before any Business data is loaded.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import AuthorDashboardNav from "../src/components/author-dashboard/AuthorDashboardNav";
import BusinessCommercialRequiredNotice from "../src/components/author-dashboard/business/BusinessCommercialRequiredNotice";
import {
  BUSINESS_COMMERCIAL_REQUIRED_CTA,
  BUSINESS_COMMERCIAL_REQUIRED_NOTICE,
  authorCanOpenBusiness,
  buildCommercialApplicationHref,
} from "../src/lib/author-dashboard/business-access";
import { resolveAuthorStatusView } from "../src/lib/author-dashboard/author-status";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 1. Who may open Business: the cabinet's approved commercial path, nobody else.
const allowed = ["commercial_onboarding", "commercial_active", "commercial_suspended", "commercial"];
const denied = ["free", "commercial_pending", "suspended", "terminated", "", null, undefined, "garbage"];
for (const status of allowed) assert.equal(authorCanOpenBusiness(status), true, `allowed: ${status}`);
for (const status of denied) assert.equal(authorCanOpenBusiness(status), false, `denied: ${String(status)}`);

// 2. Notice copy and the EXISTING application flow.
assert.equal(
  BUSINESS_COMMERCIAL_REQUIRED_NOTICE,
  "Чтобы получить доступ к АудиоЛад Бизнесу, оформите коммерческий статус автора.",
);
assert.equal(buildCommercialApplicationHref("my author"), "/author-dashboard/commercial-application?author=my%20author");
assert.equal(buildCommercialApplicationHref(null), "/author-dashboard/commercial-application");
assert.ok(
  read("src/app/(platform)/author-dashboard/commercial-application/page.tsx").includes("AuthorCommercialApplicationForm"),
  "the CTA must point at the existing commercial-application page",
);
const freeStatusView = resolveAuthorStatusView({
  accessStatus: "free",
  applicationStatus: null,
  termsAccepted: false,
  publishedTermsAvailable: true,
  payoutProfileStatus: null,
  role: "owner",
  authorSlug: "my author",
  hasPublishedFreeProduct: true,
});
assert.equal(
  freeStatusView.cta?.href,
  buildCommercialApplicationHref("my author"),
  "same href as the «Статус» page CTA for a free author",
);

const noticeHtml = renderToStaticMarkup(createElement(BusinessCommercialRequiredNotice, { authorSlug: "slug-1" }));
assert.ok(noticeHtml.includes(BUSINESS_COMMERCIAL_REQUIRED_NOTICE));
assert.ok(noticeHtml.includes(BUSINESS_COMMERCIAL_REQUIRED_CTA));
assert.ok(noticeHtml.includes('href="/author-dashboard/commercial-application?author=slug-1"'));

// 3. Nav behaviour in a DOM.
function all(node: Node): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const child = node.childNodes.item(i);
    if (!child || child.nodeType !== Node.ELEMENT_NODE) continue;
    out.push(child as HTMLElement, ...all(child));
  }
  return out;
}
const byTestId = (c: Node, id: string) => all(c).filter((el) => el.getAttribute("data-testid") === id);
const linksTo = (c: Node, prefix: string) =>
  all(c).filter((el) => el.tagName === "A" && (el.getAttribute("href") ?? "").startsWith(prefix));

async function renderNav(accessStatus: string | null | undefined, pathname = "/author-dashboard") {
  (globalThis as { __audioladBusinessTabPathname?: string }).__audioladBusinessTabPathname = pathname;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(AuthorDashboardNav, { authorSlug: "slug-1", authorRole: "owner", accessStatus }));
  });
  return {
    container,
    async cleanup() {
      await act(async () => root.unmount());
      container.remove?.();
    },
  };
}

async function main() {
  // Free author: tab visible and muted, no link to Business, click shows the notice.
  for (const status of ["free", "commercial_pending", "terminated", null]) {
    const nav = await renderNav(status);
    assert.equal(linksTo(nav.container, "/author-dashboard/business").length, 0, `no Business link for ${status}`);
    const [tab] = byTestId(nav.container, "author-nav-business-locked");
    assert.ok(tab, `locked tab rendered for ${status}`);
    assert.equal(tab.tagName, "BUTTON");
    assert.ok((tab.textContent ?? "").includes("АудиоЛад Бизнес"));
    assert.match(tab.getAttribute("class") ?? "", /border-dashed/);
    assert.match(tab.getAttribute("class") ?? "", /opacity-\d+/, "muted");
    assert.equal(byTestId(nav.container, "business-commercial-required").length, 0, "notice hidden before click");
    await act(async () => tab.click());
    const notice = byTestId(nav.container, "business-commercial-required");
    assert.equal(notice.length, 1, "notice shown after click");
    assert.ok((notice[0].textContent ?? "").includes(BUSINESS_COMMERCIAL_REQUIRED_NOTICE));
    const [cta] = byTestId(nav.container, "business-commercial-required-cta");
    assert.equal(cta.getAttribute("href"), "/author-dashboard/commercial-application?author=slug-1");
    assert.equal(tab.getAttribute("aria-expanded"), "true");
    assert.equal(notice[0].getAttribute("id"), tab.getAttribute("aria-controls"), "aria-controls targets the notice");
    await act(async () => tab.click());
    assert.equal(byTestId(nav.container, "business-commercial-required").length, 0, "second click closes the notice");
    assert.equal(tab.getAttribute("aria-expanded"), "false");
    await nav.cleanup();
  }

  // Commercial authors (and callers that do not know the status) keep the plain link.
  for (const status of [...allowed, undefined]) {
    const nav = await renderNav(status);
    assert.equal(linksTo(nav.container, "/author-dashboard/business").length, 1, `Business link for ${String(status)}`);
    assert.equal(byTestId(nav.container, "author-nav-business-locked").length, 0);
    await nav.cleanup();
  }

  // AudioSprint «Осень звучит» ended 18.10.2026: no promo tab in the cabinet nav (also on the
  // sprint page, which stays reachable by URL); the neighbouring tabs are unchanged.
  for (const pathname of ["/author-dashboard", "/author-dashboard/audio-sprints/osen-zvuchit-2026"]) {
    const nav = await renderNav("free", pathname);
    const text = nav.container.textContent ?? "";
    assert.ok(!text.includes("Осень звучит"), `no sprint tab on ${pathname}`);
    assert.ok(!text.includes("до 18 октября"), `no sprint deadline badge on ${pathname}`);
    assert.equal(linksTo(nav.container, "/author-dashboard/audio-sprints").length, 0);
    assert.equal(linksTo(nav.container, "/author-dashboard/seo-opportunities").length, 1);
    assert.equal(linksTo(nav.container, "/author-dashboard/stats").length, 1);
    await nav.cleanup();
  }

  // On the Business page itself the page already renders the notice: no duplicate from the nav.
  {
    const nav = await renderNav("free", "/author-dashboard/business");
    const [tab] = byTestId(nav.container, "author-nav-business-locked");
    assert.equal(tab.getAttribute("aria-expanded"), "true", "page notice is always visible there");
    await act(async () => tab.click());
    assert.equal(byTestId(nav.container, "business-commercial-required").length, 0);
    assert.equal(tab.getAttribute("aria-expanded"), "true");
    await nav.cleanup();
  }

  // 4. Every cabinet nav passes the workspace accessStatus (otherwise the tab would stay a plain link).
  // Found by scanning src, so a new call site without accessStatus fails here.
  const navCallers: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.tsx$/.test(entry.name) && read(rel).includes("<AuthorDashboardNav")) navCallers.push(rel);
    }
  };
  walk("src");
  assert.ok(navCallers.length >= 15, `expected the cabinet nav call sites, found ${navCallers.length}`);
  for (const rel of navCallers) {
    const source = read(rel);
    const usages = source.split("<AuthorDashboardNav").slice(1);
    assert.ok(usages.length > 0, `${rel} renders the nav`);
    for (const usage of usages) {
      const props = usage.slice(0, usage.indexOf("/>"));
      assert.match(props, /accessStatus=\{/, `${rel}: <AuthorDashboardNav> must pass accessStatus`);
    }
  }

  // 5. Server guard: right after the membership check, before support mode and any Business query.
  const page = read("src/app/(platform)/author-dashboard/business/page.tsx");
  const membership = page.indexOf("await requireAuthorMembership(workspace.id)");
  const guard = page.indexOf("if (!authorCanOpenBusiness(accessStatus))");
  assert.ok(membership > 0 && guard > membership, "guard follows requireAuthorMembership");
  const guardBlock = page.slice(guard, page.indexOf("\n  }\n", guard));
  assert.ok(guardBlock.includes("<BusinessCommercialRequiredNotice"), "guard renders the notice");
  assert.ok(guardBlock.includes("id={BUSINESS_LOCKED_NOTICE_ID}"), "page notice carries the id the nav tab controls");
  assert.ok(!/supabase|\.from\(|\.rpc\(/.test(guardBlock), "guard loads no data");
  for (const marker of ["await isConsentBlockedForRequest(", ".from(", ".rpc("]) {
    const at = page.indexOf(marker);
    if (at >= 0) assert.ok(at > guard, `${marker} must come after the guard`);
  }

  console.log("author-business-tab-access-unit: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
