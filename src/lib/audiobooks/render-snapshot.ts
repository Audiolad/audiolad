import { createHash } from "node:crypto";

import { isAudiobookActiveFragmentStoragePath } from "./storage";

export type AudiobookRenderSnapshotFragment = {
  id: string;
  storagePath: string;
  position: number;
  mimeType: string;
  sizeBytes: number;
};

export type AudiobookRenderSnapshot = {
  version: 1;
  fragments: AudiobookRenderSnapshotFragment[];
};

type SnapshotContext = {
  authorId: string;
  projectId: string;
  chapterId: string;
};

function validFragment(fragment: unknown, context: SnapshotContext): fragment is AudiobookRenderSnapshotFragment {
  if (!fragment || typeof fragment !== "object") return false;
  const value = fragment as Record<string, unknown>;
  return typeof value.id === "string"
    && typeof value.storagePath === "string"
    && Number.isSafeInteger(value.position) && Number(value.position) > 0
    && typeof value.mimeType === "string"
    && Number.isSafeInteger(value.sizeBytes) && Number(value.sizeBytes) > 0
    && isAudiobookActiveFragmentStoragePath(
      value.storagePath, context.authorId, context.projectId, context.chapterId, value.id,
    );
}

/**
 * The tuple order and property order are part of the persisted fingerprint.
 * Keep this helper as the sole serializer for enqueue, worker, and state reads.
 */
export function createAudiobookRenderSnapshot(
  fragments: readonly AudiobookRenderSnapshotFragment[],
  context: SnapshotContext,
): AudiobookRenderSnapshot {
  const normalized = fragments.map((fragment) => ({
    id: fragment.id,
    storagePath: fragment.storagePath,
    position: fragment.position,
    mimeType: fragment.mimeType,
    sizeBytes: fragment.sizeBytes,
  })).sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
  if (!normalized.length || normalized.some((fragment) => !validFragment(fragment, context))) {
    throw new Error("invalid_audiobook_render_snapshot");
  }
  return { version: 1, fragments: normalized };
}

export function parseAudiobookRenderSnapshot(
  value: unknown,
  context: SnapshotContext,
): AudiobookRenderSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as { version?: unknown; fragments?: unknown };
  if (snapshot.version !== 1 || !Array.isArray(snapshot.fragments)) return null;
  try {
    const canonical = createAudiobookRenderSnapshot(snapshot.fragments as AudiobookRenderSnapshotFragment[], context);
    return JSON.stringify(canonical) === JSON.stringify(snapshot) ? canonical : null;
  } catch {
    return null;
  }
}

export function audiobookRenderSnapshotSha256(snapshot: AudiobookRenderSnapshot) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
