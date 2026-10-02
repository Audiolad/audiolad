"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { normalizeAudioMime } from "@/lib/music-analyzer-runs/audio-file";
import {
  classifySignedUploadError,
  fileForSignedUpload,
} from "@/lib/music-analyzer-runs/browser-upload";
import type { MusicAnalyzerRunClient } from "@/lib/music-analyzer-runs/contract";
import { MUSIC_ANALYZER_RUNS_BUCKET } from "@/lib/music-analyzer-runs/constants";
import { createClient } from "@/lib/supabase/client";

const ERRORS: Record<string, string> = {
  file_required: "Выберите WAV или MP3.",
  file_too_large: "Файл больше 100 МБ.",
  file_type: "Нужен WAV или MP3.",
  upload_unavailable: "Хранилище анализа сейчас недоступно.",
  upload_ticket_invalid: "Загрузка устарела. Выберите файл ещё раз.",
  upload_size_mismatch: "Размер файла не совпал с загруженным объектом.",
  storage_unavailable: "Хранилище анализа сейчас недоступно.",
  enqueue_failed: "Не удалось поставить прогон в очередь.",
  invalid_mime_type: "Хранилище не приняло тип файла.",
  upload_network: "Не удалось связаться с хранилищем.",
  upload_rejected: "Хранилище отклонило загрузку.",
  object_missing: "Файл не попал в хранилище.",
};

function message(code: string | undefined): string {
  if (!code) return "Не удалось загрузить файл.";
  return ERRORS[code] ?? "Не удалось загрузить файл.";
}

function statusLabel(status: MusicAnalyzerRunClient["status"]): string {
  if (status === "queued") return "В очереди";
  if (status === "processing") return "Считается";
  if (status === "succeeded") return "Готово";
  return "Ошибка";
}

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function RunsWorkspace({ runs }: { runs: MusicAnalyzerRunClient[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const selectedRuns = useMemo(
    () => runs.filter((run) => selected.includes(run.id) && run.status === "succeeded"),
    [runs, selected],
  );
  const canCompare = selectedRuns.length === 2 && selectedRuns[0]?.sha256 === selectedRuns[1]?.sha256;

  async function onFile(file: File | null) {
    if (!file) return;
    setPending(true);
    setError(null);
    const mime = normalizeAudioMime(file.name, file.type);
    if (!mime) {
      setPending(false);
      setError(message("file_type"));
      return;
    }
    const start = await fetch("/api/music-analyzer/runs/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: mime }),
    });
    const started = await readJson<{
      error?: string;
      ticket?: string;
      signedUpload?: { path: string; token: string };
    }>(start);
    if (!start.ok || !started?.ticket || !started.signedUpload?.path || !started.signedUpload.token) {
      setPending(false);
      setError(message(started?.error));
      return;
    }
    const uploaded = await createClient().storage
      .from(MUSIC_ANALYZER_RUNS_BUCKET)
      .uploadToSignedUrl(
        started.signedUpload.path,
        started.signedUpload.token,
        fileForSignedUpload(file, file.name, mime),
        {
          contentType: mime,
          upsert: false,
        },
      );
    if (uploaded.error) {
      const storageError = classifySignedUploadError(uploaded.error);
      await fetch("/api/music-analyzer/runs/uploads/abandon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: started.ticket, storageError }),
      });
      setPending(false);
      setError(message(storageError.code));
      return;
    }
    const finalized = await fetch("/api/music-analyzer/runs/uploads/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: started.ticket }),
    });
    const payload = await readJson<{ error?: string; run?: { id: string } }>(finalized);
    setPending(false);
    if (!finalized.ok || !payload?.run?.id) {
      setError(message(payload?.error));
      return;
    }
    router.push(`/music-analyzer/runs/${payload.run.id}`);
    router.refresh();
  }

  function toggle(id: string) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 2) return [current[1] ?? id, id];
      return [...current, id];
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold text-[#25135c]">Автоанализ</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#796ba0]">
            WAV или MP3 уходит в очередь. На сервере АудиоЛада Python-анализатор
            считает прогон и сохраняет его отдельной версией. Тот же файл ещё раз — новый прогон.
          </p>
        </div>
        <Link href="/music-analyzer" className="text-sm font-medium text-[#7042c5]">
          К проверке на слух
        </Link>
      </div>
      <label className="block rounded-[22px] border border-[#e4d7f4] bg-white p-5">
        <span className="text-sm font-medium text-[#25135c]">Файл до 100 МБ</span>
        <input
          type="file"
          accept=".wav,.mp3,audio/wav,audio/mpeg"
          disabled={pending}
          className="mt-3 block w-full text-sm text-[#25135c]"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            event.target.value = "";
            void onFile(file);
          }}
        />
        {pending ? <p className="mt-3 text-sm text-[#796ba0]">Загружаем и ставим в очередь…</p> : null}
        {error ? <p className="mt-3 text-sm text-[#8b2f4b]">{error}</p> : null}
      </label>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-[#25135c]">История</h3>
        {canCompare ? (
          <Link
            href={`/music-analyzer/runs/compare?left=${selectedRuns[0]?.id}&right=${selectedRuns[1]?.id}`}
            className="text-sm font-medium text-[#7042c5]"
          >
            Сравнить две версии
          </Link>
        ) : (
          <p className="text-sm text-[#796ba0]">Отметьте два готовых прогона одного файла.</p>
        )}
      </div>
      <div className="overflow-x-auto rounded-[22px] border border-[#e4d7f4] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="text-[#796ba0]">
            <tr>
              <th className="px-4 py-3 font-medium"> </th>
              <th className="px-4 py-3 font-medium">Файл</th>
              <th className="px-4 py-3 font-medium">Версия</th>
              <th className="px-4 py-3 font-medium">SHA256</th>
              <th className="px-4 py-3 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-[#796ba0]">
                  Прогонов пока нет.
                </td>
              </tr>
            ) : runs.map((run) => (
              <tr key={run.id} className="border-t border-[#f0e7f8]">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={`Выбрать версию ${run.versionNumber}`}
                    disabled={run.status !== "succeeded"}
                    checked={selected.includes(run.id)}
                    onChange={() => toggle(run.id)}
                  />
                </td>
                <td className="px-4 py-3">
                  <Link href={`/music-analyzer/runs/${run.id}`} className="font-medium text-[#25135c]">
                    {run.sourceFilename}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[#25135c]">{run.versionNumber}</td>
                <td className="px-4 py-3 font-mono text-xs text-[#796ba0]">{run.sha256.slice(0, 12)}</td>
                <td className="px-4 py-3 text-[#25135c]">{statusLabel(run.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
