#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AURAFON_AUTHOR_ID,
  AURAFON_AUTHOR_SLUG,
  isAurafonAuthor,
} from "../src/lib/authors/aurafon.ts";
import { isAuthorProductWizardEnabled } from "../src/lib/author-products/product-wizard-beta.ts";
import {
  PRODUCT_WIZARD_DEFAULT_STEP,
  PRODUCT_WIZARD_STEP_COUNT,
  PRODUCT_WIZARD_STEPS,
  getProductWizardStepLabel,
  parseProductWizardStep,
} from "../src/lib/author-products/product-wizard-steps.ts";
import {
  AURAFON_AUTHOR_ID as DISCOVERY_AURAFON_AUTHOR_ID,
  AURAFON_AUTHOR_SLUG as DISCOVERY_AURAFON_AUTHOR_SLUG,
  isAuthorSeoDiscoveryEnabled,
} from "../src/lib/seo-queries/discovery-beta.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

const OTHER_AUTHOR_ID = "00000000-0000-4000-8000-000000000099";
const AURAFON_UUID = "59c7e5b8-eae4-4394-82fb-b815a10be6c2";

// --- A. Shared Aurafon identity ---
assert.equal(AURAFON_AUTHOR_ID, AURAFON_UUID);
assert.equal(AURAFON_AUTHOR_SLUG, "aurafon");
assert.equal(isAurafonAuthor(AURAFON_AUTHOR_ID), true);
assert.equal(isAurafonAuthor(OTHER_AUTHOR_ID), false);
assert.equal(isAurafonAuthor(null), false);
assert.equal(isAurafonAuthor(undefined), false);
assert.equal(isAurafonAuthor(""), false);
assert.equal(isAurafonAuthor("   "), false);
assert.equal(isAurafonAuthor(`  ${AURAFON_AUTHOR_ID}  `), true);

const aurafonIdentity = read("src/lib/authors/aurafon.ts");
assert.match(aurafonIdentity, /59c7e5b8-eae4-4394-82fb-b815a10be6c2/);
assert.match(aurafonIdentity, /export const AURAFON_AUTHOR_ID/);
assert.match(aurafonIdentity, /export function isAurafonAuthor/);

// --- A. Product wizard gate ---
assert.equal(isAuthorProductWizardEnabled(AURAFON_AUTHOR_ID), true);
assert.equal(isAuthorProductWizardEnabled(OTHER_AUTHOR_ID), false);
assert.equal(isAuthorProductWizardEnabled(null), false);
assert.equal(isAuthorProductWizardEnabled(undefined), false);
assert.equal(isAuthorProductWizardEnabled(""), false);
assert.equal(isAuthorProductWizardEnabled("   "), false);
assert.equal(isAuthorProductWizardEnabled(`  ${AURAFON_AUTHOR_ID}  `), true);

const wizardBeta = read("src/lib/author-products/product-wizard-beta.ts");
assert.match(wizardBeta, /isAurafonAuthor/);
assert.match(wizardBeta, /from \"@\/lib\/authors\/aurafon\"/);
assert.doesNotMatch(wizardBeta, /59c7e5b8-eae4-4394-82fb-b815a10be6c2/);
assert.doesNotMatch(wizardBeta, /isAuthorSeoDiscoveryEnabled/);
assert.doesNotMatch(wizardBeta, /seo-queries\/discovery-beta/);

const wizardStepsSrc = read("src/lib/author-products/product-wizard-steps.ts");
assert.doesNotMatch(wizardStepsSrc, /59c7e5b8-eae4-4394-82fb-b815a10be6c2/);

// --- B. SEO discovery regression (re-exports + behavior) ---
assert.equal(DISCOVERY_AURAFON_AUTHOR_ID, AURAFON_AUTHOR_ID);
assert.equal(DISCOVERY_AURAFON_AUTHOR_SLUG, AURAFON_AUTHOR_SLUG);
assert.equal(isAuthorSeoDiscoveryEnabled(AURAFON_AUTHOR_ID), true);
assert.equal(isAuthorSeoDiscoveryEnabled(OTHER_AUTHOR_ID), false);
assert.equal(isAuthorSeoDiscoveryEnabled(""), false);
assert.equal(isAuthorSeoDiscoveryEnabled(null), false);
assert.equal(isAuthorSeoDiscoveryEnabled(undefined), false);
assert.equal(isAuthorSeoDiscoveryEnabled("   "), false);

const discoveryBeta = read("src/lib/seo-queries/discovery-beta.ts");
assert.match(discoveryBeta, /from \"@\/lib\/authors\/aurafon\"/);
assert.match(discoveryBeta, /isAurafonAuthor/);
assert.doesNotMatch(discoveryBeta, /59c7e5b8-eae4-4394-82fb-b815a10be6c2/);
assert.doesNotMatch(discoveryBeta, /isAuthorProductWizardEnabled/);

// --- C. Wizard steps contract ---
assert.equal(PRODUCT_WIZARD_STEP_COUNT, 4);
assert.equal(PRODUCT_WIZARD_STEPS.length, 4);
assert.deepEqual(
  PRODUCT_WIZARD_STEPS.map((item) => item.step),
  [1, 2, 3, 4],
);
assert.deepEqual(
  PRODUCT_WIZARD_STEPS.map((item) => item.label),
  [
    "Основное",
    "Материалы",
    "Описание и продвижение",
    "Условия и публикация",
  ],
);
assert.equal(getProductWizardStepLabel(1), "Основное");
assert.equal(getProductWizardStepLabel(2), "Материалы");
assert.equal(getProductWizardStepLabel(3), "Описание и продвижение");
assert.equal(getProductWizardStepLabel(4), "Условия и публикация");
assert.equal(PRODUCT_WIZARD_DEFAULT_STEP, 1);

assert.equal(parseProductWizardStep(undefined), 1);
assert.equal(parseProductWizardStep(null), 1);
assert.equal(parseProductWizardStep(""), 1);
assert.equal(parseProductWizardStep("   "), 1);
assert.equal(parseProductWizardStep("1"), 1);
assert.equal(parseProductWizardStep("2"), 2);
assert.equal(parseProductWizardStep("3"), 3);
assert.equal(parseProductWizardStep("4"), 4);
assert.equal(parseProductWizardStep(1), 1);
assert.equal(parseProductWizardStep(2), 2);
assert.equal(parseProductWizardStep(3), 3);
assert.equal(parseProductWizardStep(4), 4);
assert.equal(parseProductWizardStep("0"), 1);
assert.equal(parseProductWizardStep("5"), 1);
assert.equal(parseProductWizardStep("abc"), 1);
assert.equal(parseProductWizardStep("1.5"), 1);
assert.equal(parseProductWizardStep(" 2 "), 2);

// Aurafon wizard UI wires the foundation gate + step contract into the live form.
const productForm = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(productForm, /isAuthorProductWizardEnabled\(form\.authorId\)/);
assert.match(productForm, /product-wizard-beta/);
assert.match(productForm, /product-wizard-steps/);
assert.match(productForm, /PRODUCT_WIZARD_STEPS|PRODUCT_WIZARD_STEP_COUNT|ProductWizardStep/);
assert.doesNotMatch(productForm, /parseProductWizardStep/);
assert.match(productForm, /readProductWizardStepFromSearch|buildWizardStepHref/);

console.log("author-product-wizard-foundation-unit: ok");
