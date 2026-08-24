import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyPersistedSessionContract,
  DESKTOP_PLAYER_PERSIST_SCHEMA_VERSION,
  desktopPlayerSnapshotFromSession,
  mergeDesktopPlaybackIntoSession,
  parseDesktopPlayerLastSession,
} from "../src/lib/listen/desktop-player-persistence";
import {
  getGlobalPlayerSessionKey,
  isCatalogGlobalPlayerSession,
  isGlobalPlayerPreviewCta,
  isPrivateAudioSession,
  normalizeGlobalPlayerSessionContract,
  resolveGlobalPlayerPlaybackMode,
  type CatalogGlobalPlayerSession,
  type LoadSessionInput,
} from "../src/lib/listen/global-player-types";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function legacyCatalogPayload(): CatalogGlobalPlayerSession {
  return {
    practiceId: "practice-1",
    authorSlug: "zoya-petrova",
    productSlug: "zhenskie-dengi",
    practiceTitle: "Женские деньги",
    authorName: "Зоя Петрова",
    format: "Практика",
    tracks: [
      {
        id: "track-1",
        title: "Часть 1",
        description: null,
        position: 1,
        durationSeconds: 180,
        coverImageUrl: null,
      },
    ],
    initialProgress: [],
    coverSymbol: "✦",
    coverGradient: "from-[#7652bc] via-[#bd8fd7] to-[#f1c5d3]",
    coverImageUrl: null,
    isAuthorPreview: false,
  };
}

function testSourceTypeUnchanged() {
  const types = read("src/lib/listen/global-player-types.ts");
  assert.match(types, /export type GlobalPlayerSourceType = "catalog" \| "private_audio"/);
  assert.match(types, /sourceType\?: "catalog"/);
  assert.match(types, /sourceType: "private_audio"/);
  assert.doesNotMatch(types, /sourceType.*saved/);
}

function testLegacySessionPayload() {
  const payload = legacyCatalogPayload();
  assert.equal(payload.playbackMode, undefined);
  assert.equal(payload.entrySurface, undefined);
  assert.ok(isCatalogGlobalPlayerSession(payload));
  assert.equal(isPrivateAudioSession(payload), false);
  assert.equal(getGlobalPlayerSessionKey(payload), "catalog:practice-1");

  const normalized = normalizeGlobalPlayerSessionContract(payload);
  assert.equal(normalized.playbackMode, "full");
  assert.equal(normalized.practiceId, "practice-1");
  assert.equal(normalized.sourceType, undefined);
}

function testNewPreviewSessionPayload() {
  const payload: LoadSessionInput = {
    ...legacyCatalogPayload(),
    sourceType: "catalog",
    entrySurface: "catalog",
    playbackMode: "preview",
    previewEndMs: 60_000,
    previewCta: {
      type: "buy",
      price: 1490,
      href: "/zoya-petrova/zhenskie-dengi",
    },
  };

  const normalized = normalizeGlobalPlayerSessionContract(payload);
  assert.equal(normalized.playbackMode, "preview");
  assert.equal(normalized.entrySurface, "catalog");
  assert.equal(normalized.previewEndMs, 60_000);
  assert.ok(isGlobalPlayerPreviewCta(normalized.previewCta));
  assert.equal(normalized.sourceType, "catalog");
  assert.equal(getGlobalPlayerSessionKey(normalized), "catalog:practice-1");
}

function testLegacyPersistRestores() {
  const legacy = parseDesktopPlayerLastSession({
    practiceId: "practice-1",
    authorSlug: "zoya-petrova",
    productSlug: "zhenskie-dengi",
    updatedAt: "2026-01-01T00:00:00.000Z",
    audioItemId: "track-1",
    positionSeconds: 12,
  });

  assert.ok(legacy);
  assert.equal(legacy.version, undefined);
  assert.equal(legacy.playbackMode, "full");
  assert.equal(legacy.entrySurface, undefined);
  assert.equal(legacy.previewEndMs, undefined);

  const restored = mergeDesktopPlaybackIntoSession(
    legacyCatalogPayload(),
    legacy,
  );

  assert.ok(isCatalogGlobalPlayerSession(restored));
  assert.equal(restored.playbackMode, "full");
  assert.equal(restored.initialProgress[0]?.audioItemId, "track-1");
  assert.equal(restored.initialProgress[0]?.positionSeconds, 12);
}

function testVersionedPersistRoundTrip() {
  const session: CatalogGlobalPlayerSession = {
    ...legacyCatalogPayload(),
    entrySurface: "home",
    playbackMode: "preview",
    previewEndMs: 45_000,
  };

  const input = desktopPlayerSnapshotFromSession(session, {
    audioItemId: "track-1",
    positionSeconds: 8,
  });

  assert.equal(input.version, DESKTOP_PLAYER_PERSIST_SCHEMA_VERSION);
  assert.equal(input.playbackMode, "preview");
  assert.equal(input.entrySurface, "home");
  assert.equal(input.previewEndMs, 45_000);

  const parsed = parseDesktopPlayerLastSession({
    ...input,
    updatedAt: "2026-08-23T00:00:00.000Z",
  });

  assert.ok(parsed);
  const restored = applyPersistedSessionContract(legacyCatalogPayload(), parsed);
  assert.ok(isCatalogGlobalPlayerSession(restored));
  assert.equal(restored.playbackMode, "preview");
  assert.equal(restored.entrySurface, "home");
  assert.equal(restored.previewEndMs, 45_000);
}

function testInvalidPlaybackModeDefaultsToFull() {
  assert.equal(resolveGlobalPlayerPlaybackMode(undefined), "full");
  assert.equal(resolveGlobalPlayerPlaybackMode("saved"), "full");

  const parsed = parseDesktopPlayerLastSession({
    practiceId: "practice-1",
    authorSlug: "zoya-petrova",
    productSlug: "zhenskie-dengi",
    updatedAt: "2026-01-01T00:00:00.000Z",
    playbackMode: "saved",
    entrySurface: "favorites",
  });

  assert.ok(parsed);
  assert.equal(parsed.playbackMode, "full");
  assert.equal(parsed.entrySurface, undefined);
}

function testProviderKeepsSourceTypeAndUsesContract() {
  const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");
  assert.match(provider, /normalizeGlobalPlayerSessionContract/);
  assert.match(provider, /desktopPlayerSnapshotFromSession/);
  assert.doesNotMatch(provider, /access_source\s*=\s*["']saved["']/);
}

testSourceTypeUnchanged();
testLegacySessionPayload();
testNewPreviewSessionPayload();
testLegacyPersistRestores();
testVersionedPersistRoundTrip();
testInvalidPlaybackModeDefaultsToFull();
testProviderKeepsSourceTypeAndUsesContract();

console.log("catalog-foundation-player-session-unit: ok");
