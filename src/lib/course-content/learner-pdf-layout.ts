export const COURSE_LEARNER_PDF_LOADING_LABEL = "Загружаем документ…";
export const COURSE_LEARNER_PDF_ERROR_LABEL =
  "Не удалось открыть документ. Попробуйте ещё раз.";
export const COURSE_LEARNER_PDF_PAGE_ERROR_LABEL = "Не удалось показать страницу";
export const COURSE_LEARNER_PDF_RETRY_LABEL = "Повторить";

export const COURSE_LEARNER_PDF_RENDER_WINDOW = 2;

/**
 * Listener mobile body cap in `ListenerAppShell` (`max-w-[430px]` below `lg`).
 * Do not change that global default for the whole site — PDF pages break out
 * of it with CSS full-bleed instead.
 */
export const COURSE_LEARNER_LISTENER_SHELL_MOBILE_MAX_WIDTH_PX = 430;

/** File viewer desktop cap (`max-w-5xl`). PDF must not stretch across a monitor. */
export const COURSE_LEARNER_FILE_VIEWER_DESKTOP_MAX_WIDTH_PX = 1024;

/**
 * Mobile-only breakout from the constrained listener column and practice
 * `px-5`. Uses viewport units + centering calc so any phone width works.
 */
export const COURSE_LEARNER_PDF_MOBILE_FULL_BLEED_CLASS =
  "max-lg:ml-[calc(50%-50vw)] max-lg:mr-[calc(50%-50vw)] max-lg:w-[100vw] max-lg:max-w-[100vw]";

/**
 * Allow the PDF stack to escape the section on mobile. Keep clip on `lg+`
 * so desktop max-width UX is unchanged.
 */
export const COURSE_LEARNER_FILE_VIEWER_OVERFLOW_CLASS =
  "overflow-x-visible lg:overflow-x-clip";

export type PdfPageSize = {
  width: number;
  height: number;
};

export type PdfPageCssSize = {
  cssWidth: number;
  cssHeight: number;
  scale: number;
  canvasWidth: number;
  canvasHeight: number;
};

function asPositiveNumber(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Fit one PDF page to the available container width. CSS size stays
 * viewport-constrained; the canvas backing store uses devicePixelRatio.
 */
export function computePdfPageCssSize(input: {
  containerWidth: number;
  pageWidth: number;
  pageHeight: number;
  devicePixelRatio?: number;
}): PdfPageCssSize {
  const containerWidth = asPositiveNumber(input.containerWidth);
  const pageWidth = asPositiveNumber(input.pageWidth);
  const pageHeight = asPositiveNumber(input.pageHeight);
  const dpr = asPositiveNumber(input.devicePixelRatio ?? 1) || 1;

  if (containerWidth <= 0 || pageWidth <= 0 || pageHeight <= 0) {
    return {
      cssWidth: 0,
      cssHeight: 0,
      scale: 0,
      canvasWidth: 0,
      canvasHeight: 0,
    };
  }

  const scale = containerWidth / pageWidth;
  const cssWidth = containerWidth;
  const cssHeight = pageHeight * scale;

  return {
    cssWidth,
    cssHeight,
    scale,
    canvasWidth: Math.max(1, Math.round(cssWidth * dpr)),
    canvasHeight: Math.max(1, Math.round(cssHeight * dpr)),
  };
}

export function pageWrapperFitsContainer(
  cssWidth: number,
  containerWidth: number,
): boolean {
  if (containerWidth <= 0) {
    return cssWidth <= 0;
  }

  return cssWidth <= containerWidth + 0.5;
}

export function documentHasHorizontalOverflow(input: {
  containerWidth: number;
  pageCssWidths: readonly number[];
}): boolean {
  return input.pageCssWidths.some(
    (width) => !pageWrapperFitsContainer(width, input.containerWidth),
  );
}

export function listenerShellMobileContentWidth(viewportWidth: number): number {
  const viewport = asPositiveNumber(viewportWidth);
  return Math.min(viewport, COURSE_LEARNER_LISTENER_SHELL_MOBILE_MAX_WIDTH_PX);
}

/** CSS `100vw` breakout: the PDF body occupies the viewport, not the 430px shell. */
export function mobilePdfFullBleedWidth(viewportWidth: number): number {
  return asPositiveNumber(viewportWidth);
}

export function isMobilePdfBodyFullBleed(input: {
  viewportWidth: number;
  pdfBodyWidth: number;
}): boolean {
  return (
    Math.abs(
      asPositiveNumber(input.pdfBodyWidth) -
        mobilePdfFullBleedWidth(input.viewportWidth),
    ) <= 0.5
  );
}

/**
 * Viewport window for lazy canvas rendering. A 10–30 page PDF should
 * only paint pages near the visible one.
 */
export function selectPdfPagesToRender(input: {
  pageCount: number;
  visiblePage: number;
  windowSize?: number;
}): number[] {
  const pageCount = Math.max(0, Math.floor(input.pageCount));
  if (pageCount <= 0) {
    return [];
  }

  const windowSize =
    input.windowSize == null
      ? COURSE_LEARNER_PDF_RENDER_WINDOW
      : Math.max(0, Math.floor(input.windowSize));
  const visible = Math.min(pageCount, Math.max(1, Math.floor(input.visiblePage)));
  const start = Math.max(1, visible - windowSize);
  const end = Math.min(pageCount, visible + windowSize);
  const pages: number[] = [];

  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }

  return pages;
}

/**
 * Pages whose heavy canvas backing store may be released. Placeholders
 * stay in the DOM; only bitmaps outside the resident window are freed.
 */
export function listPdfPagesToRelease(input: {
  pageCount: number;
  residentPages: readonly number[];
}): number[] {
  const pageCount = Math.max(0, Math.floor(input.pageCount));
  const keep = new Set(input.residentPages);
  const released: number[] = [];

  for (let page = 1; page <= pageCount; page += 1) {
    if (!keep.has(page)) {
      released.push(page);
    }
  }

  return released;
}

export function isPdfPageEligibleForRender(input: {
  pageNumber: number;
  residentPages: readonly number[];
  renderedPages: Iterable<number>;
}): boolean {
  if (!input.residentPages.includes(input.pageNumber)) {
    return false;
  }

  const rendered =
    input.renderedPages instanceof Set
      ? input.renderedPages
      : new Set(input.renderedPages);
  return !rendered.has(input.pageNumber);
}

export function formatPdfPageLabel(pageNumber: number, pageCount: number): string {
  return `Страница ${pageNumber} из ${pageCount}`;
}

export function formatPdfPageErrorLabel(pageNumber: number): string {
  return `${COURSE_LEARNER_PDF_PAGE_ERROR_LABEL} ${pageNumber}.`;
}
