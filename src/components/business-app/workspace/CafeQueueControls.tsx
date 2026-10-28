"use client";

import type { CafeDaypart, CafeDaypartMode, CafeEnergyOffset, CafeQueueFeedbackKind } from "@/lib/business-app/cafe-queue/prefs";

const DAYPARTS: readonly { id: CafeDaypart; label: string }[] = [
  { id: "morning", label: "Утро" },
  { id: "day", label: "День" },
  { id: "evening", label: "Вечер" },
];

export default function CafeQueueControls({
  mode,
  effectiveDaypart,
  energyOffset,
  onDaypart,
  onOffset,
  audioItemId = null,
  feedbackKind = null,
  onFeedback,
}: {
  mode: CafeDaypartMode;
  effectiveDaypart: CafeDaypart | null;
  energyOffset: CafeEnergyOffset;
  onDaypart: (mode: CafeDaypartMode) => void;
  onOffset: (offset: CafeEnergyOffset) => void;
  audioItemId?: string | null;
  feedbackKind?: CafeQueueFeedbackKind | null;
  onFeedback?: (kind: CafeQueueFeedbackKind) => void;
}) {
  return (
    <section className="cafe-queue" data-testid="biz-cafe-queue" aria-label="Очередь по времени суток">
      <fieldset className="cafe-queue__group">
        <legend className="cafe-queue__legend">Время суток</legend>
        <div className="cafe-queue__chips" data-testid="biz-cafe-daypart">
          {DAYPARTS.map((part) => {
            const pressed = effectiveDaypart === part.id;
            return (
              <button
                key={part.id}
                type="button"
                className="cafe-queue__btn business-app-focus-ring"
                data-testid={`biz-cafe-daypart-${part.id}`}
                aria-pressed={pressed}
                onClick={() => onDaypart(part.id)}
              >
                {part.label}
              </button>
            );
          })}
        </div>
        <div className="cafe-queue__note">
          {mode === "auto" ? "Сейчас по часам устройства." : "Выбрано вручную."}
          {" "}
          <button
            type="button"
            className="cafe-queue__link business-app-focus-ring"
            data-testid="biz-cafe-auto"
            aria-pressed={mode === "auto"}
            onClick={() => onDaypart("auto")}
          >
            По часам
          </button>
        </div>
      </fieldset>
      <div className="cafe-queue__pair">
        <button
          type="button"
          className="cafe-queue__btn business-app-focus-ring"
          data-testid="biz-cafe-calmer"
          aria-pressed={energyOffset === -15}
          onClick={() => onOffset(energyOffset === -15 ? 0 : -15)}
        >
          Спокойнее
        </button>
        <button
          type="button"
          className="cafe-queue__btn business-app-focus-ring"
          data-testid="biz-cafe-livelier"
          aria-pressed={energyOffset === 15}
          onClick={() => onOffset(energyOffset === 15 ? 0 : 15)}
        >
          Бодрее
        </button>
      </div>
      {audioItemId && onFeedback ? (
        <div className="cafe-queue__pair" data-testid="biz-cafe-feedback">
          <button
            type="button"
            className="cafe-queue__btn business-app-focus-ring"
            data-testid="biz-cafe-more"
            aria-pressed={feedbackKind === "more"}
            onClick={() => onFeedback("more")}
          >
            Больше таких
          </button>
          <button
            type="button"
            className="cafe-queue__btn business-app-focus-ring"
            data-testid="biz-cafe-less"
            aria-pressed={feedbackKind === "less"}
            onClick={() => onFeedback("less")}
          >
            Меньше таких
          </button>
        </div>
      ) : null}
    </section>
  );
}
