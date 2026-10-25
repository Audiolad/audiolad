"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FeatureSet } from "@/lib/music-analyzer-runs/features.mjs";

const FIELDS: Record<string, string> = {
  energy_0_100: "Энергия 0–100 (предварительная оценка, шкала калибруется)", rhythm_salience: "Ритмическая активность 0–1",
  perceived_speed: "Скорость: slow / moderate / fast / unknown",
  vocal_role: "Вокал: instrumental / vocal / mixed / spoken / unknown",
  genre: "Жанры", subgenre: "Поджанры", mood: "Настроения", instruments: "Инструменты",
};

export function FeatureControls({ runId, hasFeatures, onChange }: {
  runId: string; hasFeatures: boolean; onChange: (features: FeatureSet) => void;
}) {
  const [field, setField] = useState("energy_0_100");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [newRun, setNewRun] = useState<string | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  // Идемпотентный повтор при потере HTTP-ответа.
  const [requestId, setRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasFeatures) return;
    let active = true;
    void fetch(`/api/music-analyzer/runs/${runId}/features`).then(async response => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then(data => {
      if (!active) return;
      onChange(data.effective);
      setHistoryCount(data.history.length);
    }).catch(() => { if (active) setMessage("История поправок недоступна. Показан исходный автоматический результат."); });
    return () => { active = false; };
  }, [runId, hasFeatures, onChange]);

  async function save(reset: boolean) {
    setBusy(true); setMessage("");
    try {
      const parsed = reset ? null : ["genre", "subgenre", "mood", "instruments"].includes(field)
        ? value.split(",").map(v => v.trim()).filter(Boolean)
        : ["energy_0_100", "rhythm_salience"].includes(field) && value.trim() ? Number(value) : value;
      if (typeof parsed === "number" && !Number.isFinite(parsed)) throw new Error();
      const response = await fetch(`/api/music-analyzer/runs/${runId}/features`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patch: { [field]: parsed }, reason }),
      });
      if (!response.ok) throw new Error();
      const data = await response.json();
      onChange(data.effective); setHistoryCount(data.history.length);
      setMessage("Поправка сохранена. Исходный автоматический результат доступен в истории.");
    } catch { setMessage("Поправка не сохранена. Проверьте значение, причину и доступность истории."); }
    finally { setBusy(false); }
  }

  async function reanalyze() {
    setBusy(true); setMessage("");
    const id = requestId ?? crypto.randomUUID(); setRequestId(id);
    try {
      const response = await fetch("/api/music-analyzer/runs/reanalyze", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: id, runIds: [runId] }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok || !data.results?.[0]?.run?.id) throw new Error();
      setNewRun(data.results[0].run.id);
      setMessage("В очередь добавлен только этот файл. Создана новая версия.");
    } catch { setMessage("Не удалось подтвердить запуск. Повтор кнопки безопасно использует тот же запрос."); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-3 rounded-[22px] border border-[#e4d7f4] bg-white p-4 text-sm text-[#25135c]" aria-label="Проверка признаков">
      <button type="button" disabled={busy || newRun !== null} onClick={() => void reanalyze()} className="font-medium text-[#7042c5] disabled:opacity-50">Повторить анализ этого файла</button>
      {newRun ? <p><Link href={`/music-analyzer/runs/${newRun}`}>Открыть новый прогон</Link></p> : null}
      {hasFeatures ? <details>
        <summary className="cursor-pointer">Ручная проверка признаков · поправок: {historyCount}</summary>
        <form className="mt-3 grid gap-3" onSubmit={event => { event.preventDefault(); void save(false); }}>
          <label>Признак<select value={field} onChange={event => setField(event.target.value)} className="ml-2 rounded border p-2">{Object.entries(FIELDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Значение (списки через запятую)<input value={value} onChange={event => setValue(event.target.value)} className="ml-2 rounded border p-2" /></label>
          <label>Основание проверки<input required minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} className="ml-2 rounded border p-2" /></label>
          <div className="flex gap-4"><button disabled={busy} type="submit">Сохранить поправку</button><button disabled={busy || reason.trim().length < 3} type="button" onClick={() => void save(true)}>Вернуть автоматическое значение</button></div>
        </form>
        <a className="mt-3 block text-[#7042c5]" href={`/api/music-analyzer/runs/${runId}/features`} target="_blank" rel="noreferrer">Исходный результат и история проверок</a>
        <p className="mt-2 text-xs">Поправки относятся к этому прогону. Новый анализ сохраняет отдельную автоматику; старые поправки в него не переносятся.</p>
      </details> : <p>Для структурированных признаков старого прогона нужен выборочный повторный анализ.</p>}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
