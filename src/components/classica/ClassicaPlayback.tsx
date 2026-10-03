"use client";

import { useActionState, useState } from "react";

import { classicaIdleState } from "@/lib/classica/production/action-state";
import { confirmClassicaPlaybackAction } from "@/lib/classica/production/actions";

type ClassicaPlaybackProps = {
  jobId: string;
  src: string;
  confirmed: boolean;
  canConfirm: boolean;
};

export default function ClassicaPlayback({
  jobId,
  src,
  confirmed,
  canConfirm,
}: ClassicaPlaybackProps) {
  const [state, action] = useActionState(confirmClassicaPlaybackAction, classicaIdleState);
  const [played, setPlayed] = useState(false);
  const [duration, setDuration] = useState("");

  return (
    <form action={action} className="rounded-2xl border border-[#e4d7f4] bg-white p-4">
      <h2 className="text-base font-semibold">Прослушивание</h2>
      <audio
        className="mt-3 w-full"
        controls
        preload="metadata"
        src={src}
        onLoadedMetadata={(event) => {
          const next = event.currentTarget.duration;
          if (Number.isFinite(next) && next > 0) {
            setDuration(String(next));
          }
        }}
        onPlaying={() => setPlayed(true)}
      />
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="duration_seconds" value={duration} />
      {confirmed ? (
        <p className="mt-3 text-sm text-[#2f7d4a]">Воспроизведение подтверждено.</p>
      ) : canConfirm ? (
        <button
          type="submit"
          disabled={!played || !duration}
          className="mt-3 rounded-xl bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Аудио воспроизводится
        </button>
      ) : (
        <p className="mt-3 text-sm text-[#796ba0]">Подтвердить воспроизведение может исполнитель карточки.</p>
      )}
      {state.error ? <p className="mt-2 text-sm text-[#9b2c4a]">{state.error}</p> : null}
    </form>
  );
}
