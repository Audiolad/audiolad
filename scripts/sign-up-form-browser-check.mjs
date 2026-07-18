#!/usr/bin/env node
/**
 * Browser regression for sign-up submit button after forbidden→allowed email change.
 * Usage: BASE_URL=http://127.0.0.1:3000 node scripts/sign-up-form-browser-check.mjs
 */
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function submitState(page) {
  return page.evaluate(() => {
    const button = document.querySelector('[data-testid="sign-up-submit"]');
    const text = (id) =>
      document.querySelector(`#${id}`)?.textContent?.trim() ?? null;
    return {
      disabled: button instanceof HTMLButtonElement ? button.disabled : null,
      emailError: text("sign-up-error-email"),
      firstNameError: text("sign-up-error-firstName"),
      lastNameError: text("sign-up-error-lastName"),
    };
  });
}

async function fillCoreFields(page, email) {
  await page.locator('input[autocomplete="given-name"]').fill("Тест");
  await page.locator('input[autocomplete="family-name"]').fill("Пользователь");
  await page.locator('input[autocomplete="email"]').fill(email);
  await page.locator('input[autocomplete="new-password"]').fill("password123");
  await page.locator('input[type="checkbox"]').first().check();
}

async function testAutofillSync(page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="sign-up-form"]').waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.evaluate(() => {
    const form = document.querySelector('[data-testid="sign-up-form"]');
    if (!(form instanceof HTMLFormElement)) {
      throw new Error("sign-up form missing");
    }

    const setNativeValue = (selector, value) => {
      const element = form.querySelector(selector);
      if (!(element instanceof HTMLInputElement)) {
        throw new Error(`input missing: ${selector}`);
      }

      const descriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      );
      descriptor?.set?.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    };

    setNativeValue('input[autocomplete="given-name"]', "Авто");
    setNativeValue('input[autocomplete="family-name"]', "Заполнение");
    setNativeValue('input[autocomplete="email"]', "123456@yandex.ru");
    setNativeValue('input[autocomplete="new-password"]', "password123");
  });

  await page.locator('input[type="checkbox"]').first().check();
  await page.waitForTimeout(500);
  const state = await submitState(page);
  assert(state.disabled === false, "autofill sync enables submit");
  assert(!state.emailError, "autofill sync leaves email valid");
  assert(!state.firstNameError, "autofill sync leaves first name valid");
  assert(!state.lastNameError, "autofill sync leaves last name valid");
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${BASE_URL}/auth/sign-up`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await fillCoreFields(page, "test@gmail.com");
  let state = await submitState(page);
  assert(state.disabled === true, "gmail keeps submit disabled");
  assert(state.emailError, "gmail shows email error");

  await page.locator('input[autocomplete="email"]').fill("123456@yandex.ru");
  state = await submitState(page);
  assert(state.disabled === false, "allowed email enables submit after gmail");
  assert(!state.emailError, "email error cleared after allowed domain");

  await page.locator('input[autocomplete="email"]').fill("test@yandex.ru");
  state = await submitState(page);
  assert(state.disabled === false, "allowed yandex stays enabled");

  await page.locator('input[autocomplete="email"]').fill("test@gmail.com");
  state = await submitState(page);
  assert(state.disabled === true, "return to gmail disables submit");

  await page.locator('input[autocomplete="email"]').fill("test@yandex.ru");
  state = await submitState(page);
  assert(state.disabled === false, "second return to yandex re-enables submit");
  assert(!state.emailError, "email error cleared on second return");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('input[autocomplete="email"]').fill("123456@yandex.ru");
  await page.locator('input[autocomplete="new-password"]').fill("password123");
  await page.locator('input[type="checkbox"]').first().check();
  state = await submitState(page);
  assert(state.disabled === true, "missing names keep submit disabled");

  await page.locator('input[autocomplete="given-name"]').click();
  await page.locator('input[autocomplete="given-name"]').blur();
  state = await submitState(page);
  assert(state.disabled === true, "missing names still disable submit after name blur");
  assert(
    state.firstNameError === "Укажите имя",
    "empty first name shows message after interaction",
  );

  await fillCoreFields(page, "123456@yandex.ru");
  state = await submitState(page);
  assert(state.disabled === false, "filled names and allowed email enable submit");

  await testAutofillSync(page);

  await browser.close();
  console.log("sign-up-form-browser-check: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
