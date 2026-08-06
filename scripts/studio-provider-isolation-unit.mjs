#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readSource(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testProviderComposition() {
  const rootLayout = readSource("src/app/layout.tsx");
  const baseProviders = readSource("src/components/providers/BaseProviders.tsx");
  const platformProviders = readSource(
    "src/components/providers/PlatformProviders.tsx",
  );
  const platformLayout = readSource("src/app/(platform)/layout.tsx");

  assert(rootLayout.includes("BaseProviders"), "root mounts BaseProviders");
  assert(
    !rootLayout.includes("GlobalAudioPlayerProvider"),
    "root does not mount global player",
  );
  assert(
    !baseProviders.includes("GlobalAudioPlayerProvider"),
    "base providers exclude global player",
  );
  assert(
    platformProviders.includes("GlobalAudioPlayerProvider"),
    "platform providers mount global player",
  );
  assert(
    platformLayout.includes("PlatformProviders"),
    "platform route group mounts platform providers",
  );
}

function testStudioIsolation() {
  const studioLayout = readSource("src/app/(studio)/studio/layout.tsx");
  const studioPage = readSource("src/app/(studio)/studio/page.tsx");

  assert(studioLayout.includes("min-h-dvh"), "studio layout is fullscreen");
  assert(
    !studioLayout.includes("ListenerAppShell") &&
      !studioPage.includes("ListenerAppShell"),
    "studio excludes listener shell",
  );
  assert(
    !studioLayout.includes("GlobalAudioPlayerProvider") &&
      !studioPage.includes("GlobalAudioPlayerProvider"),
    "studio excludes global player provider",
  );
  assert(
    studioPage.includes('redirect("/auth/sign-in?next=/studio")'),
    "studio redirects anonymous users to sign-in",
  );
  assert(
    studioPage.includes("listAuthorWorkspacesForUser"),
    "studio checks author workspace access",
  );
}

function testHardStopLifecycle() {
  const provider = readSource(
    "src/components/audio/GlobalAudioPlayerProvider.tsx",
  );

  assert(provider.includes("const hardStop"), "provider has shared hard-stop");
  assert(
    provider.includes("hardStop();") &&
      provider.includes("return () => {\n      hardStop();"),
    "provider invokes hard-stop on unmount",
  );
  assert(
    provider.includes("audio.pause()") &&
      provider.includes('audio.removeAttribute("src")') &&
      provider.includes("audio.load()"),
    "hard-stop clears persistent audio element",
  );
  assert(
    provider.includes("clearMediaSession()") &&
      provider.includes("clearDesktopPlayerLastSession()") &&
      provider.includes("clearPlaylistQueue()"),
    "hard-stop clears media session, persisted session, and queue",
  );
  assert(
    provider.includes("sessionRef.current = null") &&
      provider.includes("setSession(null)"),
    "hard-stop clears active listener session",
  );
}

function main() {
  testProviderComposition();
  testStudioIsolation();
  testHardStopLifecycle();
  console.log("studio provider isolation unit: ok");
}

main();
