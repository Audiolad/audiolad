/**
 * Classica card save feedback: idle, pending, and success stay distinct.
 * Run: npx tsx scripts/classica-card-save-feedback-unit.tsx
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { renderToStaticMarkup } from "react-dom/server";

import ClassicaCardSaveButton from "../src/components/classica/ClassicaCardSaveButton";
import { classicaIdleState } from "../src/lib/classica/production/action-state";
import {
  CLASSICA_CARD_SAVE_IDLE_LABEL,
  CLASSICA_CARD_SAVE_PENDING_LABEL,
  CLASSICA_CARD_SAVE_SUCCESS_CLASS,
  CLASSICA_CARD_SAVE_SUCCESS_LABEL,
  CLASSICA_CARD_SAVE_SUCCESS_MS,
  classicaCardSaveButtonView,
  classicaCardSavePhase,
  classicaCardSavedState,
  isClassicaCardSaveSuccess,
} from "../src/lib/classica/production/card-save-feedback";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function buttonMarkup(phase: "idle" | "pending" | "success") {
  return renderToStaticMarkup(<ClassicaCardSaveButton phase={phase} />);
}

assert.equal(isClassicaCardSaveSuccess(classicaIdleState), false);
assert.equal(classicaIdleState.error, null);
assert.equal("ok" in classicaIdleState, false);
assert.equal("message" in classicaIdleState, false);

const saved = classicaCardSavedState();
assert.equal(isClassicaCardSaveSuccess(saved), true);
assert.deepEqual(saved, {
  error: null,
  ok: true,
  message: CLASSICA_CARD_SAVE_SUCCESS_LABEL,
});
assert.notDeepEqual(saved, classicaIdleState);
assert.equal(
  isClassicaCardSaveSuccess({ error: "Год: число от 1 до 2100 или пусто.", ok: true }),
  false,
  "an error is not a successful save",
);

assert.equal(
  classicaCardSavePhase({ pending: false, succeeded: false, successDismissed: false }),
  "idle",
);
assert.equal(
  classicaCardSavePhase({ pending: true, succeeded: false, successDismissed: false }),
  "pending",
);
assert.equal(
  classicaCardSavePhase({ pending: true, succeeded: true, successDismissed: false }),
  "pending",
  "a new submit stays pending and does not show success yet",
);
assert.equal(
  classicaCardSavePhase({ pending: false, succeeded: true, successDismissed: false }),
  "success",
);
assert.equal(
  classicaCardSavePhase({ pending: false, succeeded: true, successDismissed: true }),
  "idle",
  "after the saved label expires the button returns to idle",
);
assert.equal(
  classicaCardSavePhase({ pending: false, succeeded: false, successDismissed: false }),
  "idle",
);

assert.ok(
  CLASSICA_CARD_SAVE_SUCCESS_MS >= 2000 && CLASSICA_CARD_SAVE_SUCCESS_MS <= 3000,
  "saved label stays visible for about 2–3 seconds",
);

assert.equal(classicaCardSaveButtonView("idle").label, CLASSICA_CARD_SAVE_IDLE_LABEL);
assert.equal(classicaCardSaveButtonView("idle").label, "Сохранить карточку");
assert.equal(classicaCardSaveButtonView("idle").disabled, false);
assert.match(classicaCardSaveButtonView("idle").className, /bg-\[#7042c5\]/);
assert.doesNotMatch(classicaCardSaveButtonView("idle").className, /bg-\[#2f7d4a\]/);

assert.equal(classicaCardSaveButtonView("pending").label, "Сохраняю…");
assert.equal(classicaCardSaveButtonView("pending").disabled, true);
assert.equal(CLASSICA_CARD_SAVE_PENDING_LABEL, "Сохраняю…");

assert.equal(classicaCardSaveButtonView("success").label, "✓ Сохранено");
assert.equal(classicaCardSaveButtonView("success").disabled, false);
assert.equal(classicaCardSaveButtonView("success").className, CLASSICA_CARD_SAVE_SUCCESS_CLASS);
assert.match(classicaCardSaveButtonView("success").className, /bg-\[#2f7d4a\]/);
assert.notEqual(
  classicaCardSaveButtonView("success").className,
  classicaCardSaveButtonView("idle").className,
);

const errorView = classicaCardSaveButtonView(
  classicaCardSavePhase({ pending: false, succeeded: false, successDismissed: false }),
);
assert.equal(errorView.label, "Сохранить карточку");
assert.notEqual(errorView.label, CLASSICA_CARD_SAVE_SUCCESS_LABEL);
assert.equal(errorView.disabled, false);

const idleMarkup = buttonMarkup("idle");
assert.match(idleMarkup, /data-save-phase="idle"/);
assert.match(idleMarkup, />Сохранить карточку</);
assert.doesNotMatch(idleMarkup, /disabled/);
assert.doesNotMatch(idleMarkup, /Сохраняю|Сохранено/);
assert.match(idleMarkup, /bg-\[#7042c5\]/);

const pendingMarkup = buttonMarkup("pending");
assert.match(pendingMarkup, /data-save-phase="pending"/);
assert.match(pendingMarkup, />Сохраняю…</);
assert.match(pendingMarkup, /disabled=""/);
assert.doesNotMatch(pendingMarkup, /Сохранить карточку|✓ Сохранено/);

const successMarkup = buttonMarkup("success");
assert.match(successMarkup, /data-save-phase="success"/);
assert.match(successMarkup, />✓ Сохранено</);
assert.match(successMarkup, /bg-\[#2f7d4a\]/);
assert.doesNotMatch(successMarkup, /disabled/);
assert.doesNotMatch(successMarkup, /Сохранить карточку|Сохраняю/);

const form = read("src/components/classica/ClassicaCardForm.tsx");
assert.match(form, /useActionState\(saveClassicaCardAction, classicaIdleState\)/);
assert.match(form, /const \[state, action, pending\]/);
assert.match(form, /CLASSICA_CARD_SAVE_SUCCESS_MS/);
assert.match(form, /classicaCardSavePhase/);
assert.match(form, /isClassicaCardSaveSuccess\(state\)/);
assert.match(form, /setHiddenSuccess\(state\)/);
assert.match(form, /text-\[#9b2c4a\]/);
assert.match(form, /<ClassicaCardSaveButton phase=\{phase\} \/>/);
assert.doesNotMatch(form, /location\.reload|scrollIntoView|window\.scroll|router\.(push|replace|refresh)/);
assert.doesNotMatch(form, /redirect\(/);

const actions = read("src/lib/classica/production/actions.ts");
const saveAction = actions.slice(
  actions.indexOf("export async function saveClassicaCardAction"),
  actions.indexOf("export async function takeClassicaJobAction"),
);
assert.ok(saveAction.includes("classica_production_save_card"));
assert.match(saveAction, /revalidateJob\(jobId\)/);
assert.match(saveAction, /return classicaCardSavedState\(\)/);
assert.doesNotMatch(saveAction, /return classicaIdleState/);
assert.doesNotMatch(saveAction, /redirect\(/);
assert.ok(
  saveAction.indexOf("if (error)") < saveAction.indexOf("return classicaCardSavedState()"),
  "success is returned only after the save error check",
);
assert.match(saveAction, /return fail\(error\)/);
assert.match(saveAction, /Стоимость: целое число рублей, можно 0\./);
assert.match(saveAction, /Год: число от 1 до 2100 или пусто\./);

console.log("classica-card-save-feedback-unit: ok");
