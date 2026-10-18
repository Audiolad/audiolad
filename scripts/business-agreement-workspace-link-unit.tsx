/**
 * 8d9cd0af (Sergey 18.10.2026 17:30): the unified agreement 2.0 is accepted PER author workspace,
 * the rights check is ONE application per account (pseudonyms are separate workspaces). A product of a
 * workspace without 2.0 must be flagged right in the form, and every red message that asks to accept
 * something elsewhere carries a direct link to that place (standing UX rule). En dashes only.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AgreementRequiredNotice from "../src/components/author-dashboard/business/AgreementRequiredNotice";
import {
  AGREEMENT_ACCEPT_ANCHOR,
  agreementAcceptHref,
  orderProductsForVerification,
} from "../src/lib/business-rightsholder/agreement-links";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
/** Visible text heuristics: strip comments, keep string/JSX content. */
const visible = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// 1. Direct link to the acceptance card of THAT workspace.
assert.equal(agreementAcceptHref("jazz-relax"), "/author-dashboard/legal?author=jazz-relax#author-terms-accept");
assert.equal(agreementAcceptHref("a b&c"), "/author-dashboard/legal?author=a%20b%26c#author-terms-accept");
assert.match(read("src/components/author-dashboard/AuthorLegalTermsCard.tsx"), /<section id=\{AGREEMENT_ACCEPT_ANCHOR\}/);
assert.equal(AGREEMENT_ACCEPT_ANCHOR, "author-terms-accept");

// 2. Ordering: accepted workspaces first, the opened workspace first among equals, stable otherwise.
type P = { id: string; workspace: { slug: string; name: string; agreementAccepted: boolean | null } | null };
const ws = (slug: string, accepted: boolean | null) => ({ slug, name: slug.toUpperCase(), agreementAccepted: accepted });
const list: P[] = [
  { id: "x1", workspace: ws("other", false) },
  { id: "a1", workspace: ws("main", true) },
  { id: "b1", workspace: ws("second", true) },
  { id: "a2", workspace: ws("main", true) },
  { id: "n1", workspace: null },
];
assert.deepEqual(orderProductsForVerification(list, "main").map((p) => p.id), ["a1", "a2", "b1", "n1", "x1"]);
assert.deepEqual(
  orderProductsForVerification([{ id: "l1", workspace: ws("w", null) }, { id: "l2", workspace: ws("v", null) }], "v").map((p) => p.id),
  ["l2", "l1"],
  "legacy (null) products are not demoted",
);

// 3. The red notice: both variants link to the workspace's acceptance page; en dash; no em dash.
for (const variant of ["choice", "submit"] as const) {
  const html = renderToStaticMarkup(
    createElement(AgreementRequiredNotice, { workspace: { slug: "aurafon", name: "Аурафон" }, showWorkspaceName: true, variant }),
  );
  assert.ok(html.includes('href="/author-dashboard/legal?author=aurafon#author-terms-accept"'), `${variant}: direct link`);
  assert.ok(html.includes("Перейти и принять"), `${variant}: action link text`);
  assert.ok(html.includes("Аурафон"), `${variant}: names the workspace`);
  assert.ok(html.includes('role="alert"'));
  assert.ok(!html.includes("—"), `${variant}: no em dash`);
  if (variant === "submit") {
    assert.ok(/<a [^>]*href="\/author-dashboard\/legal\?author=aurafon#author-terms-accept"[^>]*>«Юридические документы»<\/a>/.test(html), "«Юридические документы» is itself a link");
  } else {
    assert.ok(html.includes("Этот продукт – из кабинета"), "choice: en dash");
  }
}
const single = renderToStaticMarkup(
  createElement(AgreementRequiredNotice, { workspace: { slug: "s", name: "S" }, showWorkspaceName: false, variant: "submit" }),
);
assert.ok(!single.includes("кабинете «S»"), "single workspace: no workspace name noise");

// 4. Form wiring: workspace per product, early block (no uploads), submit error rendered with links.
const form = read("src/components/author-dashboard/business/RightsholderVerificationForm.tsx");
assert.match(form, /workspace\?: ProductWorkspace \| null;/);
assert.match(form, /const productNeedsAgreement = unified && productWorkspace\?\.agreementAccepted === false;/);
assert.match(form, /if \(productNeedsAgreement\) return;\n\s+setAgreementRefusedSlug\(null\);\n\s+setBusy\(true\);/, "blocked before any upload");
assert.match(form, /message\.includes\("business_unified_agreement_required"\) && productWorkspace\) \{\n\s+\/\/[^\n]*\n\s+setAgreementRefusedSlug\(productWorkspace\.slug\);/);
assert.match(form, /<AgreementRequiredNotice workspace=\{productWorkspace\} showWorkspaceName=\{multiWorkspace\} variant="choice" \/>/);
assert.match(form, /<AgreementRequiredNotice workspace=\{refusedWorkspace\} showWorkspaceName=\{multiWorkspace\} variant="submit" \/>/);
assert.match(form, /disabled=\{busy \|\| productNeedsAgreement\}/);
assert.match(form, /`\$\{p\.title\} – \$\{p\.workspace\.name\}`/, "option shows the workspace when several");
assert.ok(!form.includes("в разделе «Юридические документы».\""), "old unlinked message is gone");

// 5. Page wiring: per-workspace agreement for the products' workspaces, own workspaces only; order; link for «опубликуйте».
const page = read("src/app/(platform)/author-dashboard/business/page.tsx");
assert.match(page, /\.in\("author_id", ownerWorkspaceIds\)/, "products still only from own workspaces");
assert.match(page, /hasAcceptedCurrentAuthorTerms\(id\)\)\.gate\.businessAgreement === true/);
assert.match(page, /agreementAccepted: unifiedMode \? agreementByWorkspace\.get\(ws\.id\) === true : null/);
assert.match(page, /orderProductsForVerification\(/);
assert.match(page, /href=\{`\/author-dashboard\/music\?author=\$\{encodeURIComponent\(workspace\.slug\)\}`\}/);

// 6. Commercial onboarding: «Сначала примите Авторские условия» hint links to the terms page.
const onboarding = read("src/lib/author-dashboard/commercial-onboarding.ts");
assert.match(onboarding, /applicationApproved && termsHref \? \{ hintHref: termsHref, hintLinkLabel: "Перейти и принять" \} : \{\}/);
assert.equal((read("src/components/author-dashboard/AuthorOnboardingChecklist.tsx").match(/href=\{step\.hintHref\}/g) ?? []).length, 2);

// 7. En dashes only in visible text of the touched cabinet / Business components.
for (const rel of [
  "src/components/author-dashboard/AuthorAgreementReacceptBanner.tsx",
  "src/components/author-dashboard/business/BusinessAgreementStatusScreen.tsx",
  "src/components/author-dashboard/business/AgreementRequiredNotice.tsx",
  "src/components/author-dashboard/business/RightsholderVerificationForm.tsx",
  "src/app/(platform)/author-dashboard/business/page.tsx",
]) {
  assert.ok(!visible(read(rel)).includes("—"), `${rel}: no em dash in visible text`);
}

console.log("business-agreement-workspace-link-unit: ok");
