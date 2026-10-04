import type { ClassicaActionState } from "@/lib/classica/production/action-state";

export const CLASSICA_CARD_SAVE_IDLE_LABEL = "Сохранить карточку";
export const CLASSICA_CARD_SAVE_PENDING_LABEL = "Сохраняю…";
export const CLASSICA_CARD_SAVE_SUCCESS_LABEL = "✓ Сохранено";
/** How long the green saved label stays before the button returns to idle. */
export const CLASSICA_CARD_SAVE_SUCCESS_MS = 2500;

const buttonClass = "w-fit rounded-xl px-4 py-2 text-sm font-semibold text-white";

export const CLASSICA_CARD_SAVE_IDLE_CLASS = `${buttonClass} bg-[#7042c5]`;
export const CLASSICA_CARD_SAVE_PENDING_CLASS = `${buttonClass} bg-[#7042c5] disabled:cursor-not-allowed disabled:opacity-70`;
export const CLASSICA_CARD_SAVE_SUCCESS_CLASS = `${buttonClass} bg-[#2f7d4a]`;

export type ClassicaCardSavePhase = "idle" | "pending" | "success";

export type ClassicaCardSaveButtonView = {
  label: string;
  disabled: boolean;
  className: string;
};

export function classicaCardSavedState(): ClassicaActionState {
  return {
    error: null,
    ok: true,
    message: CLASSICA_CARD_SAVE_SUCCESS_LABEL,
  };
}

export function isClassicaCardSaveSuccess(state: ClassicaActionState): boolean {
  return state.ok === true && state.error == null;
}

export function classicaCardSavePhase(input: {
  pending: boolean;
  succeeded: boolean;
  successDismissed: boolean;
}): ClassicaCardSavePhase {
  if (input.pending) {
    return "pending";
  }
  if (input.succeeded && !input.successDismissed) {
    return "success";
  }
  return "idle";
}

export function classicaCardSaveButtonView(phase: ClassicaCardSavePhase): ClassicaCardSaveButtonView {
  if (phase === "pending") {
    return {
      label: CLASSICA_CARD_SAVE_PENDING_LABEL,
      disabled: true,
      className: CLASSICA_CARD_SAVE_PENDING_CLASS,
    };
  }
  if (phase === "success") {
    return {
      label: CLASSICA_CARD_SAVE_SUCCESS_LABEL,
      disabled: false,
      className: CLASSICA_CARD_SAVE_SUCCESS_CLASS,
    };
  }
  return {
    label: CLASSICA_CARD_SAVE_IDLE_LABEL,
    disabled: false,
    className: CLASSICA_CARD_SAVE_IDLE_CLASS,
  };
}
