const INPUT_SELECTOR =
  "input, textarea, select, [contenteditable='true'], [contenteditable='']";

const ADMIN_CONTENT_SELECTOR = "[data-admin-panel], [data-admin-form]";

let privacyObserver: MutationObserver | null = null;

function isElementLike(node: ParentNode): node is Element {
  return (
    typeof node === "object" &&
    node !== null &&
    "matches" in node &&
    typeof node.matches === "function"
  );
}

function maskSensitiveElement(element: Element): void {
  if (!("classList" in element) || !element.classList) {
    return;
  }

  element.classList.add("ym-disable-keys");

  if (
    element.matches(ADMIN_CONTENT_SELECTOR) ||
    element.closest(ADMIN_CONTENT_SELECTOR)
  ) {
    element.classList.add("ym-hide-content");
  }
}

function maskSensitiveFields(root: ParentNode = document): void {
  if (typeof document === "undefined") {
    return;
  }

  if (isElementLike(root)) {
    if (root.matches(INPUT_SELECTOR)) {
      maskSensitiveElement(root);
    }

    if (root.matches(ADMIN_CONTENT_SELECTOR)) {
      root.classList.add("ym-hide-content");
    }
  }

  root.querySelectorAll(INPUT_SELECTOR).forEach((element) => {
    maskSensitiveElement(element);
  });

  root.querySelectorAll(ADMIN_CONTENT_SELECTOR).forEach((element) => {
    if ("classList" in element && element.classList) {
      element.classList.add("ym-hide-content");
    }
  });
}

/** @internal Test-only export for privacy masking unit checks. */
export function maskSensitiveFieldsForTests(root: ParentNode): void {
  maskSensitiveFields(root);
}

export function setupYandexMetrikaPrivacyMasking(): void {
  if (typeof document === "undefined") {
    return;
  }

  maskSensitiveFields(document);

  if (privacyObserver) {
    return;
  }

  privacyObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }

        maskSensitiveFields(node);
      });
    }
  });

  privacyObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

export function resetYandexMetrikaPrivacyMaskingForTests(): void {
  privacyObserver?.disconnect();
  privacyObserver = null;
}
