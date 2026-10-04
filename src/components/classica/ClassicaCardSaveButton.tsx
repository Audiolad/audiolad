"use client";

import {
  classicaCardSaveButtonView,
  type ClassicaCardSavePhase,
} from "@/lib/classica/production/card-save-feedback";

export default function ClassicaCardSaveButton({ phase }: { phase: ClassicaCardSavePhase }) {
  const view = classicaCardSaveButtonView(phase);

  return (
    <button
      type="submit"
      disabled={view.disabled}
      className={view.className}
      data-save-phase={phase}
      aria-live="polite"
    >
      {view.label}
    </button>
  );
}
