"use client";

type AuthorProductWizardStepNavProps = {
  showBack: boolean;
  showContinue: boolean;
  busy: boolean;
  canSave: boolean;
  continueLabel?: string;
  /** Jazz Relax preview only. Other authors omit this and keep one continue button. */
  secondaryContinueLabel?: string;
  onBack: () => void;
  onSave: () => void;
  onSaveAndContinue: () => void;
  onSecondaryContinue?: () => void;
};

export default function AuthorProductWizardStepNav({
  showBack,
  showContinue,
  busy,
  canSave,
  continueLabel = "Сохранить и продолжить",
  secondaryContinueLabel,
  onBack,
  onSave,
  onSaveAndContinue,
  onSecondaryContinue,
}: AuthorProductWizardStepNavProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {showBack ? (
        <button
          type="button"
          disabled={busy}
          onClick={onBack}
          className="rounded-[22px] border border-[#d9c9ef] px-5 py-4 font-semibold text-[#5f5484] disabled:opacity-60"
        >
          Назад
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy || !canSave}
        onClick={onSave}
        className="rounded-[22px] border border-[#c6afe6] px-5 py-4 font-semibold text-[#7042c5] disabled:opacity-60"
      >
        Сохранить
      </button>
      {showContinue ? (
        <button
          type="button"
          disabled={busy || !canSave}
          onClick={onSaveAndContinue}
          className="rounded-[22px] bg-[#7042c5] px-5 py-4 font-semibold text-white disabled:opacity-60"
        >
          {continueLabel}
        </button>
      ) : null}
      {showContinue && secondaryContinueLabel && onSecondaryContinue ? (
        <button
          type="button"
          disabled={busy || !canSave}
          onClick={onSecondaryContinue}
          className="rounded-[22px] border border-[#d9c9ef] px-5 py-4 font-semibold text-[#5f5484] disabled:opacity-60"
        >
          {secondaryContinueLabel}
        </button>
      ) : null}
    </div>
  );
}
