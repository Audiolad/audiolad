"use client";

import { createClient } from "@/lib/supabase/client";
import type { AudiobookFragment } from "./server";
import {
  deleteAudiobookRecordingDraft,
  getAudiobookRecordingData,
  getAudiobookRecordingDraft,
  listAudiobookRecordingDrafts,
  saveAudiobookRecordingDraft,
  type AudiobookRecordingDraft,
} from "./recorder-store";
import { validateAudiobookRecordedBlob } from "./recorder";

type ReservationResponse = {
  fragment: AudiobookFragment;
  signedUpload: { path: string; token: string };
};

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    const error = new Error(body?.error ?? `request_failed_${response.status}`);
    error.name = "AudiobookRecordingSyncError";
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

function fragmentBase(draft: AudiobookRecordingDraft) {
  return `/api/studio/audiobooks/projects/${draft.projectId}/chapters/${draft.chapterId}/fragments`;
}

async function reservationFor(draft: AudiobookRecordingDraft): Promise<ReservationResponse> {
  if (draft.remoteFragmentId) {
    return request(`${fragmentBase(draft)}/${draft.remoteFragmentId}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authorId: draft.authorId }),
    });
  }
  const reservation = await request(fragmentBase(draft), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      authorId: draft.authorId,
      originalName: draft.originalName,
      mimeType: draft.mimeType,
      sizeBytes: draft.sizeBytes,
      sourceType: "recording",
    }),
  }) as ReservationResponse;
  await saveAudiobookRecordingDraft({ ...draft, remoteFragmentId: reservation.fragment.id, status: "syncing" });
  return reservation;
}

async function updateDraftStatus(draftId: string, status: AudiobookRecordingDraft["status"]) {
  const draft = await getAudiobookRecordingDraft(draftId);
  if (draft) await saveAudiobookRecordingDraft({ ...draft, status });
}

export async function prepareInterruptedAudiobookRecordingDraft(draftId: string) {
  const draft = await getAudiobookRecordingDraft(draftId);
  if (!draft || draft.status !== "interrupted") return false;

  const recording = await getAudiobookRecordingData(draft.id, draft.mimeType);
  const invalidRecording = !recording.contiguous
    || recording.chunkCount !== draft.chunkCount
    || recording.sizeBytes !== draft.sizeBytes
    || recording.blob.size !== draft.sizeBytes
    || Boolean(validateAudiobookRecordedBlob(recording.blob));
  if (invalidRecording) throw new Error("interrupted_recording_invalid");

  await saveAudiobookRecordingDraft({ ...draft, status: "ready", readyAt: Date.now() });
  return true;
}

export async function syncAudiobookRecordingDraft(draftId: string) {
  const draft = await getAudiobookRecordingDraft(draftId);
  if (!draft) return null;
  await saveAudiobookRecordingDraft({ ...draft, status: "syncing" });
  try {
    if (draft.remoteFragmentId) {
      try {
        const finalized = await request(
          `${fragmentBase(draft)}/${draft.remoteFragmentId}/finalize`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ authorId: draft.authorId }),
          },
        ) as { fragment: AudiobookFragment };
        await deleteAudiobookRecordingDraft(draft.id);
        return finalized.fragment;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "upload_not_complete") throw error;
      }
    }
    const reservation = await reservationFor(draft);
    const recording = await getAudiobookRecordingData(draft.id, draft.mimeType);
    if (
      !recording.contiguous
      || recording.chunkCount !== draft.chunkCount
      || recording.sizeBytes !== draft.sizeBytes
      || recording.blob.size !== draft.sizeBytes
      || !recording.blob.size
    ) throw new Error("recording_chunks_incomplete");
    const upload = await createClient().storage.from("audiobook-fragments").uploadToSignedUrl(
      reservation.signedUpload.path,
      reservation.signedUpload.token,
      recording.blob,
      { contentType: draft.mimeType },
    );
    if (upload.error) throw new Error("storage_upload_failed");
    const response = await request(
      `${fragmentBase(draft)}/${reservation.fragment.id}/finalize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorId: draft.authorId }),
      },
    ) as { fragment: AudiobookFragment };
    await deleteAudiobookRecordingDraft(draft.id);
    return response.fragment;
  } catch (error) {
    await updateDraftStatus(draft.id, "failed").catch(() => undefined);
    throw error;
  }
}

type ProjectSync = {
  promise: Promise<void>;
  rerunRequested: boolean;
};

const activeProjectSync = new Map<string, ProjectSync>();

export async function syncPendingAudiobookRecordingDrafts(
  projectId: string,
  onSynced?: (fragment: AudiobookFragment) => void,
) {
  const active = activeProjectSync.get(projectId);
  if (active) {
    active.rerunRequested = true;
    return active.promise;
  }
  const entry = {} as ProjectSync;
  entry.promise = (async () => {
    do {
      entry.rerunRequested = false;
      for (const draft of await listAudiobookRecordingDrafts(projectId)) {
        if (!["ready", "failed"].includes(draft.status) || !draft.sizeBytes) continue;
        try {
          const fragment = await syncAudiobookRecordingDraft(draft.id);
          if (fragment) onSynced?.(fragment);
        } catch {
          break;
        }
      }
    } while (entry.rerunRequested);
  })().finally(() => {
    activeProjectSync.delete(projectId);
  });
  activeProjectSync.set(projectId, entry);
  return entry.promise;
}
