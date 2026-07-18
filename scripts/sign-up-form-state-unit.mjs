#!/usr/bin/env node
/**
 * Regression tests for sign-up client form readiness and email domain transitions.
 */
import {
  SIGNUP_FIRST_NAME_REQUIRED_MESSAGE,
  SIGNUP_LAST_NAME_REQUIRED_MESSAGE,
  clearSignUpClientFieldError,
  evaluateSignUpClientFormState,
} from "../src/lib/auth/sign-up-client-form.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const VALID_BASE = {
  firstName: "Иван",
  lastName: "Петров",
  email: "new-user@yandex.ru",
  password: "password123",
  legalConsent: true,
};

function ready(values = VALID_BASE, fieldErrors = {}, interaction = {}) {
  return evaluateSignUpClientFormState(values, fieldErrors, interaction);
}

function testAllowedDomainsImmediately() {
  for (const email of [
    "new-user@yandex.ru",
    "new-user@mail.ru",
    "user@inbox.ru",
    "user@list.ru",
    "user@bk.ru",
    "user@internet.ru",
    "user@ya.ru",
    "user@rambler.ru",
  ]) {
    const state = ready({ ...VALID_BASE, email });
    assert(state.isSubmitReady, `allowed email should enable submit: ${email}`);
    assert(!state.emailFieldInvalid, `allowed email should not be invalid: ${email}`);
  }
}

function testForbiddenToAllowedActivatesButton() {
  const fieldErrors = {};

  let state = ready({ ...VALID_BASE, email: "test@gmail.com" }, fieldErrors);
  assert(!state.isSubmitReady, "gmail blocks submit");
  assert(state.emailFieldInvalid, "gmail shows email error");

  state = ready({ ...VALID_BASE, email: "test@yandex.ru" }, fieldErrors);
  assert(state.isSubmitReady, "yandex enables submit after gmail");
  assert(!state.emailFieldInvalid, "yandex clears email error after gmail");
  assert(!state.emailErrorMessage, "no stale email error message");

  state = ready({ ...VALID_BASE, email: "test@icloud.com" }, fieldErrors);
  assert(!state.isSubmitReady, "icloud blocks submit");

  state = ready({ ...VALID_BASE, email: "test@mail.ru" }, fieldErrors);
  assert(state.isSubmitReady, "mail.ru enables submit after icloud");
}

function testAllowedForbiddenAllowedCycle() {
  const fieldErrors = {};

  assert(ready({ ...VALID_BASE, email: "test@yandex.ru" }, fieldErrors).isSubmitReady);
  assert(!ready({ ...VALID_BASE, email: "test@gmail.com" }, fieldErrors).isSubmitReady);
  const final = ready({ ...VALID_BASE, email: "test@yandex.ru" }, fieldErrors);
  assert(final.isSubmitReady, "return to yandex re-enables submit");
  assert(!final.emailFieldInvalid, "return to yandex clears email error");
}

function testStaleServerEmailErrorClearsOnFieldChange() {
  const fieldErrors = {
    email:
      "Если этот адрес уже зарегистрирован, войдите в аккаунт или восстановите пароль.",
  };

  let state = ready({ ...VALID_BASE, email: "123456@yandex.ru" }, fieldErrors);
  assert(!state.isSubmitReady, "server email error blocks submit");
  assert(state.emailFieldInvalid, "server email error is visible");

  const cleared = clearSignUpClientFieldError(fieldErrors, "email");
  state = ready({ ...VALID_BASE, email: "123456@yandex.ru" }, cleared);
  assert(state.isSubmitReady, "submit ready after clearing stale server email error");
  assert(!state.emailFieldInvalid, "email field valid after clearing stale server error");
}

function testInvalidFormat() {
  for (const email of ["test@", "test", "@yandex.ru"]) {
    const state = ready({ ...VALID_BASE, email });
    assert(!state.isSubmitReady, `invalid format blocks submit: ${email}`);
    assert(state.emailFieldInvalid, `invalid format shows error: ${email}`);
  }
}

function testCheckboxes() {
  assert(!ready({ ...VALID_BASE, legalConsent: false }).isSubmitReady, "legal consent required");
  assert(ready({ ...VALID_BASE, legalConsent: true }).isSubmitReady, "legal consent enables");
}

function testPassword() {
  assert(!ready({ ...VALID_BASE, password: "" }).isSubmitReady, "empty password blocks");
  assert(!ready({ ...VALID_BASE, password: "1234567" }).isSubmitReady, "short password blocks");
  assert(
    ready({ ...VALID_BASE, password: "1234567" }).passwordFieldInvalid,
    "short password shows live error",
  );
  assert(ready({ ...VALID_BASE, password: "password123" }).isSubmitReady, "valid password enables");
}

function testEmptyFirstNameAfterInteraction() {
  let state = ready({ ...VALID_BASE, firstName: "" }, {}, { firstNameTouched: true });
  assert(!state.isSubmitReady, "empty first name blocks submit");
  assert(
    state.firstNameErrorMessage === SIGNUP_FIRST_NAME_REQUIRED_MESSAGE,
    "empty first name shows required message after interaction",
  );

  state = ready({ ...VALID_BASE, firstName: "" }, {}, {});
  assert(!state.isSubmitReady, "empty first name blocks submit before interaction");
  assert(!state.firstNameErrorMessage, "empty first name silent before interaction");
}

function testEmptyLastNameAfterInteraction() {
  let state = ready({ ...VALID_BASE, lastName: "" }, {}, { lastNameTouched: true });
  assert(!state.isSubmitReady, "empty last name blocks submit");
  assert(
    state.lastNameErrorMessage === SIGNUP_LAST_NAME_REQUIRED_MESSAGE,
    "empty last name shows required message after interaction",
  );

  state = ready({ ...VALID_BASE, lastName: "" }, {}, {});
  assert(!state.isSubmitReady, "empty last name blocks submit before interaction");
  assert(!state.lastNameErrorMessage, "empty last name silent before interaction");
}

function testFilledNamesEnableSubmit() {
  const state = ready({ ...VALID_BASE });
  assert(state.isSubmitReady, "filled names enable submit with other valid fields");
  assert(!state.firstNameErrorMessage, "filled first name has no error");
  assert(!state.lastNameErrorMessage, "filled last name has no error");
}

function testWhitespaceOnlyNamesAreEmpty() {
  let state = ready({ ...VALID_BASE, firstName: "   " }, {}, { firstNameTouched: true });
  assert(!state.isSubmitReady, "firstName with whitespace blocks submit");
  assert(state.firstNameErrorMessage, "firstName with whitespace shows error after interaction");

  state = ready({ ...VALID_BASE, lastName: "   " }, {}, { lastNameTouched: true });
  assert(!state.isSubmitReady, "lastName with whitespace blocks submit");
  assert(state.lastNameErrorMessage, "lastName with whitespace shows error after interaction");
}

function testStaleServerNameErrorsClearOnFieldChange() {
  for (const field of ["firstName", "lastName"]) {
    const fieldErrors = { [field]: "Серверная ошибка имени." };
    let state = ready({ ...VALID_BASE }, fieldErrors);
    assert(!state.isSubmitReady, `server ${field} error blocks submit`);
    assert(state[`${field}ErrorMessage`], `server ${field} error is visible`);

    const cleared = clearSignUpClientFieldError(fieldErrors, field);
    state = ready({ ...VALID_BASE }, cleared);
    assert(state.isSubmitReady, `submit ready after clearing stale server ${field} error`);
    assert(!state[`${field}FieldInvalid`], `${field} valid after clearing stale server error`);
  }
}

function testSubmitAttemptShowsNameErrors() {
  const state = ready(
    { ...VALID_BASE, firstName: "", lastName: "" },
    {},
    { submitAttempted: true },
  );
  assert(!state.isSubmitReady, "submit attempt with empty names blocks submit");
  assert(
    state.firstNameErrorMessage === SIGNUP_FIRST_NAME_REQUIRED_MESSAGE,
    "submit attempt shows first name error",
  );
  assert(
    state.lastNameErrorMessage === SIGNUP_LAST_NAME_REQUIRED_MESSAGE,
    "submit attempt shows last name error",
  );
}

function main() {
  testAllowedDomainsImmediately();
  testForbiddenToAllowedActivatesButton();
  testAllowedForbiddenAllowedCycle();
  testStaleServerEmailErrorClearsOnFieldChange();
  testInvalidFormat();
  testCheckboxes();
  testPassword();
  testEmptyFirstNameAfterInteraction();
  testEmptyLastNameAfterInteraction();
  testFilledNamesEnableSubmit();
  testWhitespaceOnlyNamesAreEmpty();
  testStaleServerNameErrorsClearOnFieldChange();
  testSubmitAttemptShowsNameErrors();
  console.log("sign-up-form-state-unit: ok");
}

main();
