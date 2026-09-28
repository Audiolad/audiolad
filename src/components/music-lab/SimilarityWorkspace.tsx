"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import LabPlayer from "@/components/music-lab/LabPlayer";
import { labErrorMessage, postMusicLab } from "@/components/music-lab/api";
import type { ClientSimilarityTask } from "@/lib/music-lab/client-view";
import type { SimilarityAnswers, SimilarityScore } from "@/lib/music-lab/types";
import { SIMILARITY_SCORES, UNCERTAIN_LABEL } from "@/lib/music-lab/vocabulary";

type SimilarityWorkspaceProps = {
  task: ClientSimilarityTask;
  locked: boolean;
  prevHref: string | null;
  nextHref: string | null;
};

function scoreValue(score: SimilarityScore | undefined): string {
  if (!score) {
    return "";
  }
  if ("uncertain" in score) {
    return "uncertain";
  }
  return String(score.score);
}

export default function SimilarityWorkspace({
  task,
  locked,
  prevHref,
  nextHref,
}: SimilarityWorkspaceProps) {
  const router = useRouter();
  const [answers, setAnswers] = useState<SimilarityAnswers>(task.answers);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setScore(publicCode: string, value: string) {
    setAnswers((current) => {
      const scores = { ...current.scores };
      if (value === "uncertain") {
        scores[publicCode] = { uncertain: true };
      } else if (value === "0" || value === "1" || value === "2" || value === "3") {
        scores[publicCode] = { score: Number(value) as 0 | 1 | 2 | 3 };
      } else {
        delete scores[publicCode];
      }
      return { scores };
    });
  }

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
          <p className="text-sm text-[#796ba0]">Похожесть</p>
          <h2 className="text-[28px] font-semibold text-[#25135c]">
            {task.label} из {task.total}
          </h2>
        </div>
        <Link href="/music-analyzer" className="text-sm font-medium text-[#7042c5]">
          К разделам
        </Link>
      </div>
      <p className="text-sm leading-6 text-[#4d3f73]">
        Сравните исходный фрагмент с двумя анонимными наборами. Оценка от 0 до 3, либо «Не уверен».
      </p>
      {locked ? (
        <p className="rounded-[16px] bg-[#f7f2fc] px-4 py-3 text-sm text-[#4d3f73]">
          Оценка завершена, ответы закрыты.
        </p>
      ) : null}

      <LabPlayer publicCode={task.seedPublicCode} label="Исходный фрагмент" />

      <div className="grid gap-5 lg:grid-cols-2">
        {task.sets.map((set) => (
          <section key={set.slot} className="space-y-4 rounded-[24px] border border-[#e4d7f4] bg-[#fffdfd] p-4">
            <h3 className="text-lg font-semibold text-[#25135c]">{set.label}</h3>
            {set.neighbours.map((neighbour) => (
              <div key={neighbour.publicCode} className="space-y-3 rounded-[18px] bg-[#f7f2fc] p-3">
                <LabPlayer publicCode={neighbour.publicCode} label={neighbour.label} />
                <fieldset disabled={locked} className="flex flex-wrap gap-2">
                  {SIMILARITY_SCORES.map((option) => {
                    const selected = scoreValue(answers.scores[neighbour.publicCode]) === String(option.value);
                    return (
                      <label
                        key={option.value}
                        className={`min-h-11 cursor-pointer rounded-full border px-3 py-2 text-sm ${
                          selected ? "border-[#7042c5] bg-white" : "border-transparent bg-white/70"
                        }`}
                      >
                        <input
                          className="sr-only"
                          type="radio"
                          name={`${task.code}-${neighbour.publicCode}`}
                          checked={selected}
                          disabled={locked}
                          onChange={() => setScore(neighbour.publicCode, String(option.value))}
                        />
                        {option.value} · {option.label}
                      </label>
                    );
                  })}
                  <label
                    className={`min-h-11 cursor-pointer rounded-full border px-3 py-2 text-sm ${
                      scoreValue(answers.scores[neighbour.publicCode]) === "uncertain"
                        ? "border-[#7042c5] bg-white"
                        : "border-transparent bg-white/70"
                    }`}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name={`${task.code}-${neighbour.publicCode}`}
                      checked={scoreValue(answers.scores[neighbour.publicCode]) === "uncertain"}
                      disabled={locked}
                      onChange={() => setScore(neighbour.publicCode, "uncertain")}
                    />
                    {UNCERTAIN_LABEL}
                  </label>
                </fieldset>
              </div>
            ))}
          </section>
        ))}
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
