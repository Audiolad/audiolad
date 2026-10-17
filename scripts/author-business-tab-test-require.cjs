"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- tsx loads this component test as CommonJS, so next/navigation has to be patched through require. */

const Module = require("module");

const originalRequire = Module.prototype.require;

const navigation = {
  __esModule: true,
  useRouter() {
    return { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
  },
  usePathname() {
    return global.__audioladBusinessTabPathname ?? "/author-dashboard";
  },
  useSearchParams() {
    return new URLSearchParams();
  },
  redirect(target) {
    throw new Error(`unexpected redirect ${target}`);
  },
};

// next/link prefetches through IntersectionObserver/requestIdleCallback; a plain anchor is enough here.
const link = {
  __esModule: true,
  default: function TestLink(props) {
    const React = originalRequire.call(module, "react");
    const { href, children, prefetch: _prefetch, scroll: _scroll, replace: _replace, ...rest } = props;
    void _prefetch;
    void _scroll;
    void _replace;
    return React.createElement("a", { ...rest, href: typeof href === "string" ? href : String(href) }, children);
  },
};

function matches(id, fragments) {
  const normalized = String(id).replaceAll("\\", "/");
  return fragments.some((fragment) => id === fragment || normalized.includes(fragment));
}

Module.prototype.require = function patchedRequire(id) {
  if (
    id === "next/navigation" ||
    matches(id, [
      "/next/navigation.js",
      "/next/src/client/components/navigation",
      "/next/dist/client/components/navigation",
    ])
  ) {
    return navigation;
  }
  if (id === "next/link" || matches(id, ["/next/link.js", "/next/dist/client/link", "/next/dist/client/app-dir/link"])) {
    return link;
  }
  return originalRequire.apply(this, arguments);
};
