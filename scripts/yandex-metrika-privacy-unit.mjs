#!/usr/bin/env node
/**
 * Yandex Metrika Webvisor privacy masking unit checks.
 */
import assert from "node:assert/strict";

import {
  maskSensitiveFieldsForTests,
  resetYandexMetrikaPrivacyMaskingForTests,
} from "../src/lib/analytics/yandex-metrika-privacy.ts";

globalThis.document = {};

function matchSelector(element, selector) {
  const parts = selector.split(",").map((part) => part.trim());

  return parts.some((part) => {
    if (part === "input") {
      return element.tagName === "INPUT";
    }

    if (part === "textarea") {
      return element.tagName === "TEXTAREA";
    }

    if (part === "select") {
      return element.tagName === "SELECT";
    }

    if (part === "[contenteditable='true']" || part === "[contenteditable='']") {
      return element.attrs.contenteditable !== undefined;
    }

    if (part === "[data-admin-panel]") {
      return element.attrs["data-admin-panel"] !== undefined;
    }

    if (part === "[data-admin-form]") {
      return element.attrs["data-admin-form"] !== undefined;
    }

    return false;
  });
}

function createElement(tag, attrs = {}) {
  const children = [];
  const classes = new Set();

  const element = {
    tagName: tag.toUpperCase(),
    attrs: { ...attrs },
    children,
    parent: null,
    classList: {
      add(className) {
        classes.add(className);
      },
      contains(className) {
        return classes.has(className);
      },
    },
    appendChild(child) {
      children.push(child);
      child.parent = element;
      return child;
    },
    matches(selector) {
      return matchSelector(element, selector);
    },
    querySelectorAll(selector) {
      const results = [];

      function walk(node) {
        for (const child of node.children) {
          if (matchSelector(child, selector)) {
            results.push(child);
          }

          walk(child);
        }
      }

      walk(element);
      return results;
    },
    closest(selector) {
      let node = element.parent;

      while (node) {
        if (matchSelector(node, selector)) {
          return node;
        }

        node = node.parent;
      }

      return null;
    },
  };

  return element;
}

function testStaticInput() {
  const root = createElement("div");
  const input = createElement("input");
  root.appendChild(input);

  maskSensitiveFieldsForTests(root);

  assert.equal(input.classList.contains("ym-disable-keys"), true, "static input");
}

function testInputInsideAddedContainer() {
  const root = createElement("div");
  const input = createElement("input");
  root.appendChild(input);

  maskSensitiveFieldsForTests(root);

  assert.equal(input.classList.contains("ym-disable-keys"), true, "container child input");
}

function testBareLeafNodes() {
  for (const [tag, label, attrs] of [
    ["input", "bare input", {}],
    ["textarea", "bare textarea", {}],
    ["select", "bare select", {}],
    ["div", "contenteditable div", { contenteditable: "true" }],
  ]) {
    const node = createElement(tag, attrs);
    maskSensitiveFieldsForTests(node);
    assert.equal(
      node.classList.contains("ym-disable-keys"),
      true,
      label,
    );
  }
}

function testPlainDivNotMasked() {
  const div = createElement("div");
  maskSensitiveFieldsForTests(div);
  assert.equal(div.classList.contains("ym-disable-keys"), false, "plain div");
}

function testIdempotentMasking() {
  const input = createElement("input");
  maskSensitiveFieldsForTests(input);
  maskSensitiveFieldsForTests(input);
  assert.equal(input.classList.contains("ym-disable-keys"), true, "repeat safe");
}

function testAdminRootHidden() {
  const adminRoot = createElement("div", { "data-admin-panel": "true" });
  maskSensitiveFieldsForTests(adminRoot);
  assert.equal(adminRoot.classList.contains("ym-hide-content"), true, "admin root");
}

function testAdminInputInsidePanel() {
  const adminRoot = createElement("div", { "data-admin-panel": "true" });
  const input = createElement("input");
  adminRoot.appendChild(input);

  maskSensitiveFieldsForTests(adminRoot);

  assert.equal(input.classList.contains("ym-disable-keys"), true, "admin input masked");
  assert.equal(input.classList.contains("ym-hide-content"), true, "admin input hidden");
}

resetYandexMetrikaPrivacyMaskingForTests();
testStaticInput();
testInputInsideAddedContainer();
testBareLeafNodes();
testPlainDivNotMasked();
testIdempotentMasking();
testAdminRootHidden();
testAdminInputInsidePanel();

console.log("yandex-metrika-privacy-unit: ok");
