/**
 * Legacy empty music-draft slot left by createDraftProduct before PR #591.
 *
 * Until the production deploy that stopped seeding, music create inserted one
 * audio row in the same request as the practice:
 *   title "Трек 1" when product_kind was already music, otherwise "Аудио 1"
 *   position 1, status draft, and no file, duration, or delivery columns.
 * Switching the form to music rewrote "Аудио 1" to "Трек 1" without changing
 * created_at. The heading in the form is always "Аудио N"; the stored title
 * is the seed string.
 *
 * Title is one required part of that insert shape. It is never sufficient.
 */

/** First successful production deploy of the no-seed create path (PR #591). */
export const LEGACY_MUSIC_DRAFT_SEED_ENDED_AT = "2026-09-26T07:09:22.000Z";

/**
 * createDraftProduct inserted the practice, then the audio row, as two
 * statements. A later author POST cannot land in this window.
 */
export const LEGACY_MUSIC_DRAFT_CO_CREATED_WITHIN_MS = 5_000;

/**
 * The seeded row is the earliest audio_items row. A file dropped immediately
 * afterwards is a separate request and sits outside this cluster.
 */
export const LEGACY_MUSIC_DRAFT_EARLIEST_CLUSTER_WITHIN_MS = 100;

export const LEGACY_MUSIC_DRAFT_SEEDED_TITLES = ["Трек 1", "Аудио 1"] as const;

const SEED_ENDED_AT_MS = Date.parse(LEGACY_MUSIC_DRAFT_SEED_ENDED_AT);

export type LegacyMusicDraftPracticeFacts = {
  productKind: string | null;
  status: string | null;
  createdAt: string;
};

export type LegacyMusicDraftAudioFacts = {
  id: string;
  title: string;
  position: number;
  status: string;
  createdAt: string;
  audioPath: string | null;
  durationSeconds: number | null;
  activeMusicDeliveryAssetId: string | null;
  desiredMusicMasterAssetId: string | null;
  desiredProductAudioNormalizeJobId: string | null;
  musicUploadGeneration: number | null;
  originalFileName: string | null;
  fileSizeBytes: number | null;
  description: string | null;
  coverUrl: string | null;
  coverImage: unknown;
  isPreview: boolean;
  previewStartMs: number | null;
  previewEndMs: number | null;
};

/** Authoritative child-row counts. Missing facts must not be treated as empty. */
export type LegacyMusicDraftDeliverySignals = {
  musicAssetCount: number;
  transcodeJobCount: number;
  directUploadCount: number;
  normalizeJobCount: number;
};

export type LegacyMusicDraftPlaceholderPlan = {
  removeIds: string[];
  positions: Array<{ id: string; position: number }>;
};

function timestampMs(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function isLegacyMusicDraftSeededTitle(title: string): boolean {
  const trimmed = title.trim();
  return (LEGACY_MUSIC_DRAFT_SEEDED_TITLES as readonly string[]).includes(trimmed);
}

function deliverySignalsBlockRemoval(
  signals: LegacyMusicDraftDeliverySignals | null,
): boolean {
  if (!signals) {
    return true;
  }
  return (
    signals.musicAssetCount > 0 ||
    signals.transcodeJobCount > 0 ||
    signals.directUploadCount > 0 ||
    signals.normalizeJobCount > 0
  );
}

/**
 * True only when this row is still the untouched auto-inserted slot.
 * `earliestAudioCreatedAtMs` is the minimum created_at of every audio row
 * on the practice. Pass null when that minimum cannot be proven.
 */
export function isLegacyMusicDraftEmptyPlaceholder(
  practice: LegacyMusicDraftPracticeFacts,
  item: LegacyMusicDraftAudioFacts,
  signals: LegacyMusicDraftDeliverySignals | null,
  earliestAudioCreatedAtMs: number | null,
): boolean {
  if (practice.productKind !== "music" || practice.status !== "draft") {
    return false;
  }

  const practiceCreatedAtMs = timestampMs(practice.createdAt);
  const audioCreatedAtMs = timestampMs(item.createdAt);
  if (
    practiceCreatedAtMs == null ||
    audioCreatedAtMs == null ||
    earliestAudioCreatedAtMs == null
  ) {
    return false;
  }

  if (practiceCreatedAtMs >= SEED_ENDED_AT_MS) {
    return false;
  }

  const createdWithPractice = audioCreatedAtMs - practiceCreatedAtMs;
  if (
    createdWithPractice < 0 ||
    createdWithPractice > LEGACY_MUSIC_DRAFT_CO_CREATED_WITHIN_MS
  ) {
    return false;
  }

  if (audioCreatedAtMs - earliestAudioCreatedAtMs > LEGACY_MUSIC_DRAFT_EARLIEST_CLUSTER_WITHIN_MS) {
    return false;
  }

  if (!isLegacyMusicDraftSeededTitle(item.title)) {
    return false;
  }

  if (item.status !== "draft" || item.isPreview !== false) {
    return false;
  }

  if (item.musicUploadGeneration !== 0) {
    return false;
  }

  if (
    item.audioPath !== null ||
    item.durationSeconds !== null ||
    item.activeMusicDeliveryAssetId !== null ||
    item.desiredMusicMasterAssetId !== null ||
    item.desiredProductAudioNormalizeJobId !== null ||
    item.originalFileName !== null ||
    item.fileSizeBytes !== null ||
    item.description !== null ||
    item.coverUrl !== null ||
    item.coverImage !== null ||
    item.previewStartMs !== null ||
    item.previewEndMs !== null
  ) {
    return false;
  }

  if (deliverySignalsBlockRemoval(signals)) {
    return false;
  }

  return true;
}

export function planLegacyMusicDraftPlaceholderCleanup(input: {
  practice: LegacyMusicDraftPracticeFacts;
  items: readonly LegacyMusicDraftAudioFacts[];
  signalsByAudioId: ReadonlyMap<string, LegacyMusicDraftDeliverySignals>;
}): LegacyMusicDraftPlaceholderPlan {
  const createdAtValues = input.items.map((item) => timestampMs(item.createdAt));
  const earliestAudioCreatedAtMs = createdAtValues.every((value) => value != null)
    ? Math.min(...(createdAtValues as number[]))
    : null;

  const removeIds = input.items
    .filter((item) =>
      isLegacyMusicDraftEmptyPlaceholder(
        input.practice,
        item,
        input.signalsByAudioId.get(item.id) ?? null,
        earliestAudioCreatedAtMs,
      ),
    )
    .map((item) => item.id);

  const removed = new Set(removeIds);
  const positions = input.items
    .filter((item) => !removed.has(item.id))
    .slice()
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map((item, index) => ({ id: item.id, position: index + 1 }));

  return { removeIds, positions };
}
