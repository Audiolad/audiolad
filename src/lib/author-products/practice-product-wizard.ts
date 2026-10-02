/**
 * 4-step practice product wizard for every author workspace.
 *
 * Practice is identified by the explicit publication class. We intentionally
 * do not use product_kind=practice alone because course and audiobook keep the
 * same legacy product kind.
 */
export function isPracticeProductWizardEnabled(input: {
  publicationClass?: string | null;
}): boolean {
  return input.publicationClass?.trim() === "practice";
}
