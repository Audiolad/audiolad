"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createPlayLogExtractAction } from "@/app/(platform)/admin/business-evidence/actions";
import { EXTRACT_ERROR_TEXT } from "@/lib/evidence/constants";

const PRIMARY = "inline-flex min-h-11 items-center justify-center rounded-full bg-[#25135c] px-5 text-sm font-semibold text-white disabled:opacity-60";
const OUTLINE_SM = "inline-flex min-h-8 items-center justify-center rounded-full border border-[#d9cdef] bg-white px-3 text-xs font-medium text-[#25135c]";
const INPUT = "min-h-11 rounded-xl border border-[#d9cdef] bg-white px-3 text-sm text-[#25135c]";

export type EvidenceLocationOption = { id: string; label: string; timezone: string };
export type EvidenceExtractRow = {
  id: string;
  created: string;
  place: string;
  period: string;
  facts: number;
  plays: number;
  manifestSha256: string;
  files: string[];
};

const FILE_LABEL: Record<string, string> = {
  "extract.pdf": "PDF",
  "plays.csv": "Воспроизведения CSV",
  "facts.csv": "Отметки CSV",
  "manifest.json": "manifest.json",
  "manifest.sig": "Печать",
  "seal-public.pem": "Ключ печати",
  "VERIFY.txt": "Как проверить",
};

function fileHref(id: string, file: string) {
  return `/api/admin/business-evidence/extract?id=${encodeURIComponent(id)}&file=${encodeURIComponent(file)}`;
}

export default function BusinessEvidenceExtractPanel({
  locations,
  extracts,
  defaultFrom,
  defaultTo,
}: {
  locations: EvidenceLocationOption[];
  extracts: EvidenceExtractRow[];
  defaultFrom: string;
  defaultTo: string;
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [fromLocal, setFrom] = useState(defaultFrom);
  const [toLocal, setTo] = useState(defaultTo);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tz = locations.find((l) => l.id === locationId)?.timezone ?? "";

  const submit = () => {
    setMessage(null);
    start(async () => {
      const res = await createPlayLogExtractAction({ locationId, fromLocal, toLocal });
      if (res.ok) {
        setMessage(`Выписка готова: ${res.plays} воспроизведений, ${res.facts} отметок.${res.pdf ? "" : " PDF не собран – есть CSV и печать."}`);
        router.refresh();
      } else {
        setMessage(EXTRACT_ERROR_TEXT[res.error] ?? "Не удалось сформировать выписку.");
      }
    });
  };

  return (
    <div className="space-y-6" data-testid="admin-evidence-extract">
      <div className="rounded-[22px] border border-[#e7def6] bg-white p-5">
        <h3 className="text-base font-semibold text-[#25135c]">Выписка из журнала воспроизведения</h3>
        <p className="mt-1 text-sm text-[#796ba0]">
          Полная выписка отметок плеера зала за период: CSV, PDF, хеши SHA-256 и техническая печать сервиса.
          Время – по часовому поясу точки{tz ? ` (${tz})` : ""}.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
          <label className="grid gap-1 text-xs text-[#796ba0]">
            Точка
            <select className={INPUT} value={locationId} onChange={(e) => setLocationId(e.target.value)} data-testid="admin-evidence-location">
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-[#796ba0]">
            С
            <input type="datetime-local" className={INPUT} value={fromLocal} onChange={(e) => setFrom(e.target.value)} data-testid="admin-evidence-from" />
          </label>
          <label className="grid gap-1 text-xs text-[#796ba0]">
            По
            <input type="datetime-local" className={INPUT} value={toLocal} onChange={(e) => setTo(e.target.value)} data-testid="admin-evidence-to" />
          </label>
          <button type="button" className={PRIMARY} disabled={pending || !locationId} onClick={submit} data-testid="admin-evidence-create">
            {pending ? "Формируем…" : "Сформировать выписку"}
          </button>
        </div>
        {message ? <p className="mt-3 text-sm text-[#25135c]" role="status">{message}</p> : null}
      </div>

      <div className="rounded-[22px] border border-[#e7def6] bg-white p-5">
        <h3 className="text-base font-semibold text-[#25135c]">Готовые выписки</h3>
        {extracts.length === 0 ? (
          <p className="mt-2 text-sm text-[#796ba0]">Выписок пока нет.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#efe8fa]">
            {extracts.map((x) => (
              <li key={x.id} className="py-3" data-testid="admin-evidence-extract-row">
                <p className="text-sm font-medium text-[#25135c]">{x.place}</p>
                <p className="text-xs text-[#796ba0]">
                  {x.period} · {x.plays} воспроизведений · {x.facts} отметок · сформирована {x.created}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-[#796ba0]">SHA-256 manifest.json: {x.manifestSha256}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {x.files.map((f) => (
                    <a key={f} className={OUTLINE_SM} href={fileHref(x.id, f)}>{FILE_LABEL[f] ?? f}</a>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
