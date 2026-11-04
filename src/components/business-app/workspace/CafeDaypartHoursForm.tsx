"use client";

import { useEffect, useRef, useState } from "react";

import {
  type CafeDaypart,
  type CafeDaypartHours,
} from "@/lib/business-app/cafe-queue/prefs";

const ROWS: readonly { id: CafeDaypart; label: string }[] = [
  { id: "morning", label: "Утро" },
  { id: "day", label: "День" },
  { id: "evening", label: "Вечер" },
];

/** How long «Часы сохранены» stays on the button after a successful save. */
export const DAYPART_HOURS_SAVED_MS = 3000;
export const DAYPART_HOURS_SAVE_LABEL = "Сохранить часы";
export const DAYPART_HOURS_SAVED_LABEL = "✓ Часы сохранены";

/**
 * What `onSave` resolves to: `null` saved, a string is the error to show,
 * `false` the owner cancelled the confirm (nothing saved, no feedback).
 */
export type DaypartHoursSaveResult = string | null | false;

/** Boundaries «Авто» uses. Saved for the current venue. */
export default function CafeDaypartHoursForm({
  hours,
  onSave,
}: {
  hours: CafeDaypartHours;
  onSave: (next: CafeDaypartHours) => DaypartHoursSaveResult | Promise<DaypartHoursSaveResult>;
}) {
  const [draft, setDraft] = useState(hours);
  const [error, setError] = useState<string | null>(null);
  /** «Часы сохранены» on the button for DAYPART_HOURS_SAVED_MS after a successful save. */
  const [saved, setSaved] = useState(false);
  /** Only the latest press shows its outcome (an earlier one may resolve later). */
  const submitSeq = useRef(0);
  const savedTimer = useRef<number | null>(null);
  const mounted = useRef(true);
  const clearSavedTimer = () => {
    if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
    savedTimer.current = null;
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
    };
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved windows arrive after hydration
    setDraft(hours);
  }, [hours]);

  const setPart = (id: CafeDaypart, edge: "start" | "end", value: string) => {
    clearSavedTimer();
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
        const seq = ++submitSeq.current;
        clearSavedTimer();
        setSaved(false);
        void Promise.resolve(onSave(draft))
          .catch(() => "Не удалось сохранить часы. Попробуйте ещё раз.")
          .then((result) => {
            if (!mounted.current || seq !== submitSeq.current) return;
            if (result === false) return;
            setError(result);
            if (result !== null) return;
            setSaved(true);
            savedTimer.current = window.setTimeout(() => {
              savedTimer.current = null;
              setSaved(false);
            }, DAYPART_HOURS_SAVED_MS);
          });
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
      <button
        type="submit"
        className={`business-app-btn ${saved ? "business-app-btn-cta" : "business-app-btn-primary"} business-app-focus-ring`}
        data-state={saved ? "saved" : "idle"}
        data-testid="biz-daypart-save"
      >
        <span aria-live="polite">{saved ? DAYPART_HOURS_SAVED_LABEL : DAYPART_HOURS_SAVE_LABEL}</span>
      </button>
    </form>
  );
}
