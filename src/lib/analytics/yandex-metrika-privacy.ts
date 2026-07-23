const INPUT_SELECTOR =
  "input, textarea, select, [contenteditable='true'], [contenteditable='']";

const ADMIN_CONTENT_SELECTOR = "[data-admin-panel], [data-admin-form]";

let privacyObserver: MutationObserver | null = null;

function maskSensitiveElement(element: Element): void {
  if (!(element instanceof HTMLElement)) {
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

  root.querySelectorAll(INPUT_SELECTOR).forEach((element) => {
    maskSensitiveElement(element);
  });

  root.querySelectorAll(ADMIN_CONTENT_SELECTOR).forEach((element) => {
    if (element instanceof HTMLElement) {
      element.classList.add("ym-hide-content");
    }
  });
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
