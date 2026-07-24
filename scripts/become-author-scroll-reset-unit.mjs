#!/usr/bin/env node
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

const shell = read("src/components/become-author/BecomeAuthorShell.tsx");
const reset = read("src/components/become-author/BecomeAuthorScrollReset.tsx");
const helper = read("src/lib/navigation/reset-app-scroll.ts");
const loading = read("src/app/become-author/loading.tsx");
const listenerShell = read("src/components/listener/ListenerAppShell.tsx");

assert(
  shell.includes('from "@/components/become-author/BecomeAuthorScrollReset"'),
  "BecomeAuthorShell imports scroll reset",
);
assert(
  shell.includes("<BecomeAuthorScrollReset />"),
  "BecomeAuthorShell mounts scroll reset",
);
assert(
  loading.includes("BecomeAuthorShell"),
  "loading state shares BecomeAuthorShell so scroll resets there too",
);
assert(reset.includes('"use client"'), "scroll reset is a client component");
assert(
  reset.includes("useLayoutEffect"),
  "scroll reset uses useLayoutEffect (no setTimeout)",
);
assert(!reset.includes("setTimeout"), "scroll reset must not use setTimeout");
assert(
  reset.includes("resetAppScrollPosition"),
  "scroll reset calls shared helper",
);
assert(
  helper.includes(".listener-app-shell__center-scroll"),
  "helper targets listener center scroll container",
);
assert(
  listenerShell.includes("listener-app-shell__center-scroll"),
  "listener shell still exposes the shared scroll container class",
);
assert(
  helper.includes("window.scrollTo(0, 0)"),
  "helper resets window scroll instantly",
);
assert(
  !helper.includes('behavior: "smooth"'),
  "helper must not use smooth scrolling",
);

console.log("become-author-scroll-reset-unit: ok");
