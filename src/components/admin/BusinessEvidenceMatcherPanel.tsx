"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import {
  createMatchJobAction,
  finishUploadAction,
  startIndexBuildAction,
} from "@/app/(platform)/admin/business-evidence/actions";
import { MATCHER_ERROR_TEXT } from "@/lib/evidence/constants";
import type { EvidenceLocationOption } from "@/components/admin/BusinessEvidenceExtractPanel";

const PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-full bg-[#25135c] px-5 text-sm font-semibold text-white disabled:opacity-60";
const OUTLINE = "inline-flex min-h-9 items-center justify-center rounded-full border border-[#d9cdef] bg-white px-4 text-sm font-medium text-[#25135c] disabled:opacity-60";
const INPUT = "min-h-11 rounded-xl border border-[#d9cdef] bg-white px-3 text-sm text-[#25135c]";
const CHUNK = 3 * 1024 * 1024;

export type MatcherIndexView = {
  ready: boolean;
  installed: boolean;
  olaf: boolean;
  summary: string | null;
  build: string | null;
  building: boolean;
  failed: string[];
};

export type MatcherJobRow = { id: string; created: string; name: string; state: string; place: string | null };

async function uploadFile(jobId: string, slot: "input" | "claim", file: File, onProgress: (sent: number) => void) {
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(file.size, offset + CHUNK));
    let attempt = 0;
    for (;;) {
      const res = await fetch(`/api/admin/business-evidence/upload?job=${encodeURIComponent(jobId)}&slot=${slot}&offset=${offset}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: chunk,
        credentials: "same-origin",
      }).catch(() => null);
      if (res?.ok) {
        const body = (await res.json()) as { received: number };
        offset = body.received;
        break;
      }
      attempt += 1;
      if (attempt >= 4) throw new Error("upload_failed");
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    onProgress(offset);
  }
}

export default function BusinessEvidenceMatcherPanel({
  index,
  locations,
  jobs,
}: {
  index: MatcherIndexView;
  locations: EvidenceLocationOption[];
  jobs: MatcherJobRow[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const claimRef = useRef<HTMLInputElement>(null);
  const [locationId, setLocationId] = useState("");
  const [recordedAt, setRecordedAt] = useState("");
  const [claimLabel, setClaimLabel] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();

  const rebuild = () => {
    setMessage(null);
    start(async () => {
      const res = await startIndexBuildAction();
      setMessage(res.ok ? "Сборка индекса запущена в фоне. Обновите страницу через несколько минут." : MATCHER_ERROR_TEXT[res.error] ?? "Не удалось запустить сборку.");
      router.refresh();
    });
  };

  const submit = async () => {
    const file = fileRef.current?.files?.[0];
    const claim = claimRef.current?.files?.[0] ?? null;
    if (!file) {
      setMessage("Выберите файл записи.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const created = await createMatchJobAction({
        fileName: file.name, size: file.size,
        claim: claim ? { fileName: claim.name, size: claim.size, label: claimLabel || claim.name } : null,
        locationId, recordedAtLocal: recordedAt, note,
      });
      if (!created.ok) {
        setMessage(MATCHER_ERROR_TEXT[created.error] ?? "Не удалось начать проверку.");
        return;
      }
      const total = file.size + (claim?.size ?? 0);
      await uploadFile(created.id, "input", file, (n) => setProgress(`Загрузка: ${Math.round((n / total) * 100)} %`));
      if (claim) await uploadFile(created.id, "claim", claim, (n) => setProgress(`Загрузка: ${Math.round(((file.size + n) / total) * 100)} %`));
      const started = await finishUploadAction(created.id);
      if (!started.ok) {
        setMessage(MATCHER_ERROR_TEXT[started.error] ?? "Не удалось запустить проверку.");
        return;
      }
      router.push(`/admin/business-evidence/jobs/${created.id}`);
    } catch {
      setMessage("Загрузка прервалась. Проверьте связь и попробуйте ещё раз.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-evidence-matcher">
      <div className="rounded-[22px] border border-[#e7def6] bg-white p-5">
        <h3 className="text-base font-semibold text-[#25135c]">Индекс каталога</h3>
        {!index.installed ? (
          <p className="mt-2 text-sm text-[#b34f63]">Движок сверки не установлен на сервере.</p>
        ) : index.summary ? (
          <p className="mt-2 text-sm text-[#25135c]" data-testid="admin-evidence-index">{index.summary}</p>
        ) : (
          <p className="mt-2 text-sm text-[#796ba0]">Индекс ещё не собран.</p>
        )}
        {!index.olaf && index.installed ? <p className="mt-1 text-xs text-[#796ba0]">Второй алгоритм (Olaf) недоступен – сверка идёт одним алгоритмом.</p> : null}
        {index.build ? <p className="mt-1 text-xs text-[#796ba0]">{index.build}</p> : null}
        {index.failed.length ? <p className="mt-1 text-xs text-[#b34f63]">Не вошли в индекс: {index.failed.join(", ")}</p> : null}
        <button type="button" className={`${OUTLINE} mt-3`} disabled={pending || index.building || !index.installed} onClick={rebuild} data-testid="admin-evidence-rebuild">
          {index.building ? "Индекс собирается…" : "Пересобрать индекс"}
        </button>
      </div>

      <div className="rounded-[22px] border border-[#e7def6] bg-white p-5">
        <h3 className="text-base font-semibold text-[#25135c]">Проверить запись</h3>
        <p className="mt-1 text-sm text-[#796ba0]">
          Загрузите запись инспектора (до 500 МБ). Сервис найдёт в ней треки каталога АудиоЛад и сверит их с журналом
          воспроизведения точки.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-xs text-[#796ba0]">
            Файл записи
            <input ref={fileRef} type="file" accept="audio/*,video/*,.m4a,.amr,.3gp" className="text-sm" data-testid="admin-evidence-file" />
          </label>
          <label className="grid gap-1 text-xs text-[#796ba0]">
            Точка (для сверки с журналом)
            <select className={INPUT} value={locationId} onChange={(e) => setLocationId(e.target.value)} data-testid="admin-evidence-job-location">
              <option value="">Не сверять с журналом</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-[#796ba0]">
            Время начала записи по акту (время точки)
            <input type="datetime-local" step={1} className={INPUT} value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} data-testid="admin-evidence-recorded" />
          </label>
          <label className="grid gap-1 text-xs text-[#796ba0]">
            Примечание (номер акта, кто записывал)
            <input className={INPUT} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-[#796ba0]">
            Трек из претензии (необязательно)
            <input ref={claimRef} type="file" accept="audio/*" className="text-sm" data-testid="admin-evidence-claim" />
          </label>
          <label className="grid gap-1 text-xs text-[#796ba0]">
            Название трека из претензии
            <input className={INPUT} value={claimLabel} maxLength={200} onChange={(e) => setClaimLabel(e.target.value)} />
          </label>
        </div>
        <button type="button" className={`${PRIMARY} mt-4`} disabled={busy || !index.ready} onClick={() => void submit()} data-testid="admin-evidence-submit">
          {busy ? progress ?? "Готовим…" : "Проверить запись"}
        </button>
        {!index.ready ? <p className="mt-2 text-xs text-[#796ba0]">Проверка станет доступна после сборки индекса.</p> : null}
        {message ? <p className="mt-3 text-sm text-[#25135c]" role="status">{message}</p> : null}
      </div>

      <div className="rounded-[22px] border border-[#e7def6] bg-white p-5">
        <h3 className="text-base font-semibold text-[#25135c]">Проверенные записи</h3>
        {jobs.length === 0 ? (
          <p className="mt-2 text-sm text-[#796ba0]">Проверок пока нет.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#efe8fa]">
            {jobs.map((j) => (
              <li key={j.id} className="py-2">
                <Link className="text-sm font-medium text-[#25135c] underline" href={`/admin/business-evidence/jobs/${j.id}`}>{j.name}</Link>
                <p className="text-xs text-[#796ba0]">{j.created} · {j.state}{j.place ? ` · ${j.place}` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
