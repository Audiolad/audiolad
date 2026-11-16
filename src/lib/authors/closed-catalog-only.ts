/**
 * t1505u / t1506u: per-author flag for publishing only to the closed Business catalog
 * from the author cabinet. Never inferred from name, slug, or UUID.
 */
import {
  PRODUCT_WIZARD_STEPS,
  parseProductWizardStep,
  type ProductWizardStep,
  type ProductWizardStepMeta,
} from '@/lib/author-products/product-wizard-steps';

export const CLOSED_CATALOG_ONLY_COLUMN = 'closed_catalog_only' as const;

export const CREATE_CLOSED_ALBUM_CABINET_ROUTE = '/api/author/closed-albums';
export const CLOSED_CATALOG_ONLY_TOGGLE_ROUTE = '/api/admin/business-catalog/closed-catalog-only';

export const CLOSED_CATALOG_ONLY_TOGGLE_TITLE = 'Публикация из кабинета автора';
export const CLOSED_CATALOG_ONLY_TOGGLE_LABEL = 'Можно публиковать закрытые альбомы из кабинета автора';
export const CLOSED_CATALOG_ONLY_TOGGLE_HINT =
  'Если включено, в кабинете этого автора можно сразу создавать альбомы только для закрытого каталога Бизнеса, без перехода в админку. Поля открытого каталога – описание, SEO и шаг «Описание и продвижение» – скрыты. Другие авторы не меняются.';

export const CREATE_CLOSED_ALBUM_CABINET_TITLE = 'Новый закрытый альбом';
export const CREATE_CLOSED_ALBUM_CABINET_BUTTON = 'Создать закрытый альбом';
export const CREATE_CLOSED_ALBUM_CABINET_HINT =
  'Альбом сразу создаётся только для закрытого каталога Бизнеса. Нужны название, обложка и треки. Описание, поисковые поля и шаг продвижения здесь не нужны.';

export const CLOSED_CATALOG_ONLY_CREATE_BLOCKED =
  'Этот автор публикует только закрытые альбомы Бизнеса. Создайте альбом кнопкой «Создать закрытый альбом».';

export const CLOSED_CATALOG_ONLY_AUTHOR_ACCESS_ERROR = 'Нет доступа к этому автору.';

export function isClosedCatalogOnlyAuthor(
  flag: boolean | null | undefined,
): boolean {
  return flag === true;
}

export type ClosedCatalogFlagRead = {
  error?: { message?: string } | null;
  data?: { closed_catalog_only?: boolean | null } | null;
};

/** Fail closed when the flag cannot be read: do not create an open-catalog draft. */
export function closedCatalogCreateDecision(
  read: ClosedCatalogFlagRead,
): 'allow' | 'blocked' | 'unavailable' {
  if (read.error) return 'unavailable';
  if (isClosedCatalogOnlyAuthor(read.data?.closed_catalog_only)) return 'blocked';
  return 'allow';
}

/** Closed-catalog-only albums use steps 1 (title) and 2 (cover and tracks). Step 3 is dropped. */
export const CLOSED_CATALOG_ONLY_WIZARD_STEPS: readonly ProductWizardStepMeta[] = [
  PRODUCT_WIZARD_STEPS[0],
  PRODUCT_WIZARD_STEPS[1],
];

export function visibleProductWizardSteps(closedCatalogOnly: boolean | null | undefined): readonly ProductWizardStepMeta[] {
  return isClosedCatalogOnlyAuthor(closedCatalogOnly)
    ? CLOSED_CATALOG_ONLY_WIZARD_STEPS
    : PRODUCT_WIZARD_STEPS;
}

export function lastVisibleProductWizardStep(closedCatalogOnly: boolean | null | undefined): ProductWizardStep {
  const steps = visibleProductWizardSteps(closedCatalogOnly);
  return steps[steps.length - 1].step;
}

export function isVisibleProductWizardStep(
  step: ProductWizardStep,
  closedCatalogOnly: boolean | null | undefined,
): boolean {
  return visibleProductWizardSteps(closedCatalogOnly).some((item) => item.step === step);
}

export function clampProductWizardStep(
  value: string | number | null | undefined,
  closedCatalogOnly: boolean | null | undefined,
): ProductWizardStep {
  const step = parseProductWizardStep(value);
  if (isVisibleProductWizardStep(step, closedCatalogOnly)) return step;
  return lastVisibleProductWizardStep(closedCatalogOnly) < step
    ? lastVisibleProductWizardStep(closedCatalogOnly)
    : 1;
}

export function nextVisibleProductWizardStep(
  step: ProductWizardStep,
  closedCatalogOnly: boolean | null | undefined,
): ProductWizardStep | null {
  const steps = visibleProductWizardSteps(closedCatalogOnly);
  const index = steps.findIndex((item) => item.step === step);
  if (index < 0 || index >= steps.length - 1) return null;
  return steps[index + 1].step;
}

export function previousVisibleProductWizardStep(
  step: ProductWizardStep,
  closedCatalogOnly: boolean | null | undefined,
): ProductWizardStep | null {
  const steps = visibleProductWizardSteps(closedCatalogOnly);
  const index = steps.findIndex((item) => item.step === step);
  if (index <= 0) return null;
  return steps[index - 1].step;
}

export function shouldHideOpenCatalogAlbumFields(
  closedCatalogOnly: boolean | null | undefined,
): boolean {
  return isClosedCatalogOnlyAuthor(closedCatalogOnly);
}
