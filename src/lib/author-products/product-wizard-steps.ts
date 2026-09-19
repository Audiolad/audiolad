/**
 * Domain contract for the future 4-step author product wizard.
 * Navigation will use `?step=1..4`. This module is foundation only —
 * it does not touch routes, forms, or save flows.
 */

export const PRODUCT_WIZARD_STEPS = [
  { step: 1, label: "Основное" },
  { step: 2, label: "Материалы" },
  { step: 3, label: "Описание и продвижение" },
  { step: 4, label: "Условия и публикация" },
] as const;

export type ProductWizardStep = (typeof PRODUCT_WIZARD_STEPS)[number]["step"];

export type ProductWizardStepMeta = (typeof PRODUCT_WIZARD_STEPS)[number];

export const PRODUCT_WIZARD_DEFAULT_STEP: ProductWizardStep = 1;

export const PRODUCT_WIZARD_STEP_COUNT = PRODUCT_WIZARD_STEPS.length;

export function getProductWizardStepLabel(step: ProductWizardStep): string {
  return PRODUCT_WIZARD_STEPS[step - 1].label;
}

/**
 * Normalize a URL/query `step` value to a valid wizard step.
 * Invalid, missing, or out-of-range values fall back to step 1.
 */
export function parseProductWizardStep(
  value: string | number | null | undefined,
): ProductWizardStep {
  if (value === null || value === undefined) {
    return PRODUCT_WIZARD_DEFAULT_STEP;
  }

  const raw =
    typeof value === "number" ? String(value) : String(value).trim();

  if (!raw) {
    return PRODUCT_WIZARD_DEFAULT_STEP;
  }

  if (!/^[1-4]$/.test(raw)) {
    return PRODUCT_WIZARD_DEFAULT_STEP;
  }

  return Number(raw) as ProductWizardStep;
}
