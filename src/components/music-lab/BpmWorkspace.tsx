"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import LabPlayer from "@/components/music-lab/LabPlayer";
import { labErrorMessage, postMusicLab } from "@/components/music-lab/api";
import { UncertainToggle } from "@/components/music-lab/fields";
import type { ClientBpmTask } from "@/lib/music-lab/client-view";
import type { BpmAnswers } from "@/lib/music-lab/types";
import { MUSICAL_KEYS } from "@/lib/music-lab/vocabulary";

type BpmWorkspaceProps = {
  task: ClientBpmTask;
  locked: boolean;
  prevHref: string | null;
  nextHref: string | null;
};

export default function BpmWorkspace({ task, locked, prevHref, nextHref }: BpmWorkspaceProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<BpmAnswers>(task.answers);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    const result = await postMusicLab("/api/music-analyzer/responses", {
      taskCode: task.code,
      answers,
    });
    setPending(false);
    if (!result.ok) {
      setError(labErrorMessage(result.payload.error));
      return;
    }
    router.push(nextHref ?? "/music-analyzer");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[#796ba0]">BPM / тональность</p>
          <h2 className="text-[28px] font-semibold text-[#25135c]">
            {task.label} из {task.total}
          </h2>
        </div>
        <Link href="/music-analyzer" className="text-sm font-medium text-[#7042c5]">
          К разделам
        </Link>
      </div>
      <p className="text-sm leading-6 text-[#4d3f73]">
        Запишите то, что слышите. Если нет уверенности, отметьте «Не уверен» — угадывать не нужно.
      </p>
      {locked ? (
        <p className="rounded-[16px] bg-[#f7f2fc] px-4 py-3 text-sm text-[#4d3f73]">
          Оценка завершена, ответы закрыты.
        </p>
      ) : null}
      <LabPlayer publicCode={task.itemPublicCode} label={task.label} />

      <fieldset disabled={locked} className="grid gap-5 lg:grid-cols-2">
        <label className="rounded-[22px] border border-[#e4d7f4] bg-white p-4">
          <span className="text-base font-semibold text-[#25135c]">Темп, ударов в минуту</span>
          <input
            inputMode="numeric"
            disabled={locked || answers.bpmUncertain}
            value={answers.bpm ?? ""}
            onChange={(event) => {
              const raw = event.target.value.trim();
              setAnswers((current) => ({
                ...current,
                bpmUncertain: false,
                bpm: raw === "" ? null : Number(raw),
              }));
            }}
            className="mt-3 w-full rounded-[14px] border border-[#e4d7f4] px-4 py-3 text-sm"
          />
          <UncertainToggle
            checked={answers.bpmUncertain}
            disabled={locked}
            onChange={(checked) =>
              setAnswers((current) => ({
                ...current,
                bpmUncertain: checked,
                bpm: checked ? null : current.bpm,
              }))
            }
          />
        </label>
        <label className="rounded-[22px] border border-[#e4d7f4] bg-white p-4">
          <span className="text-base font-semibold text-[#25135c]">Тональность</span>
          <select
            disabled={locked || answers.keyUncertain}
            value={answers.key ?? ""}
            onChange={(event) =>
              setAnswers((current) => ({
                ...current,
                keyUncertain: false,
                key: event.target.value || null,
              }))
            }
            className="mt-3 w-full rounded-[14px] border border-[#e4d7f4] bg-white px-4 py-3 text-sm"
          >
            <option value="">Выберите</option>
            {MUSICAL_KEYS.map((key) => (
              <option key={key.id} value={key.id}>
                {key.label}
              </option>
            ))}
          </select>
          <UncertainToggle
            checked={answers.keyUncertain}
            disabled={locked}
            onChange={(checked) =>
              setAnswers((current) => ({
                ...current,
                keyUncertain: checked,
                key: checked ? null : current.key,
              }))
            }
          />
        </label>
      </fieldset>

      {error ? <p className="text-sm text-[#b34f63]">{error}</p> : null}
      <div className="flex flex-wrap gap-3">
        {prevHref ? (
          <Link
            href={prevHref}
            className="inline-flex min-h-12 items-center justify-center rounded-[16px] border border-[#e4d7f4] px-5 text-sm font-semibold text-[#25135c]"
          >
            Предыдущий
          </Link>
        ) : null}
        <button
          type="button"
          disabled={locked || pending}
          onClick={() => void save()}
          className="inline-flex min-h-12 items-center justify-center rounded-[16px] bg-[#7042c5] px-5 text-sm font-semibold text-white disabled:bg-[#d9cceb]"
        >
          {nextHref ? "Сохранить и следующий" : "Сохранить и к разделам"}
        </button>
      </div>
    </div>
  );
}
