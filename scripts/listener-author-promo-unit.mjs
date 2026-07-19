#!/usr/bin/env node
/**
 * Author CTA + promo visibility — shared listener resolver regression.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  resolveListenerAuthorCta,
  resolveShowBecomeAuthorPromo,
  resolveShowSidebarAuthorPromo,
} from "../src/lib/listener/author-cta.ts";

const root = "/var/www/audiolad";
const sidebar = readFileSync(`${root}/src/components/listener/DesktopSidebar.tsx`, "utf8");
const shellData = readFileSync(`${root}/src/lib/listener/shell-data.ts`, "utf8");

const workspace = [{ id: "a1", slug: "sergey", name: "Sergey" }];

function assertHomePromo(variant, workspaces, expected, label) {
  const applicationVariant = variant;
  const actual = resolveShowBecomeAuthorPromo({ workspaces, applicationVariant });
  assert.equal(actual, expected, label);
  const cta = resolveListenerAuthorCta({ workspaces, applicationVariant });
  if (expected) {
    assert(
      cta.label === "Стать автором" || cta.label === "Посмотреть решение",
      `${label}: visible home promo aligns with listener CTA (${cta.label})`,
    );
  } else if (workspaces.length > 0) {
    assert.equal(cta.label, "Кабинет автора", `${label}: author CTA`);
  } else {
    assert.notEqual(
      cta.label,
      "Стать автором",
      `${label}: hidden home promo aligns with non-default listener CTA (${cta.label})`,
    );
  }
}

function assertSidebarPromo(variant, workspaces, expected, label) {
  const applicationVariant = variant;
  const actual = resolveShowSidebarAuthorPromo({ workspaces, applicationVariant });
  assert.equal(actual, expected, label);
  const cta = resolveListenerAuthorCta({ workspaces, applicationVariant });
  if (expected) {
    assert.notEqual(
      cta.label,
      "Кабинет автора",
      `${label}: sidebar promo hidden only for active author CTA (${cta.label})`,
    );
  } else {
    assert.equal(cta.label, "Кабинет автора", `${label}: active author sidebar promo hidden`);
  }
}

assertHomePromo("none", [], true, "home promo: plain listener");
assertHomePromo("rejected", [], true, "home promo: rejected application");
assertHomePromo("draft", [], false, "home promo: draft application");
assertHomePromo("submitted", [], false, "home promo: submitted application");
assertHomePromo("in_review", [], false, "home promo: in_review application");
assertHomePromo("needs_changes", [], false, "home promo: needs_changes application");
assertHomePromo(
  "approved_pending_access",
  [],
  false,
  "home promo: approved_pending_access application",
);
assertHomePromo(null, workspace, false, "home promo: acting author");

assertSidebarPromo("none", [], true, "sidebar promo: guest / plain listener");
assertSidebarPromo("rejected", [], true, "sidebar promo: rejected application");
assertSidebarPromo("draft", [], true, "sidebar promo: draft application");
assertSidebarPromo("submitted", [], true, "sidebar promo: submitted application");
assertSidebarPromo("in_review", [], true, "sidebar promo: in_review application");
assertSidebarPromo("needs_changes", [], true, "sidebar promo: needs_changes application");
assertSidebarPromo(
  "approved_pending_access",
  [],
  true,
  "sidebar promo: approved_pending_access application",
);
assertSidebarPromo(null, workspace, false, "sidebar promo: active author");

assert(
  sidebar.includes("showSidebarAuthorPromo"),
  "DesktopSidebar gates banner via showSidebarAuthorPromo",
);
assert(
  !sidebar.includes("author-dashboard-banner"),
  "DesktopSidebar no longer renders author-dashboard sidebar banner",
);
assert(
  shellData.includes("showSidebarAuthorPromo"),
  "ListenerShellData exposes showSidebarAuthorPromo",
);
assert(
  shellData.includes("resolveShowSidebarAuthorPromo"),
  "shell-data resolves sidebar promo via shared author-cta helper",
);

console.log("listener-author-promo-unit: ok");
