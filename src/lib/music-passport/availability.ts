/**
 * Music passport availability (author cabinet product wizard step 2).
 *
 * History: piloted for an author UUID allowlist (Jazz Relax 10.2026, Aurafon
 * 18.10.2026, «Чили на виниле» and «Кофейник» 25.10.2026).
 * 29.10.2026 (Sergey): the passport is on by default for every music product
 * of every author – «Сохранить и создать музыкальный паспорт» plus
 * «Продолжить без музыкального паспорта», so nobody is ever blocked.
 * Non-music product kinds stay untouched. Analysis is never auto-run for old
 * albums; the author starts it in the wizard.
 * The Analyzer itself is unchanged; Candidate A stays off.
 */
import { PRODUCT_KIND } from "@/lib/author-products/product-kind";

/** True for every music product, regardless of the author workspace. */
export function isMusicPassportAvailable(input: {
  productKind: string | null | undefined;
}): boolean {
  return input.productKind?.trim() === PRODUCT_KIND.MUSIC;
}
