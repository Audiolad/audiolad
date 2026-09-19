"use client";

import {
  PRODUCT_WIZARD_STEPS,
  type ProductWizardStep,
} from "@/lib/author-products/product-wizard-steps";

type AuthorProductWizardStepperProps = {
  activeStep: ProductWizardStep;
  onSelectStep: (step: ProductWizardStep) => void;
  canJumpToStep: (step: ProductWizardStep) => boolean;
};

export default function AuthorProductWizardStepper({
  activeStep,
  onSelectStep,
  canJumpToStep,
}: AuthorProductWizardStepperProps) {
  return (
    <nav
      aria-label="Шаги создания продукта"
      className="rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5"
    >
      <ol className="grid gap-2 sm:grid-cols-4">
        {PRODUCT_WIZARD_STEPS.map((item) => {
          const isActive = item.step === activeStep;
          const canJump = canJumpToStep(item.step);
          return (
            <li key={item.step}>
              <button
                type="button"
                disabled={!canJump && !isActive}
                aria-current={isActive ? "step" : undefined}
                onClick={() => {
                  if (canJump && !isActive) {
                    onSelectStep(item.step);
                  }
                }}
                className={`flex w-full items-start gap-2 rounded-[18px] border px-3 py-3 text-left transition ${
                  isActive
                    ? "border-[#9a74d8] bg-[#f8f4ff]"
                    : canJump
                      ? "border-[#e4d7f4] bg-white hover:border-[#c6afe6]"
                      : "cursor-not-allowed border-[#eee6f7] bg-[#fbf8ff] opacity-60"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    isActive
                      ? "bg-[#7042c5] text-white"
                      : "bg-[#eadff8] text-[#7042c5]"
                  }`}
                >
                  {item.step}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#3f3560]">
                    {item.label}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
