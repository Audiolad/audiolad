"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { labErrorMessage, postMusicLab } from "@/components/music-lab/api";

export function ImportPacketButton({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    const result = await postMusicLab("/api/music-analyzer/import");
    setPending(false);
    if (!result.ok) {
      setError(labErrorMessage(result.payload.error));
      return;
    }
    setNote("Пакет загружен. Уже сохранённые ответы не удалялись.");
    router.refresh();
  }

  return (
    <div className="rounded-[22px] border border-[#e4d7f4] bg-white p-5">
      <h2 className="text-lg font-semibold text-[#25135c]">
        {initial ? "Пакет проверки ещё не загружен" : "Структура пакета"}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#796ba0]">
        {initial
          ? "Загрузка создаёт задания для прослушивания. Аудиофайлы в репозиторий не входят."
          : "Повторная загрузка обновляет структуру и не стирает уже сохранённые ответы."}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => void run()}
        className="mt-4 inline-flex min-h-12 items-center justify-center rounded-[16px] bg-[#7042c5] px-5 text-sm font-semibold text-white disabled:bg-[#d9cceb]"
      >
        {initial ? "Загрузить пакет проверки" : "Обновить структуру пакета"}
      </button>
      {note ? <p className="mt-3 text-sm text-[#2f6b4f]">{note}</p> : null}
      {error ? <p className="mt-3 text-sm text-[#b34f63]">{error}</p> : null}
    </div>
  );
}

export function CompleteExperimentButton({
  ready,
  missing,
  completed,
}: {
  ready: boolean;
  missing: { listen: number; similarity: number; bpm: number };
  completed: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    setPending(true);
    setError(null);
    const result = await postMusicLab("/api/music-analyzer/complete");
    setPending(false);
    if (!result.ok) {
      setError(labErrorMessage(result.payload.error));
      setConfirming(false);
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  async function reopen() {
    setPending(true);
    setError(null);
    const result = await postMusicLab("/api/music-analyzer/reopen");
    setPending(false);
    if (!result.ok) {
      setError(labErrorMessage(result.payload.error));
      return;
    }
    router.refresh();
  }

  if (completed) {
    return (
      <div className="rounded-[22px] border border-[#e4d7f4] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">Оценка завершена</h2>
        <p className="mt-2 text-sm leading-6 text-[#796ba0]">
          Ответы закрыты. Результаты можно смотреть. Если нужно исправить оценку, верните эксперимент в работу — результаты снова скроются.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => void reopen()}
          className="mt-4 inline-flex min-h-12 items-center justify-center rounded-[16px] border border-[#e4d7f4] px-5 text-sm font-semibold text-[#25135c]"
        >
          Вернуть в оценку
        </button>
        {error ? <p className="mt-3 text-sm text-[#b34f63]">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-[22px] border border-[#e4d7f4] bg-white p-5">
      <h2 className="text-lg font-semibold text-[#25135c]">Завершить ручную оценку</h2>
      {ready ? (
        <p className="mt-2 text-sm leading-6 text-[#796ba0]">
          Все обязательные ответы на месте. После подтверждения ответы закроются, и откроется раздел результатов.
        </p>
      ) : (
        <ul className="mt-3 space-y-1 text-sm text-[#4d3f73]">
          {missing.listen > 0 ? <li>Прослушивание: осталось {missing.listen}</li> : null}
          {missing.similarity > 0 ? <li>Похожесть: осталось {missing.similarity}</li> : null}
          {missing.bpm > 0 ? <li>BPM / тональность: осталось {missing.bpm}</li> : null}
        </ul>
      )}
      {confirming ? (
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => void complete()}
            className="inline-flex min-h-12 items-center justify-center rounded-[16px] bg-[#7042c5] px-5 text-sm font-semibold text-white"
          >
            Подтвердить завершение
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="inline-flex min-h-12 items-center justify-center rounded-[16px] border border-[#e4d7f4] px-5 text-sm"
          >
            Отмена
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={!ready || pending}
          onClick={() => setConfirming(true)}
          className="mt-4 inline-flex min-h-12 items-center justify-center rounded-[16px] bg-[#7042c5] px-5 text-sm font-semibold text-white disabled:bg-[#d9cceb]"
        >
          Завершить ручную оценку
        </button>
      )}
      {error ? <p className="mt-3 text-sm text-[#b34f63]">{error}</p> : null}
    </div>
  );
}
