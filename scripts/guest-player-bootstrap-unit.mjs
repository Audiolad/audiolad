#!/usr/bin/env node
/**
 * Guest player contract: empty by default, shared session across shell components.
 */
import { readFileSync } from "node:fs";

// 5494fb5d introduced production-root paths; inspect this checkout in any worktree.
const read = (path, encoding) => readFileSync(new URL(`../${path}`, import.meta.url), encoding);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sidebar = read(
  "src/components/listener/NowPlayingPanel.tsx",
  "utf8",
);
const bar = read(
  "src/components/listener/DesktopPlayerBar.tsx",
  "utf8",
);

assert(sidebar.includes("useGlobalAudioPlayer"), "sidebar uses global player session");
assert(bar.includes("useGlobalAudioPlayer"), "desktop bar uses global player session");
assert(bar.includes("return null"), "desktop bar hidden when empty");

console.log("guest-player-bootstrap-unit: ok");
