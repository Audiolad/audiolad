#!/usr/bin/env node
/**
 * Unit checks: private audio via Global Player (session type, routing, exclusion).
 * Run: node scripts/private-audio-global-player-unit.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testTypesAndMapper() {
  const types = read("src/lib/listen/global-player-types.ts");
  assert(types.includes('sourceType: "private_audio"'), "private sourceType");
  assert(types.includes("PrivateAudioGlobalPlayerSession"), "private session type");
  assert(types.includes("getGlobalPlayerSessionKey"), "session key helper");
  assert(types.includes("isPrivateAudioSession"), "private type guard");
  assert(!types.includes('practiceId: string;\n  detailPath'), "no fake practiceId on private");

  const mapper = read("src/lib/private-audio/global-session.ts");
  assert(mapper.includes("buildPrivateAudioGlobalSession"), "mapper export");
  assert(mapper.includes('sourceType: "private_audio"'), "mapper sets source");
  assert(mapper.includes("/my-library/private-audio/"), "detail path");
}

function testSequentialPlayerBranching() {
  const player = read("src/components/audio/useSequentialPlayer.ts");
  assert(player.includes('sourceType === "private_audio"'), "private branch");
  assert(
    player.includes("/api/my-library/private-audio/"),
    "private audio/progress API",
  );
  assert(
    player.includes("positionSeconds: Math.floor(payload.positionSeconds)"),
    "camelCase private progress body",
  );
  assert(
    player.includes("audio_item_id: payload.audioItemId"),
    "catalog progress snake_case preserved",
  );
  assert(
    player.includes("Private progress never touches practice_audio_progress"),
    "private path documents no catalog progress writes",
  );
}

function testProviderAndUi() {
  const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
  assert(provider.includes("requestStopLocalAudioPlayers"), "stops local players");
  assert(provider.includes("getGlobalPlayerSessionKey"), "identity by key");
  assert(provider.includes("session.detailPath"), "open private detail");
  assert(provider.includes("onActivePrivateDetail"), "hide mini on private detail");
  assert(provider.includes('mode: "replace"'), "key-change replace path");
  assert(provider.includes("stopEngineRef.current"), "stops old engine on replace");
  assert(
    provider.includes("bail without setState") ||
      provider.includes("Same session key, no material change"),
    "same-key bailout prevents loops",
  );
  assert(
    provider.includes('mode: "autoplay_intent_bump"'),
    "autoplay-only same-key bump does not remount the engine",
  );

  const listenPage = read("src/components/audio/ListenPageClient.tsx");
  assert(
    listenPage.includes("Already on this catalog practice"),
    "listen page early-return for same practice",
  );
  assert(
    listenPage.includes("activeCatalogPracticeId"),
    "listen page uses practiceId primitive",
  );
  assert(
    listenPage.includes("never put the whole session object"),
    "listen page documents no full-session deps",
  );

  const player = read("src/components/audio/useSequentialPlayer.ts");
  assert(player.includes("AbortController"), "URL fetch abortable");
  assert(
    player.includes("url_fetch_stale_ignored") ||
      player.includes("Never auto-retry after generation change"),
    "no stale URL retry after generation bump",
  );
  assert(player.includes("saveAsPrivate"), "progress snapshot uses private flag");
  assert(player.includes("isSaveStale"), "progress ignores stale generation");
  assert(
    player.includes("audio_error_stale_ignored") ||
      player.includes("isHandlerCurrent"),
    "stale audio events ignored after session switch",
  );

  const detail = read("src/components/private-audio/PrivateAudioDetailClient.tsx");
  assert(
    detail.includes("PrivateAudioGlobalPlayerControls"),
    "detail uses global controls",
  );
  assert(
    !detail.includes("PersonalMaterialAudioPlayer"),
    "detail no longer owns local audio",
  );
  assert(detail.includes("stopAndClear"), "delete clears global session");

  const controls = read(
    "src/components/private-audio/PrivateAudioGlobalPlayerControls.tsx",
  );
  assert(!controls.includes("<audio"), "controls have no local audio element");
  assert(controls.includes("loadSession"), "play loads global session");
  assert(controls.includes("handleSeekOffset"), "seek via engine");

  const mini = read("src/components/audio/GlobalMiniPlayer.tsx");
  assert(mini.includes("isPrivateAudioSession"), "mini aware of private");

  const personal = read(
    "src/components/personal-materials/guest/PersonalMaterialAudioPlayer.tsx",
  );
  assert(personal.includes("STOP_LOCAL_AUDIO_EVENT"), "listens for stop event");
  assert(personal.includes("stopAndClear"), "stops global on local play");

  const library = read("src/components/my-practices/MyPracticesLibrary.tsx");
  assert(library.includes('kind: "private_audio"'), "All tab merges private");
  assert(library.includes("allEntries"), "All tab merged entries");
  assert(
    library.includes('activeFilter === "all"'),
    "All filter special-case rendering",
  );
}

function main() {
  testTypesAndMapper();
  testSequentialPlayerBranching();
  testProviderAndUi();
  console.log("private-audio-global-player-unit: ok");
}

main();
