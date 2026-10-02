"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { MusicAnalyzerRunClient } from "@/lib/music-analyzer-runs/contract";

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold text-[#25135c]">{run.sourceFilename}</h2>
          <p className="mt-2 text-sm text-[#796ba0]">
            Версия {run.versionNumber} · {statusLabel(run.status)}
          </p>
        </div>
        <Link href="/music-analyzer/runs" className="text-sm font-medium text-[#7042c5]">
          К истории
        </Link>
      </div>
      <dl className="grid gap-3 rounded-[22px] border border-[#e4d7f4] bg-white p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[#796ba0]">SHA256</dt>
          <dd className="mt-1 break-all font-mono text-xs text-[#25135c]">{run.sha256}</dd>
        </div>
        <div>
          <dt className="text-[#796ba0]">Коммит анализатора</dt>
          <dd className="mt-1 break-all font-mono text-xs text-[#25135c]">{run.analyzerGitCommit ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[#796ba0]">Содержание</dt>
          <dd className="mt-1 break-all font-mono text-xs text-[#25135c]">{run.analyzerContentCommit ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[#796ba0]">Чекпоинт</dt>
          <dd className="mt-1 text-[#25135c]">{run.modelCheckpoint ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[#796ba0]">Таксономия / промпт</dt>
          <dd className="mt-1 text-[#25135c]">
            {run.taxonomyVersion ?? "—"} / {run.promptVersion ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[#796ba0]">Создан</dt>
          <dd className="mt-1 text-[#25135c]">{run.createdAt}</dd>
        </div>
      </dl>
      {run.status === "failed" ? (
        <p className="text-sm text-[#8b2f4b]">
          {ERRORS[run.errorCode ?? ""] ?? "Прогон не сохранился. Повтор того же файла создаст новую версию."}
        </p>
      ) : null}
      {run.status === "queued" || run.status === "processing" ? (
        <p className="text-sm text-[#796ba0]">Результат появится здесь, когда анализатор закончит.</p>
      ) : null}
      {run.status === "succeeded" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm font-medium text-[#7042c5]">
            <a href={`/api/music-analyzer/runs/${run.id}/export?format=json`}>JSON</a>
            <a href={`/api/music-analyzer/runs/${run.id}/export?format=csv`}>CSV</a>
            <a href={`/api/music-analyzer/runs/${run.id}/export?format=markdown`}>Markdown</a>
          </div>
          <pre className="max-h-[32rem] overflow-auto rounded-[22px] border border-[#e4d7f4] bg-white p-4 text-xs leading-5 text-[#25135c]">
            {JSON.stringify(run.normalizedJson, null, 2)}
          </pre>
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
