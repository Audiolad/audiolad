"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import LabPlayer from "@/components/music-lab/LabPlayer";
import { labErrorMessage, postMusicLab } from "@/components/music-lab/api";
import { FieldLegend, MultiChoices, RadioChoices, UncertainToggle } from "@/components/music-lab/fields";
import type { ClientListenTask } from "@/lib/music-lab/client-view";
import type { ListenAnswers } from "@/lib/music-lab/types";
import {
  COARSE_GENRES,
  COMMENT_LIMIT,
  INSTRUMENTS,
  MOOD_LIMIT,
  MOODS,
  SOUND_CHARACTERS,
  SOUND_LIMIT,
  STYLES,
  VOCAL_ROLES,
} from "@/lib/music-lab/vocabulary";

type ListenWorkspaceProps = {
  task: ClientListenTask;
  locked: boolean;
  prevHref: string | null;
  nextHref: string | null;
};

function toggleLimited(current: string[], id: string, limit: number): string[] {
  if (current.includes(id)) {
    return current.filter((entry) => entry !== id);
  }
  if (current.length >= limit) {
    return current;
  }
  return [...current, id];
}

export default function ListenWorkspace({
  task,
  locked,
  prevHref,
  nextHref,
}: ListenWorkspaceProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<ListenAnswers>(task.answers);
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
    if (nextHref) {
      router.push(nextHref);
      return;
    }
    router.push("/music-analyzer");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[#796ba0]">Прослушивание</p>
          <h2 className="text-[28px] font-semibold text-[#25135c]">
            {task.label} из {task.total}
          </h2>
        </div>
        <Link href="/music-analyzer" className="text-sm font-medium text-[#7042c5]">
          К разделам
        </Link>
      </div>

      {locked ? (
        <p className="rounded-[16px] bg-[#f7f2fc] px-4 py-3 text-sm text-[#4d3f73]">
          Оценка завершена, ответы закрыты. Чтобы изменить их, верните эксперимент в работу.
        </p>
      ) : null}

      <LabPlayer publicCode={task.itemPublicCode} label={task.label} />

      <div className="space-y-6">
        <div>
          <FieldLegend title="Основной жанр" hint="Один вариант. Если неясно — «Не уверен»." />
          <RadioChoices
            name={`genre-${task.code}`}
            options={COARSE_GENRES}
            value={answers.coarseGenre}
            disabled={locked}
            onChange={(id) => setAnswers((current) => ({ ...current, coarseGenre: id }))}
          />
        </div>

        <div>
          <FieldLegend title="Возможные стили" hint="Можно несколько. Или отметьте «Не уверен»." />
          <UncertainToggle
            checked={answers.stylesUncertain}
            disabled={locked}
            onChange={(checked) =>
              setAnswers((current) => ({
                ...current,
                stylesUncertain: checked,
                styles: checked ? [] : current.styles,
              }))
            }
          />
          <MultiChoices
            options={STYLES}
            selected={answers.styles}
            disabled={locked || answers.stylesUncertain}
            onToggle={(id) =>
              setAnswers((current) => ({
                ...current,
                stylesUncertain: false,
                styles: current.styles.includes(id)
                  ? current.styles.filter((entry) => entry !== id)
                  : [...current.styles, id],
              }))
            }
          />
        </div>

        <div>
          <FieldLegend title="Роль голоса" />
          <RadioChoices
            name={`vocal-${task.code}`}
            options={VOCAL_ROLES}
            value={answers.vocalRole}
            disabled={locked}
            onChange={(id) => setAnswers((current) => ({ ...current, vocalRole: id }))}
          />
        </div>

        <div>
          <FieldLegend title="Явные инструменты" hint="То, что слышно без угадывания." />
          <UncertainToggle
            checked={answers.instrumentsUncertain}
            disabled={locked}
            onChange={(checked) =>
              setAnswers((current) => ({
                ...current,
                instrumentsUncertain: checked,
                instruments: checked ? [] : current.instruments,
                instrumentsOther: checked ? "" : current.instrumentsOther,
              }))
            }
          />
          <MultiChoices
            options={INSTRUMENTS}
            selected={answers.instruments}
            disabled={locked || answers.instrumentsUncertain}
            onToggle={(id) =>
              setAnswers((current) => ({
                ...current,
                instrumentsUncertain: false,
                instruments: current.instruments.includes(id)
                  ? current.instruments.filter((entry) => entry !== id)
                  : [...current.instruments, id],
              }))
            }
          />
          {answers.instruments.includes("other") ? (
            <input
              value={answers.instrumentsOther}
              disabled={locked}
              maxLength={160}
              placeholder="Какой ещё инструмент"
              onChange={(event) =>
                setAnswers((current) => ({ ...current, instrumentsOther: event.target.value }))
              }
              className="mt-3 w-full rounded-[14px] border border-[#e4d7f4] px-4 py-3 text-sm"
            />
          ) : null}
        </div>

        <div>
          <FieldLegend title="Настроение" hint={`Не больше ${MOOD_LIMIT}.`} />
          <UncertainToggle
            checked={answers.moodsUncertain}
            disabled={locked}
            onChange={(checked) =>
              setAnswers((current) => ({
                ...current,
                moodsUncertain: checked,
                moods: checked ? [] : current.moods,
              }))
            }
          />
          <MultiChoices
            options={MOODS}
            selected={answers.moods}
            limit={MOOD_LIMIT}
            disabled={locked || answers.moodsUncertain}
            onToggle={(id) =>
              setAnswers((current) => ({
                ...current,
                moodsUncertain: false,
                moods: toggleLimited(current.moods, id, MOOD_LIMIT),
              }))
            }
          />
        </div>

        <div>
          <FieldLegend title="Характер звука" hint={`Не больше ${SOUND_LIMIT}.`} />
          <UncertainToggle
            checked={answers.soundUncertain}
            disabled={locked}
            onChange={(checked) =>
              setAnswers((current) => ({
                ...current,
                soundUncertain: checked,
                soundCharacter: checked ? [] : current.soundCharacter,
              }))
            }
          />
          <MultiChoices
            options={SOUND_CHARACTERS}
            selected={answers.soundCharacter}
            limit={SOUND_LIMIT}
            disabled={locked || answers.soundUncertain}
            onToggle={(id) =>
              setAnswers((current) => ({
                ...current,
                soundUncertain: false,
                soundCharacter: toggleLimited(current.soundCharacter, id, SOUND_LIMIT),
              }))
            }
          />
        </div>

        <label className="block">
          <span className="text-base font-semibold text-[#25135c]">Комментарий</span>
          <textarea
            value={answers.comment}
            disabled={locked}
            maxLength={COMMENT_LIMIT}
            rows={4}
            onChange={(event) =>
              setAnswers((current) => ({ ...current, comment: event.target.value }))
            }
            className="mt-3 w-full rounded-[16px] border border-[#e4d7f4] px-4 py-3 text-sm"
          />
        </label>
      </div>

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
