"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { MusicPassport } from "@/components/music-passport/MusicPassport";
import type { MusicAnalyzerRunClient } from "@/lib/music-analyzer-runs/contract";
import { readMusicAnalyzerPassport } from "@/lib/music-analyzer-runs/passport";

const ERRORS: Record<string, string> = {
  analyzer_commit_mismatch: "Чекаут анализатора не совпал с зафиксированным коммитом.",
  analyzer_content_missing: "В чекауте нет содержимого анализатора 3750f3b.",
  analyzer_content_not_ancestor: "Зафиксированный снимок не содержит базовый коммит анализатора.",
  checkpoint_missing: "На сервере нет CLAP-чекпоинта.",
  analyzer_runtime_missing: "Python-анализатор на сервере ещё не подготовлен.",
  analyze_failed: "Анализатор завершился с ошибкой. Музыкальные поля не подставлялись.",
  source_sha_mismatch: "Контрольная сумма файла не совпала.",
  wav_convert_failed: "Не удалось подготовить WAV для анализатора.",
  worker_lease_expired: "Прогон не успел завершиться.",
};

function statusLabel(status: MusicAnalyzerRunClient["status"]): string {
  if (status === "queued") return "В очереди";
  if (status === "processing") return "Считается";
  if (status === "succeeded") return "Готово";
  return "Ошибка";
}

export function RunDetail({
  initial,
  siblings,
}: {
  initial: MusicAnalyzerRunClient;
  siblings: MusicAnalyzerRunClient[];
}) {
  const [run, setRun] = useState(initial);
  useEffect(() => {
    if (run.status === "succeeded" || run.status === "failed") return undefined;
    const timer = setInterval(() => {
      void fetch(`/api/music-analyzer/runs/${run.id}`)
        .then(async (response) => {
          if (!response.ok) return null;
          return response.json() as Promise<{ run?: MusicAnalyzerRunClient }>;
        })
        .then((payload) => {
          if (payload?.run) setRun(payload.run);
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [run.id, run.status]);

  const other = siblings.filter((item) => item.id !== run.id);
  const passport = readMusicAnalyzerPassport({
    normalized: run.normalizedJson,
    raw: run.rawJson,
    taxonomyVersion: run.taxonomyVersion,
    promptVersion: run.promptVersion,
  });

  const notice = run.status === "failed"
    ? {
        tone: "error" as const,
        text: ERRORS[run.errorCode ?? ""] ?? "Прогон не сохранился. Повтор того же файла создаст новую версию.",
      }
    : run.status === "queued" || run.status === "processing"
      ? { tone: "info" as const, text: "Результат появится здесь, когда анализатор закончит." }
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex justify-end">
        <Link href="/music-analyzer/runs" className="text-sm font-medium text-[#7042c5]">
          К истории
        </Link>
      </div>
      <MusicPassport
        mode="full"
        passport={run.status === "succeeded" ? passport : null}
        header={{
          filename: run.sourceFilename,
          analyzedAt: run.finishedAt ?? run.createdAt,
          analyzerVersion: run.analyzerVersion,
          statusLabel: statusLabel(run.status),
          fileVersion: run.versionNumber,
        }}
        snapshot={{
          version: run.analyzerVersion,
          commit: run.analyzerGitCommit,
        }}
        provenance={{
          sha256: run.sha256,
          analyzerGitCommit: run.analyzerGitCommit,
          analyzerContentCommit: run.analyzerContentCommit,
          modelCheckpoint: run.modelCheckpoint,
          device: run.device,
          taxonomy: passport.taxonomy,
          prompt: passport.prompt,
        }}
        developerJson={run.status === "succeeded" ? run.normalizedJson : null}
        notice={notice}
      />
      {run.status === "succeeded" ? (
        <div className="flex flex-wrap gap-4 text-sm font-medium text-[#7042c5]">
          <a href={`/api/music-analyzer/runs/${run.id}/export?format=json`}>JSON</a>
          <a href={`/api/music-analyzer/runs/${run.id}/export?format=csv`}>CSV</a>
          <a href={`/api/music-analyzer/runs/${run.id}/export?format=markdown`}>Markdown</a>
        </div>
      ) : null}
      {other.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-[#25135c]">Другие версии этого файла</h3>
          <ul className="space-y-2 text-sm">
            {other.map((item) => (
              <li key={item.id}>
                <Link href={`/music-analyzer/runs/${item.id}`} className="text-[#7042c5]">
                  Версия {item.versionNumber} · {statusLabel(item.status)}
                </Link>
                {run.status === "succeeded" && item.status === "succeeded" ? (
                  <>
                    {" · "}
                    <Link
                      href={`/music-analyzer/runs/compare?left=${run.id}&right=${item.id}`}
                      className="text-[#7042c5]"
                    >
                      Сравнить
                    </Link>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
