#!/usr/bin/env node
/**
 * Become-author promo visibility — shared with listener shell CTA resolver.
 */
import assert from "node:assert/strict";

import {
  resolveListenerAuthorCta,
  resolveShowBecomeAuthorPromo,
} from "../src/lib/listener/author-cta.ts";

const workspace = [{ id: "a1", slug: "sergey", name: "Sergey" }];

function assertPromo(variant, workspaces, expected, label) {
  const applicationVariant = variant;
  const actual = resolveShowBecomeAuthorPromo({ workspaces, applicationVariant });
  assert.equal(actual, expected, label);
  const cta = resolveListenerAuthorCta({ workspaces, applicationVariant });
  if (expected) {
    assert(
      cta.label === "Стать автором" || cta.label === "Посмотреть решение",
      `${label}: visible promo aligns with listener CTA (${cta.label})`,
    );
  } else if (workspaces.length > 0) {
    assert.equal(cta.label, "Кабинет автора", `${label}: author CTA`);
  } else {
    assert.notEqual(
      cta.label,
      "Стать автором",
      `${label}: hidden promo aligns with non-default listener CTA (${cta.label})`,
    );
  }
}

assertPromo("none", [], true, "plain listener");
assertPromo("rejected", [], true, "rejected application");
assertPromo("draft", [], false, "draft application");
assertPromo("submitted", [], false, "submitted application");
assertPromo("in_review", [], false, "in_review application");
assertPromo("needs_changes", [], false, "needs_changes application");
assertPromo(
  "approved_pending_access",
  [],
  false,
  "approved_pending_access application",
);
assertPromo(null, workspace, false, "acting author");

console.log("listener-author-promo-unit: ok");
