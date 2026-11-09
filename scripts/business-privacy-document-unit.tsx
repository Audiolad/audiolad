/** Shared privacy text is unchanged; Business supplies only the document chrome. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PrivacyDocument from "../src/components/legal/PrivacyDocument";
import BusinessPrivacyPage from "../src/app/business-app/documents/privacy/page";
import { findClientDocument } from "../src/lib/business-app/client-documents";
import { businessPrivateGuestRedirect, resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy";
import { isPrivateRoute } from "../src/lib/auth/routes";
import { CoffeeAuthProvider } from "../src/components/auth/AuthHostNavigation";

(globalThis as { React?: typeof React }).React = React;
const read = (path: string) => readFileSync(path, "utf8");
const html = renderToStaticMarkup(<PrivacyDocument />);
// Baseline: the 09.11.2026 platform document (surname for Business owners), without shell or class attributes.
assert.equal(createHash("sha256").update(html.replace(/ class="[^"]*"/g, "")).digest("hex"),
  "41b71e42f860fc82de7bb23a0e63dc01689c4a6aedd1139927793c8a3f08dccf");
assert.equal((html.match(/<section /g) ?? []).length, 16);
assert.match(html, /id="section-8"/);
assert.match(html, /Последнее обновление: 9 ноября 2026 года/);
assert.match(html, /указанном заведении/);
assert.match(html, /странице подтверждения прав заведения/);
assert.doesNotMatch(html, /имя или отображаемое имя/);
assert.equal(findClientDocument("privacy")?.versionDate, "2026-11-09");
assert.match(findClientDocument("privacy")?.editionLabel ?? "", /9 ноября 2026/);
const businessHtml = renderToStaticMarkup(<BusinessPrivacyPage />);
assert.match(businessHtml, /class="business-app-card"/);
assert.match(businessHtml, /href="\/documents"/);
assert.ok(businessHtml.includes(html), "the cabinet embeds the exact same shared document");
assert.doesNotMatch(businessHtml, /lotus|LegalPageShell|splash/);
const platformPage = read("src/app/(platform)/privacy/page.tsx");
assert.match(platformPage, /<LegalPageShell><PrivacyDocument \/><\/LegalPageShell>/);

const previousFlag = process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
try {
  process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = "1";
  for (const host of ["coffee.audiolad.ru", "business.audiolad.ru"]) {
    for (const path of ["/privacy", "/documents/privacy", "/documents/business-offer"]) {
      const action = resolveBusinessProxyAction(host, path);
      assert.equal(action.action, "rewrite_business_app", `${host}${path}`);
      assert.equal(isPrivateRoute(path), false);
      if (action.action === "rewrite_business_app") {
        assert.equal(businessPrivateGuestRedirect(action.pathname, path), null, "anonymous readers are not sent to login");
        assert.equal(isPrivateRoute(action.pathname), false);
      }
    }
  }
  assert.deepEqual(resolveBusinessProxyAction("audiolad.ru", "/privacy"), { action: "pass_through" });
} finally {
  if (previousFlag === undefined) delete process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED;
  else process.env.NEXT_PUBLIC_AUDIOLAD_COFFEE_HOST_ENABLED = previousFlag;
}

const authHtml = renderToStaticMarkup(<CoffeeAuthProvider><span>Auth</span></CoffeeAuthProvider>);
assert.match(authHtml, /business-auth-root.*data-biz-theme="jazz-coffee"/);
assert.doesNotMatch(authHtml, /business-app-shell|business-app-sidebar|business-app-bottom-nav/);
for (const dir of readdirSync("src/app/(platform)/auth", { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const filename of readdirSync(`src/app/(platform)/auth/${dir.name}`)) {
    if (!filename.endsWith(".tsx")) continue;
    const source = read(`src/app/(platform)/auth/${dir.name}/${filename}`);
    assert.doesNotMatch(source, /\[(?:#7042c5|#25135c|#eadff8)\]/, `${dir.name}/${filename}: no hardcoded purple utilities`);
  }
}
assert.match(read("src/components/auth/business-auth.css"), /\.business-auth-root \.primary-cta:disabled/);
assert.doesNotMatch(read("src/components/business-app/BusinessGuestStartCta.tsx") + read("src/components/business-app/BusinessAudienceTracker.tsx"), /https:\/\/audiolad.ru\/privacy/);
console.log("business-privacy-document-unit: ok (shared legal baseline, public routes, scoped auth theme)");
