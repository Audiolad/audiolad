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
  const editorLayout = readSource(
    "src/app/(studio)/studio/project/new/layout.tsx",
  );
  const editorPage = readSource("src/app/(studio)/studio/project/new/page.tsx");
  const livePage = readSource("src/app/(studio)/studio/live/page.tsx");
  const studioAccess = readSource("src/lib/studio/access.ts");
  const studioBrand = readSource("src/components/studio/StudioBrand.tsx");

  assert(
    !studioLayout.includes("StudioAudioProvider"),
    "studio entry layout does not mount the audio provider",
  );
  assert(
    editorLayout.includes("StudioAudioProvider"),
    "new project route mounts its local audio provider",
  );
  assert(
    studioPage.includes("Создать аудиопрактику") &&
      studioPage.includes("Прямой аудиоэфир") &&
      studioPage.includes('href="/studio/project/new"'),
    "studio entry renders both mode cards",
  );
  assert(
    studioBrand.includes('src="/brand/audiolad-logo-light.webp"') &&
      studioBrand.includes("Студия") &&
      !studioPage.includes("uppercase tracking"),
    "studio uses the official compact brand asset",
  );
  assert(
    livePage.includes("Функция находится в разработке"),
    "live route renders its development status",
  );
  assert(
    !studioPage.includes("AudioContext") &&
      !livePage.includes("AudioContext") &&
      !studioPage.includes("StudioAudioProvider") &&
      !livePage.includes("StudioAudioProvider"),
    "entry and live routes do not create local audio resources",
  );
  assert(
    !studioLayout.includes("ListenerAppShell") &&
      !studioPage.includes("ListenerAppShell") &&
      !livePage.includes("ListenerAppShell"),
    "studio excludes listener shell",
  );
  assert(
    !studioLayout.includes("GlobalAudioPlayerProvider") &&
      !studioPage.includes("GlobalAudioPlayerProvider") &&
      !livePage.includes("GlobalAudioPlayerProvider"),
    "studio excludes global player provider",
  );
  assert(
    studioPage.includes('requireStudioAuthorAccess("/studio")') &&
      editorPage.includes(
        'requireStudioAuthorAccess("/studio/project/new")',
      ) &&
      livePage.includes('requireStudioAuthorAccess("/studio/live")') &&
      studioAccess.includes("next=${nextPath}"),
    "studio routes preserve their redirect destination",
  );
  assert(
    studioAccess.includes("listAuthorWorkspacesForUser"),
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
