"use client";

import type { CafeDaypart, CafeDaypartMode, CafeQueueFeedbackKind } from "@/lib/business-app/cafe-queue/prefs";

function CircleIcon({ sign }: { sign: "plus" | "minus" }) {
  return (
    <svg className="cafe-queue__glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
      {sign === "plus" ? (
        <path d="M12 8v8M8 12h8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      ) : (
        <path d="M8 12h8" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      )}
    </svg>
  );
}

const DAYPARTS: readonly { id: CafeDaypart; label: string; hint: string }[] = [
  { id: "morning", label: "Утро", hint: "утро" },
  { id: "day", label: "День", hint: "день" },
  { id: "evening", label: "Вечер", hint: "вечер" },
];

function daypartHint(mode: CafeDaypartMode, effective: CafeDaypart | null): string {
  if (mode !== "auto") return "Выбрано вручную";
  const part = DAYPARTS.find((item) => item.id === effective);
  return part ? `Сейчас ${part.hint} – по часам` : "По часам устройства";
}

export default function CafeQueueControls({
  mode,
  effectiveDaypart,
  onDaypart,
  audioItemId = null,
  feedbackKind = null,
  onFeedback,
}: {
  mode: CafeDaypartMode;
  effectiveDaypart: CafeDaypart | null;
  onDaypart: (mode: CafeDaypartMode) => void;
  audioItemId?: string | null;
  feedbackKind?: CafeQueueFeedbackKind | null;
  onFeedback?: (kind: CafeQueueFeedbackKind) => void;
}) {
  return (
    <section className="cafe-queue" data-testid="biz-cafe-queue" aria-label="Очередь по времени суток">
      <fieldset className="cafe-queue__group">
        <legend className="cafe-queue__legend">Время суток</legend>
        <div className="cafe-queue__chips" data-testid="biz-cafe-daypart">
          <button
            type="button"
            className="cafe-queue__btn business-app-focus-ring"
            data-testid="biz-cafe-auto"
            aria-pressed={mode === "auto"}
            onClick={() => onDaypart("auto")}
          >
            Авто
          </button>
          {DAYPARTS.map((part) => (
            <button
              key={part.id}
              type="button"
              className="cafe-queue__btn business-app-focus-ring"
              data-testid={`biz-cafe-daypart-${part.id}`}
              aria-pressed={mode === part.id}
              onClick={() => onDaypart(part.id)}
            >
              {part.label}
            </button>
          ))}
        </div>
        <p className="cafe-queue__note" data-testid="biz-cafe-daypart-hint">{daypartHint(mode, effectiveDaypart)}</p>
      </fieldset>
      {audioItemId && onFeedback ? (
        <div className="cafe-queue__pair" data-testid="biz-cafe-feedback">
          <button
            type="button"
            className="cafe-queue__btn cafe-queue__choice business-app-focus-ring"
            data-testid="biz-cafe-more"
            aria-pressed={feedbackKind === "more"}
            onClick={() => onFeedback("more")}
          >
            <CircleIcon sign="plus" />
            <span>Больше такой музыки</span>
          </button>
          <button
            type="button"
            className="cafe-queue__btn cafe-queue__choice business-app-focus-ring"
            data-testid="biz-cafe-less"
            aria-pressed={feedbackKind === "less"}
            onClick={() => onFeedback("less")}
          >
            <CircleIcon sign="minus" />
            <span>Меньше такой музыки</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
