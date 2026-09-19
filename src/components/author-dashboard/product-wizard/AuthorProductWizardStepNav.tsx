"use client";

type AuthorProductWizardStepNavProps = {
  showBack: boolean;
  showContinue: boolean;
  busy: boolean;
  canSave: boolean;
  onBack: () => void;
  onSave: () => void;
  onSaveAndContinue: () => void;
};

export default function AuthorProductWizardStepNav({
  showBack,
  showContinue,
  busy,
  canSave,
  onBack,
  onSave,
  onSaveAndContinue,
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
          Сохранить и продолжить
        </button>
      ) : null}
    </div>
  );
}
