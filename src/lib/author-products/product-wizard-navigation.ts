/**
 * Presentation helpers for the Aurafon product wizard URL/step navigation.
 * Does not own save/upload/publish logic.
 */

import {
  PRODUCT_WIZARD_DEFAULT_STEP,
  PRODUCT_WIZARD_STEP_COUNT,
  type ProductWizardStep,
  parseProductWizardStep,
} from "@/lib/author-products/product-wizard-steps";

export function shouldShowProductWizardStep(options: {
  wizardEnabled: boolean;
  activeStep: ProductWizardStep;
  step: ProductWizardStep;
}): boolean {
  if (!options.wizardEnabled) {
    return true;
  }
  return options.activeStep === options.step;
}

export function readProductWizardStepFromSearch(
  search: string | null | undefined,
): ProductWizardStep {
  const params = new URLSearchParams(search ?? "");
  return parseProductWizardStep(params.get("step"));
}

/**
 * Build a product edit path, optionally setting `step` while preserving
 * other query params from `preserveSearch` (e.g. `author`, `class`).
 */
export function buildAuthorProductEditPath(
  practiceId: string,
  options?: {
    step?: ProductWizardStep | null;
    preserveSearch?: string | null;
    includeStep?: boolean;
  },
): string {
  const params = new URLSearchParams(options?.preserveSearch ?? "");
  if (options?.includeStep && options.step != null) {
    params.set("step", String(options.step));
  }
  const qs = params.toString();
  return `/author-dashboard/products/${practiceId}${qs ? `?${qs}` : ""}`;
}

export function buildWizardStepHref(
  pathname: string,
  search: string,
  step: ProductWizardStep,
): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.set("step", String(step));
  const qs = params.toString();
  return `${pathname}${qs ? `?${qs}` : ""}`;
}

export function nextProductWizardStep(
  step: ProductWizardStep,
): ProductWizardStep | null {
  if (step >= PRODUCT_WIZARD_STEP_COUNT) {
    return null;
  }
  return (step + 1) as ProductWizardStep;
}

export function previousProductWizardStep(
  step: ProductWizardStep,
): ProductWizardStep | null {
  if (step <= PRODUCT_WIZARD_DEFAULT_STEP) {
    return null;
  }
  return (step - 1) as ProductWizardStep;
}
