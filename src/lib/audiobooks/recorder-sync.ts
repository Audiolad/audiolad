"use client";

import { createClient } from "@/lib/supabase/client";
import type { AudiobookFragment } from "./server";
import {
  deleteAudiobookRecordingDraft,
  getAudiobookRecordingDraft,
  listAudiobookRecordingDrafts,
  saveAudiobookRecordingDraft,
  type AudiobookRecordingDraft,
} from "./recorder-store";

type ReservationResponse = {
  fragment: AudiobookFragment;
  signedUpload: { path: string; token: string };
};

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`request_failed_${response.status}`);
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
      sizeBytes: draft.blob.size,
      sourceType: "recording",
    }),
  }) as ReservationResponse;
  await saveAudiobookRecordingDraft({ ...draft, remoteFragmentId: reservation.fragment.id });
  return reservation;
}

export async function syncAudiobookRecordingDraft(draftId: string) {
  const draft = await getAudiobookRecordingDraft(draftId);
  if (!draft) return null;
  const reservation = await reservationFor(draft);
  const upload = await createClient().storage.from("audiobook-fragments").uploadToSignedUrl(
    reservation.signedUpload.path,
    reservation.signedUpload.token,
    draft.blob,
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
}

let activeProjectSync: Promise<void> | null = null;

export async function syncPendingAudiobookRecordingDrafts(
  projectId: string,
  onSynced?: (fragment: AudiobookFragment) => void,
) {
  if (activeProjectSync) return activeProjectSync;
  activeProjectSync = (async () => {
    for (const draft of await listAudiobookRecordingDrafts(projectId)) {
      try {
        const fragment = await syncAudiobookRecordingDraft(draft.id);
        if (fragment) onSynced?.(fragment);
      } catch {
        break;
      }
    }
  })().finally(() => {
    activeProjectSync = null;
  });
  return activeProjectSync;
}
