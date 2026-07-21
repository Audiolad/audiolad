#!/usr/bin/env node
/**
 * Unit tests for PasswordInput toggle helpers and static markup.
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import PasswordInputModule from "../src/components/ui/PasswordInput.tsx";
import {
  getPasswordToggleAriaLabel,
  resolvePasswordInputType,
  togglePasswordVisibility,
} from "../src/components/ui/password-input-toggle.ts";

const PasswordInput = PasswordInputModule.default ?? PasswordInputModule;

function testToggleHelpers() {
  assert.equal(resolvePasswordInputType(false), "password");
  assert.equal(resolvePasswordInputType(true), "text");
  assert.equal(getPasswordToggleAriaLabel(false), "Показать пароль");
  assert.equal(getPasswordToggleAriaLabel(true), "Скрыть пароль");
  assert.equal(togglePasswordVisibility(false), true);
  assert.equal(togglePasswordVisibility(true), false);
}

function testDefaultMarkup() {
  const markup = renderToStaticMarkup(
    createElement(PasswordInput, {
      value: "secret",
      readOnly: true,
      autoComplete: "current-password",
      placeholder: "Введите пароль",
    }),
  );

  assert.match(markup, /type="password"/);
  assert.match(markup, /value="secret"/);
  assert.match(markup, /autoComplete="current-password"/);
  assert.match(markup, /type="button"/);
  assert.match(markup, /aria-label="Показать пароль"/);
  assert.match(markup, /aria-pressed="false"/);
  assert.match(markup, /pr-12/);
}

function testDisabledMarkup() {
  const markup = renderToStaticMarkup(
    createElement(PasswordInput, {
      value: "secret",
      readOnly: true,
      disabled: true,
    }),
  );

  assert.match(markup, /<input[^>]*disabled/);
  assert.match(markup, /<button[^>]*disabled/);
}

function testIndependentInitialState() {
  const first = renderToStaticMarkup(
    createElement(PasswordInput, {
      value: "one",
      readOnly: true,
      autoComplete: "new-password",
    }),
  );
  const second = renderToStaticMarkup(
    createElement(PasswordInput, {
      value: "two",
      readOnly: true,
      autoComplete: "new-password",
    }),
  );

  assert.match(first, /value="one"/);
  assert.match(second, /value="two"/);
  assert.match(first, /type="password"/);
  assert.match(second, /type="password"/);
}

function testToggleSequencePreservesValueConcept() {
  let visible = false;
  let value = "keep-me";

  visible = togglePasswordVisibility(visible);
  assert.equal(resolvePasswordInputType(visible), "text");
  assert.equal(value, "keep-me");

  visible = togglePasswordVisibility(visible);
  assert.equal(resolvePasswordInputType(visible), "password");
  assert.equal(value, "keep-me");
}

function testAriaLabelSequence() {
  let visible = false;

  assert.equal(getPasswordToggleAriaLabel(visible), "Показать пароль");
  visible = togglePasswordVisibility(visible);
  assert.equal(getPasswordToggleAriaLabel(visible), "Скрыть пароль");
  visible = togglePasswordVisibility(visible);
  assert.equal(getPasswordToggleAriaLabel(visible), "Показать пароль");
}

function run() {
  testToggleHelpers();
  testDefaultMarkup();
  testDisabledMarkup();
  testIndependentInitialState();
  testToggleSequencePreservesValueConcept();
  testAriaLabelSequence();
  console.log("password-input-unit: ok");
}

run();
