export const MOBILE_CHROME_DEBUG_QUERY = "al_chrome_debug";
export const MOBILE_CHROME_DEBUG_STORAGE_KEY = "al_chrome_debug";
export const MOBILE_CHROME_DEBUG_RING_SIZE = 80;

type BoxSnapshot = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

type ComputedBoxSnapshot = {
  position: string;
  transform: string;
  top: string;
  bottom: string;
};

export type MobileChromeDebugEvent = {
  type: string;
  timestamp: number;
  pathname: string;
  searchParams: string;
  activeElement: string;
  innerHeight: number;
  scrollY: number;
  visualViewport: {
    height: number;
    width: number;
    offsetTop: number;
    offsetLeft: number;
    scale: number;
  } | null;
  html: {
    overflow: string;
    position: string;
    height: string;
    minHeight: string;
    className: string;
  };
  body: {
    overflow: string;
    position: string;
    height: string;
    minHeight: string;
    className: string;
  };
  topChrome: BoxSnapshot | null;
  spacerHeight: number | null;
  bottomNav: BoxSnapshot | null;
  viewportDelta: number | null;
  computed: {
    chrome: ComputedBoxSnapshot | null;
    nav: ComputedBoxSnapshot | null;
  };
  extra?: Record<string, unknown>;
};

const events: MobileChromeDebugEvent[] = [];
const listeners = new Set<() => void>();

function readStorageFlag(): string | null {
  try {
    return window.localStorage.getItem(MOBILE_CHROME_DEBUG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorageFlag(value: "1" | "0") {
  try {
    window.localStorage.setItem(MOBILE_CHROME_DEBUG_STORAGE_KEY, value);
  } catch {
    // Private mode / blocked storage must not break listing UX.
  }
}

export function isMobileChromeDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const fromQuery = new URLSearchParams(window.location.search).get(
    MOBILE_CHROME_DEBUG_QUERY,
  );
  if (fromQuery === "0") {
    writeStorageFlag("0");
    return false;
  }
  if (fromQuery === "1") {
    writeStorageFlag("1");
    return true;
  }

  return readStorageFlag() === "1";
}

export function describeActiveElement(element: Element | null): string {
  if (!element || !(element instanceof HTMLElement)) {
    return "null";
  }

  const id = element.id ? `#${element.id}` : "";
  const name = element.getAttribute("name");
  const aria = element.getAttribute("aria-label");
  const role = element.getAttribute("role");
  return [
    element.tagName.toLowerCase(),
    id,
    name ? `[name=${name}]` : "",
    role ? `[role=${role}]` : "",
    aria ? `[aria-label=${aria}]` : "",
  ]
    .filter(Boolean)
    .join("");
}

function boxFromRect(rect: DOMRectReadOnly | undefined | null): BoxSnapshot | null {
  if (!rect) {
    return null;
  }

  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function computedBox(element: Element | null): ComputedBoxSnapshot | null {
  if (!element) {
    return null;
  }

  const style = window.getComputedStyle(element);
  return {
    position: style.position,
    transform: style.transform,
    top: style.top,
    bottom: style.bottom,
  };
}

function overflowSnapshot(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  return {
    overflow: style.overflow,
    position: style.position,
    height: style.height,
    minHeight: style.minHeight,
    className: element.className,
  };
}

export function captureMobileChromeDebugSnapshot(
  type: string,
  extra?: Record<string, unknown>,
): MobileChromeDebugEvent {
  const chrome = document.querySelector("[data-mobile-top-chrome]");
  const spacer = document.querySelector("[data-mobile-top-chrome-spacer]");
  const bottomNav = document.querySelector(".bottom-nav");
  const chromeRect = chrome?.getBoundingClientRect();
  const spacerRect = spacer?.getBoundingClientRect();
  const navRect = bottomNav?.getBoundingClientRect();
  const vv = window.visualViewport;

  return {
    type,
    timestamp: Date.now(),
    pathname: window.location.pathname,
    searchParams: window.location.search,
    activeElement: describeActiveElement(document.activeElement),
    innerHeight: window.innerHeight,
    scrollY: window.scrollY,
    visualViewport: vv
      ? {
          height: vv.height,
          width: vv.width,
          offsetTop: vv.offsetTop,
          offsetLeft: vv.offsetLeft,
          scale: vv.scale,
        }
      : null,
    html: overflowSnapshot(document.documentElement),
    body: overflowSnapshot(document.body),
    topChrome: boxFromRect(chromeRect),
    spacerHeight: spacerRect?.height ?? null,
    bottomNav: boxFromRect(navRect),
    viewportDelta: navRect ? navRect.bottom - window.innerHeight : null,
    computed: {
      chrome: computedBox(chrome),
      nav: computedBox(bottomNav),
    },
    extra,
  };
}

export function emitMobileChromeDebug(
  type: string,
  extra?: Record<string, unknown>,
): void {
  if (typeof window === "undefined" || !isMobileChromeDebugEnabled()) {
    return;
  }

  events.push(captureMobileChromeDebugSnapshot(type, extra));
  if (events.length > MOBILE_CHROME_DEBUG_RING_SIZE) {
    events.splice(0, events.length - MOBILE_CHROME_DEBUG_RING_SIZE);
  }

  listeners.forEach((listener) => listener());
}

export function getMobileChromeDebugEvents(): MobileChromeDebugEvent[] {
  return events.slice();
}

export function subscribeMobileChromeDebug(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function formatMobileChromeDebugLog(): string {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      href: typeof window === "undefined" ? "" : window.location.href,
      events: getMobileChromeDebugEvents(),
    },
    null,
    2,
  );
}

export function preserveMobileChromeDebugParam(href: string): string {
  if (typeof window === "undefined") {
    return href;
  }

  const current = new URLSearchParams(window.location.search);
  if (current.get(MOBILE_CHROME_DEBUG_QUERY) !== "1") {
    return href;
  }

  const [path = href, query = ""] = href.split("?");
  const next = new URLSearchParams(query);
  if (next.get(MOBILE_CHROME_DEBUG_QUERY) === "1") {
    return href;
  }

  next.set(MOBILE_CHROME_DEBUG_QUERY, "1");
  const qs = next.toString();
  return qs ? `${path}?${qs}` : path;
}

export function resetMobileChromeDebugForTests(): void {
  events.length = 0;
  listeners.clear();
}
