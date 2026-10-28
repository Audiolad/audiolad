"use client";

import { useEffect, useState } from "react";

import {
  type CafeDaypart,
  type CafeDaypartHours,
} from "@/lib/business-app/cafe-queue/prefs";

const ROWS: readonly { id: CafeDaypart; label: string }[] = [
  { id: "morning", label: "Утро" },
  { id: "day", label: "День" },
  { id: "evening", label: "Вечер" },
];

/** Boundaries «Авто» uses. Saved on this device for the current venue. */
export default function CafeDaypartHoursForm({
  hours,
  onSave,
}: {
  hours: CafeDaypartHours;
  onSave: (next: CafeDaypartHours) => string | null;
}) {
  const [draft, setDraft] = useState(hours);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved windows arrive after hydration
    setDraft(hours);
  }, [hours]);

  const setPart = (id: CafeDaypart, edge: "start" | "end", value: string) => {
    setSaved(false);
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], [edge]: value } }));
  };

  return (
    <form
      className="cafe-hours"
      id="dayparts"
      data-testid="biz-daypart-hours"
      onSubmit={(event) => {
        event.preventDefault();
        const message = onSave(draft);
        setError(message);
        setSaved(message === null);
      }}
    >
      <h2 className="text-[1.15rem] font-bold text-[var(--biz-text)]">Часы суток</h2>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        «Авто» на плеере переключает утро, день и вечер по этим границам. Вне трёх интервалов остаётся вечер – так ночь звучала и раньше.
      </p>
      <div className="cafe-hours__grid">
        {ROWS.map((row) => (
          <div className="cafe-hours__row" key={row.id}>
            <strong>{row.label}</strong>
            <label>
              <span className="cafe-hours__edge">С</span>
              <input
                className="business-app-input"
                type="time"
                required
                value={draft[row.id].start}
                aria-label={`${row.label}, начало`}
                data-testid={`biz-daypart-${row.id}-start`}
                onChange={(event) => setPart(row.id, "start", event.target.value)}
              />
            </label>
            <label>
              <span className="cafe-hours__edge">До</span>
              <input
                className="business-app-input"
                type="time"
                required
                value={draft[row.id].end}
                aria-label={`${row.label}, конец`}
                data-testid={`biz-daypart-${row.id}-end`}
                onChange={(event) => setPart(row.id, "end", event.target.value)}
              />
            </label>
          </div>
        ))}
      </div>
      {error ? <p className="business-app-alert" data-tone="warn" role="alert" data-testid="biz-daypart-error">{error}</p> : null}
      {saved ? <p className="text-sm text-[var(--biz-text-muted)]" data-testid="biz-daypart-saved">Границы сохранены для этой точки.</p> : null}
      <button type="submit" className="business-app-btn business-app-btn-primary business-app-focus-ring" data-testid="biz-daypart-save">
        Сохранить часы
      </button>
    </form>
  );
}
