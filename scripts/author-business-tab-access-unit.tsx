/**
 * «АудиоЛад Бизнес» tab for authors without a commercial status (Sergey 17.10.2026, task 8dcba9d1),
 * and the temporary pause of author-side admission (Sergey 12.11.2026, task t1386u).
 *
 * When AUTHOR_CABINET_BUSINESS_ADMISSION_ENABLED is false the tab is hidden for every author,
 * /author-dashboard/business redirects to the cabinet, and the verification form does not call
 * the submit RPCs. When it is true, the previous behaviour remains: the tab stays visible but
 * muted without a commercial status, a click shows the notice with the EXISTING commercial-status
 * application link, commercial authors keep the plain link, and the page is guarded server-side
 * before any Business data is loaded.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import AuthorDashboardClient from "../src/components/author-dashboard/AuthorDashboardClient";
import AuthorDashboardNav from "../src/components/author-dashboard/AuthorDashboardNav";
import BusinessCommercialRequiredNotice from "../src/components/author-dashboard/business/BusinessCommercialRequiredNotice";
import {
  AUTHOR_CABINET_BUSINESS_ADMISSION_ENABLED,
  BUSINESS_COMMERCIAL_REQUIRED_CTA,
  BUSINESS_COMMERCIAL_REQUIRED_NOTICE,
  authorCanOpenBusiness,
  buildCommercialApplicationHref,
  isAuthorCabinetBusinessAdmissionEnabled,
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

// Current shipping state (t1386u): author-side admission is paused. Flip the constant to
// restore the tab; the tests below then run the previous nav behaviour automatically.
assert.equal(AUTHOR_CABINET_BUSINESS_ADMISSION_ENABLED, false);
assert.equal(isAuthorCabinetBusinessAdmissionEnabled(), false);

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
  const admissionEnabled = isAuthorCabinetBusinessAdmissionEnabled();

  if (!admissionEnabled) {
    // Paused: the tab is gone for every author, including commercial and unknown status.
    for (const status of [...denied, ...allowed, undefined]) {
      const nav = await renderNav(status as string | null | undefined);
      const text = nav.container.textContent ?? "";
      assert.equal(linksTo(nav.container, "/author-dashboard/business").length, 0, `no Business link for ${String(status)}`);
      assert.equal(byTestId(nav.container, "author-nav-business-locked").length, 0, `no locked tab for ${String(status)}`);
      assert.equal(byTestId(nav.container, "business-commercial-required").length, 0);
      assert.ok(!text.includes("АудиоЛад Бизнес"), `no Business label for ${String(status)}`);
      assert.ok(text.includes("Продукты"), "neighbouring tabs stay");
      assert.ok(text.includes("Статус"), "Статус stays");
      await nav.cleanup();
    }
  } else {
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
  }

  // AudioSprint «Осень звучит» ended 18.10.2026: the promo switch is off, so neither the nav tab
  // (also not on the sprint page, which stays reachable by URL) nor the dashboard banner renders,
  // whatever the clock says; the neighbouring tabs are unchanged.
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
  {
    const doc = document as { cookie?: string };
    if (typeof doc.cookie !== "string") doc.cookie = "";
    const dashboardHtml = renderToStaticMarkup(
      createElement(AuthorDashboardClient, {
        authors: [
          {
            id: "00000000-0000-0000-0000-000000000001",
            slug: "slug-1",
            name: "Проект",
            role: "owner",
            accessStatus: "free",
            canBypassProductModeration: false,
            defaultAudioProductAuthor: null,
          },
        ],
      }),
    );
    assert.ok(dashboardHtml.includes("Продукты текущего проекта"), "dashboard rendered");
    assert.ok(!dashboardHtml.includes("Осень звучит"), "no sprint banner or tab on the dashboard");
    assert.ok(!dashboardHtml.includes("призовой фонд"), "no prize-fund promo on the dashboard");
    assert.ok(!dashboardHtml.includes('href="/osen-zvuchit"'), "no link to the sprint landing");
  }

  // On the Business page itself the page already renders the notice: no duplicate from the nav.
  if (admissionEnabled) {
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

  // 5. Server guard: pause redirect first, then the commercial-status notice,
  // both right after the membership check and before support mode or any Business query.
  const page = read("src/app/(platform)/author-dashboard/business/page.tsx");
  const membership = page.indexOf("await requireAuthorMembership(workspace.id)");
  const pause = page.indexOf("if (!isAuthorCabinetBusinessAdmissionEnabled())");
  const guard = page.indexOf("if (!authorCanOpenBusiness(accessStatus))");
  assert.ok(membership > 0 && pause > membership, "pause redirect follows requireAuthorMembership");
  assert.ok(guard > pause, "commercial guard stays after the pause redirect");
  const pauseBlock = page.slice(pause, page.indexOf("\n  }", pause) + 4);
  assert.ok(pauseBlock.includes("redirect("), "paused admission redirects away from the form");
  assert.ok(pauseBlock.includes("/author-dashboard?author="), "redirect target is the author cabinet");
  assert.ok(!/supabase|\.from\(|\.rpc\(/.test(pauseBlock), "pause redirect loads no data");
  const guardBlock = page.slice(guard, page.indexOf("\n  }\n", guard));
  assert.ok(guardBlock.includes("<BusinessCommercialRequiredNotice"), "guard renders the notice");
  assert.ok(guardBlock.includes("id={BUSINESS_LOCKED_NOTICE_ID}"), "page notice carries the id the nav tab controls");
  assert.ok(!/supabase|\.from\(|\.rpc\(/.test(guardBlock), "guard loads no data");
  for (const marker of ["await isConsentBlockedForRequest(", ".from(", ".rpc("]) {
    const at = page.indexOf(marker);
    if (at >= 0) assert.ok(at > pause && at > guard, `${marker} must come after the pause redirect and the commercial guard`);
  }

  // 6. Author-side submit: the form must refuse the draft/submit RPCs while admission is paused.
  const form = read("src/components/author-dashboard/business/RightsholderVerificationForm.tsx");
  const submit = form.indexOf("async function onSubmit");
  const flagGuard = form.indexOf("if (!isAuthorCabinetBusinessAdmissionEnabled()) return;");
  const firstRpc = form.indexOf("supabase.rpc(");
  assert.ok(submit > 0 && flagGuard > submit, "submit checks the admission flag");
  assert.ok(firstRpc > flagGuard, "no verification RPC runs before the admission flag");

  console.log("author-business-tab-access-unit: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
