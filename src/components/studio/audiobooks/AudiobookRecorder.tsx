"use client";

import { useEffect, useState } from "react";

import type { AudiobookFragment } from "@/lib/audiobooks/server";
import { useAudiobookRecorder } from "./useAudiobookRecorder";

export function AudiobookRecorder({
  authorId,
  projectId,
  chapterId,
  disabled,
  onSynced,
  onLockChange,
}: {
  authorId: string;
  projectId: string;
  chapterId: string;
  disabled: boolean;
  onSynced: (fragment: AudiobookFragment) => void;
  onLockChange: (locked: boolean) => void;
}) {
  const recorder = useAudiobookRecorder({ authorId, projectId, chapterId, onSynced });
  const [draftToDiscard, setDraftToDiscard] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);

  useEffect(() => {
    onLockChange(recorder.isLocked);
  }, [onLockChange, recorder.isLocked]);

  return (
    <section className="mt-5 rounded-2xl border border-[#8065ad] bg-[#21133d] p-4">
      <div className="flex flex-wrap items-center gap-3">
        {recorder.status === "recording" ? (
          <button type="button" onClick={recorder.stopRecording} className="rounded-full bg-[#d95d6b] px-5 py-3 text-sm font-semibold">
            Остановить · {Math.floor(recorder.elapsedMs / 1000)} с
          </button>
        ) : (
          <button type="button" disabled={disabled || recorder.status !== "idle"} onClick={() => void recorder.startRecording()} className="rounded-full bg-[#9bdab5] px-5 py-3 text-sm font-semibold text-[#1c1530] disabled:opacity-50">
            {recorder.status === "arming" ? "Подключаем микрофон…" : recorder.status === "saving" ? "Сохраняем запись…" : "Записать с микрофона"}
          </button>
        )}
        {recorder.status === "stopping" ? <span className="text-sm text-[#ddd2f5]">Останавливаем запись…</span> : null}
        {recorder.status === "saving" || recorder.pendingDraftCount ? <span className="text-sm text-[#ddd2f5]">Синхронизация черновика…</span> : null}
      </div>
      <p className="mt-3 text-sm text-[#ddd2f5]">Запись сохраняется на устройстве до успешной загрузки и будет отправлена при восстановлении сети.</p>
      {recorder.error ? <p role="alert" className="mt-3 text-sm text-[#ffb4b4]">{recorder.error}</p> : null}
      {recorder.drafts.filter((draft) => draft.chapterId === chapterId).map((draft) => (
        <div key={draft.id} className="mt-3 flex items-center justify-between gap-3 text-sm text-[#ddd2f5]">
          <span>Локальный черновик записи</span>
          <button type="button" disabled={recorder.isLocked || discarding} onClick={() => setDraftToDiscard(draft.id)} className="text-[#ffb4b4] underline">Удалить</button>
        </div>
      ))}
      {draftToDiscard ? (
        <div role="dialog" aria-modal="true" className="mt-4 rounded-xl border border-[#d95d6b] p-4">
          <p className="text-sm">Удалить локальный черновик? Восстановить запись будет невозможно.</p>
          <div className="mt-3 flex gap-3">
            <button type="button" disabled={discarding} onClick={() => {
              setDiscarding(true);
              void recorder.discardDraft(draftToDiscard)
                .then(() => setDraftToDiscard(null))
                .catch(() => undefined)
                .finally(() => setDiscarding(false));
            }} className="text-[#ffb4b4] underline">{discarding ? "Удаляем…" : "Удалить"}</button>
            <button type="button" disabled={discarding} onClick={() => setDraftToDiscard(null)} className="underline">Отмена</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
