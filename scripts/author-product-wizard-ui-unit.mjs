#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AURAFON_AUTHOR_ID } from "../src/lib/authors/aurafon.ts";
import { isAuthorProductWizardEnabled } from "../src/lib/author-products/product-wizard-beta.ts";
import {
  PRODUCT_WIZARD_DEFAULT_STEP,
  PRODUCT_WIZARD_STEPS,
  parseProductWizardStep,
} from "../src/lib/author-products/product-wizard-steps.ts";
import {
  buildAuthorProductEditPath,
  buildWizardStepHref,
  nextProductWizardStep,
  previousProductWizardStep,
  readProductWizardStepFromSearch,
  shouldShowProductWizardStep,
} from "../src/lib/author-products/product-wizard-navigation.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
const OTHER = "00000000-0000-4000-8000-000000000099";

// A. Gate
assert.equal(isAuthorProductWizardEnabled(AURAFON_AUTHOR_ID), true);
assert.equal(isAuthorProductWizardEnabled(OTHER), false);
assert.equal(isAuthorProductWizardEnabled(null), false);

// B. Step parsing / URL helpers
assert.equal(parseProductWizardStep(null), 1);
assert.equal(parseProductWizardStep(""), 1);
assert.equal(parseProductWizardStep("9"), 1);
assert.equal(parseProductWizardStep("abc"), 1);
assert.equal(parseProductWizardStep("2"), 2);
assert.equal(parseProductWizardStep(4), 4);
assert.equal(readProductWizardStepFromSearch("?author=x&step=3"), 3);
assert.equal(readProductWizardStepFromSearch("?author=x"), 1);
assert.equal(readProductWizardStepFromSearch(""), PRODUCT_WIZARD_DEFAULT_STEP);

assert.equal(
  buildWizardStepHref("/author-dashboard/products/new", "?author=aurafon&class=practice", 2),
  "/author-dashboard/products/new?author=aurafon&class=practice&step=2",
);
assert.equal(
  buildAuthorProductEditPath("pid-1", {
    step: 1,
    preserveSearch: "?author=aurafon",
    includeStep: true,
  }),
  "/author-dashboard/products/pid-1?author=aurafon&step=1",
);
assert.equal(
  buildAuthorProductEditPath("pid-1"),
  "/author-dashboard/products/pid-1",
);
assert.equal(nextProductWizardStep(1), 2);
assert.equal(nextProductWizardStep(4), null);
assert.equal(previousProductWizardStep(1), null);
assert.equal(previousProductWizardStep(3), 2);

assert.equal(
  shouldShowProductWizardStep({ wizardEnabled: false, activeStep: 2, step: 1 }),
  true,
);
assert.equal(
  shouldShowProductWizardStep({ wizardEnabled: true, activeStep: 2, step: 1 }),
  false,
);
assert.equal(
  shouldShowProductWizardStep({ wizardEnabled: true, activeStep: 2, step: 2 }),
  true,
);

assert.equal(PRODUCT_WIZARD_STEPS.length, 4);
assert.deepEqual(
  PRODUCT_WIZARD_STEPS.map((s) => s.label),
  ["Основное", "Материалы", "Описание и продвижение", "Условия и публикация"],
);

// C/D/E/F — structural form contracts
const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
const stepper = read(
  "src/components/author-dashboard/product-wizard/AuthorProductWizardStepper.tsx",
);
const stepNav = read(
  "src/components/author-dashboard/product-wizard/AuthorProductWizardStepNav.tsx",
);

assert.match(form, /isAuthorProductWizardEnabled\(form\.authorId\)/);
assert.match(form, /AuthorProductWizardStepper/);
assert.match(form, /AuthorProductWizardStepNav/);
assert.match(form, /showWizardStep\(1\)/);
assert.match(form, /showWizardStep\(2\)/);
assert.match(form, /showWizardStep\(3\)/);
assert.match(form, /showWizardStep\(4\)/);
assert.match(form, /saveWizardStepAndContinue/);
assert.match(form, /buildAuthorProductEditPath/);
assert.match(form, /includeStep:\s*true/);
assert.match(form, /window\.history\.replaceState/);
assert.match(form, /buildWizardStepHref/);

// Save & Continue only advances after successful save
assert.match(
  form,
  /async function saveWizardStepAndContinue\(\) \{[\s\S]*const saved = await saveProduct\(\);[\s\S]*if \(!saved\) \{\s*return;[\s\S]*goToWizardStep\(next\)/,
);

// Create draft URL preserves step for wizard
assert.match(
  form,
  /wizardEnabled\s*\?\s*buildAuthorProductEditPath\(created\.practice\.id, \{[\s\S]*includeStep:\s*true/,
);
assert.match(
  form,
  /: buildAuthorProductEditPath\(created\.practice\.id\)/,
);

// Legacy keeps full actions when wizard off
assert.match(form, /\{!wizardEnabled \? \([\s\S]*<AuthorProductFormActions/);
// Wizard step 4 uses actions; steps 1-3 use step nav continue
assert.match(stepNav, /Сохранить и продолжить/);
assert.match(stepNav, /Назад/);
assert.match(stepper, /Шаги создания продукта/);

// Composition landmarks still present in form source (shared JSX)
assert.match(form, /Основная информация/);
assert.match(form, /Публичный формат/);
assert.match(form, /CoverUploadBlock/);
assert.match(form, /AuthorProductGallery|CATALOG_GALLERY_MAX_SLIDES|gallery_slides/);
assert.match(form, /Содержание аудиопродукта/);
assert.match(form, /AUTHOR_DESCRIPTION_LABEL|description/);
assert.match(form, /Темы/);
assert.match(form, /AuthorProductSeoSection/);
assert.match(form, /Кому показывать продукт\?/);
assert.match(form, /AuthorProductListeningNoticeSection/);
assert.match(form, /AuthorProductPostListenPromoSection/);
assert.match(form, /AuthorProductFormActions/);

// Step gating associations in source
const step1Slice = form.slice(
  form.indexOf("showWizardStep(1) ? ("),
  form.indexOf("showWizardStep(3) ? (", form.indexOf("showWizardStep(1) ? (") + 1),
);
assert.match(step1Slice, /Название|title/);
assert.doesNotMatch(step1Slice, /CoverUploadBlock/);
assert.doesNotMatch(step1Slice, /AuthorProductSeoSection/);

assert.match(form, /showWizardStep\(2\)[\s\S]*CoverUploadBlock/);
assert.match(form, /showWizardStep\(2\) && !isCourse/);
assert.match(form, /showWizardStep\(3\) \? \(\s*<AuthorProductSeoSection/);
assert.match(form, /showWizardStep\(4\)[\s\S]*Кому показывать продукт\?/);
assert.match(form, /wizardEnabled && wizardStep === PRODUCT_WIZARD_STEP_COUNT[\s\S]*AuthorProductFormActions/);

// No second controller / no new product fields / no reservation
assert.doesNotMatch(form, /AurafonProductForm/);
assert.doesNotMatch(form, /LegacyAuthorProductForm/);
// audio_product_author added in Aurafon music wizard refine PR
assert.doesNotMatch(form, /rightsDeclaration|declarationOfRights/);
assert.doesNotMatch(form, /reservation/);

// Gallery limit unchanged reference still in repo
const gallery = read("src/lib/catalog/gallery.ts");
assert.match(gallery, /CATALOG_GALLERY_MAX_SLIDES\s*=\s*30/);


const editPage = read("src/app/(platform)/author-dashboard/products/[id]/page.tsx");
const newPage = read("src/app/(platform)/author-dashboard/products/new/page.tsx");
assert.match(editPage, /parseProductWizardStep/);
assert.match(editPage, /initialWizardStep=\{initialWizardStep\}/);
assert.match(newPage, /parseProductWizardStep/);
assert.match(newPage, /initialWizardStep=\{initialWizardStep\}/);
assert.match(form, /initialWizardStep/);

console.log("author-product-wizard-ui-unit: ok");
