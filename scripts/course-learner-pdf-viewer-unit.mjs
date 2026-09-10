#!/usr/bin/env node
/**
 * Controlled multi-page PDF renderer: fixture parse, layout, auth HTTP
 * mode, no native iframe plugin.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  COURSE_LEARNER_FILE_VIEWER_BACK_LABEL,
  buildCourseLearnerFilePath,
  buildCourseLearnerFileReturnHref,
  resolveCourseLearnerFileHttpMode,
} from "../src/lib/course-content/learner-file-http.ts";
import {
  COURSE_LEARNER_PDF_HEADER_MOBILE_PADDING_CLASS,
  COURSE_LEARNER_PDF_LOADING_LABEL,
  COURSE_LEARNER_PDF_MOBILE_BREAKOUT_CLASS,
  COURSE_LEARNER_PDF_PAGE_MOBILE_FULL_BLEED_CLASS,
  COURSE_LEARNER_PRACTICE_MOBILE_GUTTER_PX,
  computePdfPageCssSize,
  documentHasHorizontalOverflow,
  formatPdfPageLabel,
  isMobilePdfBodyFullBleed,
  isPdfPageEligibleForRender,
  listPdfPagesToRelease,
  mobilePdfFullBleedWidth,
  pageWrapperFitsContainer,
  practiceLayoutPaddedContentWidth,
  selectPdfPagesToRender,
} from "../src/lib/course-content/learner-pdf-layout.ts";
import { buildPdfPageSlots } from "../src/lib/course-content/learner-pdf-document.ts";
import {
  PdfPageRenderTaskRegistry,
  beginPdfRenderGeneration,
  evictPdfPagesOutsideWindow,
  isPdfRenderCancelled,
  releasePdfPageCanvas,
  shouldShowPdfPageRenderError,
} from "../src/lib/course-content/learner-pdf-render-tasks.ts";
import { COURSE_LEARNER_CONTENTS_ANCHOR_ID } from "../src/lib/products/practice-access-ui.ts";
import CourseLearnerFileViewerModule, {
  buildCourseLearnerFileViewerViewModel,
} from "../src/components/products/course-learner/CourseLearnerFileViewer.tsx";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CourseLearnerFileViewer =
  CourseLearnerFileViewerModule.default ?? CourseLearnerFileViewerModule;

function read(relative) {
  return readFileSync(join(root, relative), "utf8");
}

function padOffset(value) {
  return String(value).padStart(10, "0");
}

function buildMinimalPdf(pageCount, pageWidth = 300, pageHeight = 400) {
  const objects = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");

  const kids = [];
  for (let page = 0; page < pageCount; page += 1) {
    kids.push(`${3 + page} 0 R`);
  }
  objects.push(
    `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pageCount} >>`,
  );

  for (let page = 0; page < pageCount; page += 1) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] >>`,
    );
  }

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(body.length);
    body += `${index + 1} 0 obj ${objects[index]} endobj\n`;
  }

  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${padOffset(offsets[index])} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

const FILE_ID = "55555555-5555-4555-8555-555555555555";
const AUTHOR_SLUG = "sergey-and-zoya";
const PRODUCT_SLUG = "kody-zhenskoy-prityagatelnosti";

const fixture = buildMinimalPdf(3);
assert.match(fixture.toString("latin1"), /^%PDF-1.4/);
assert.match(fixture.toString("latin1"), /\/Count 3/);

const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
const parsed = await getDocument({
  data: new Uint8Array(fixture),
  disableWorker: true,
  isEvalSupported: false,
  useSystemFonts: true,
}).promise;
assert.equal(parsed.numPages, 3, "3-page fixture must parse as three pages");

const pageSizes = [];
for (let pageNumber = 1; pageNumber <= parsed.numPages; pageNumber += 1) {
  const page = await parsed.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  pageSizes.push({ width: viewport.width, height: viewport.height });
}
await parsed.destroy();

assert.equal(pageSizes.length, 3);
assert.equal(pageSizes[0].width, 300);
assert.equal(pageSizes[0].height, 400);

const slots = buildPdfPageSlots({
  pageSizes,
  containerWidth: 390,
  devicePixelRatio: 2,
});
assert.deepEqual(
  slots.map((slot) => slot.pageNumber),
  [1, 2, 3],
);
for (const slot of slots) {
  assert.equal(slot.cssWidth, 390);
  assert.ok(pageWrapperFitsContainer(slot.cssWidth, 390));
}
assert.equal(
  documentHasHorizontalOverflow({
    containerWidth: 390,
    pageCssWidths: slots.map((slot) => slot.cssWidth),
  }),
  false,
);

const afterRotate = buildPdfPageSlots({
  pageSizes,
  containerWidth: 280,
  devicePixelRatio: 3,
});
assert.equal(afterRotate[0].cssWidth, 280);
assert.notEqual(afterRotate[0].scale, slots[0].scale);
assert.equal(afterRotate[0].canvasWidth, 840);

assert.deepEqual(selectPdfPagesToRender({ pageCount: 20, visiblePage: 1 }), [1, 2, 3]);
assert.deepEqual(selectPdfPagesToRender({ pageCount: 20, visiblePage: 10 }), [8, 9, 10, 11, 12]);
assert.equal(formatPdfPageLabel(1, 3), "Страница 1 из 3");

const sized = computePdfPageCssSize({
  containerWidth: 390,
  pageWidth: 300,
  pageHeight: 400,
  devicePixelRatio: 2,
});
assert.ok(sized.cssWidth <= 390);
assert.equal(sized.canvasWidth, 780);

const markup = renderToStaticMarkup(
  createElement(
    CourseLearnerFileViewer,
    buildCourseLearnerFileViewerViewModel({
      authorSlug: AUTHOR_SLUG,
      productSlug: PRODUCT_SLUG,
      fileId: FILE_ID,
      filename: "notes.pdf",
    }),
  ),
);
assert.match(markup, new RegExp(COURSE_LEARNER_FILE_VIEWER_BACK_LABEL));
assert.match(
  markup,
  new RegExp(
    `/practice/${AUTHOR_SLUG}/${PRODUCT_SLUG}#${COURSE_LEARNER_CONTENTS_ANCHOR_ID}`,
  ),
);
assert.match(markup, /data-course-learner-pdf-pages="true"/);
assert.match(markup, /data-course-learner-file-viewer-header="true"/);
assert.match(markup, new RegExp(COURSE_LEARNER_PDF_LOADING_LABEL));
assert.ok(
  markup.includes(COURSE_LEARNER_PDF_MOBILE_BREAKOUT_CLASS),
  "ready viewer section breaks out of practice px-5 on mobile",
);
assert.ok(
  markup.includes(COURSE_LEARNER_PDF_HEADER_MOBILE_PADDING_CLASS),
  "back link and title keep mobile side padding",
);
assert.doesNotMatch(markup, /<iframe/);
assert.doesNotMatch(markup, /view=FitH/);
assert.equal(
  buildCourseLearnerFileReturnHref(AUTHOR_SLUG, PRODUCT_SLUG),
  `/practice/${AUTHOR_SLUG}/${PRODUCT_SLUG}#${COURSE_LEARNER_CONTENTS_ANCHOR_ID}`,
);
assert.equal(
  buildCourseLearnerFilePath(AUTHOR_SLUG, PRODUCT_SLUG, FILE_ID),
  `/api/listen/product/${AUTHOR_SLUG}/${PRODUCT_SLUG}/file/${FILE_ID}`,
);

assert.equal(
  resolveCourseLearnerFileHttpMode(
    new Request("https://audiolad.ru/file", {
      headers: { accept: "application/pdf" },
    }),
  ),
  "embed",
);

const viewerSource = read(
  "src/components/products/course-learner/CourseLearnerFileViewer.tsx",
);
const pagesSource = read(
  "src/components/products/course-learner/CourseLearnerPdfPages.tsx",
);
const practiceLayoutSource = read(
  "src/app/(platform)/(listener)/practice/[...segments]/layout.tsx",
);
const route = read(
  "src/app/api/listen/product/[slug]/[productSlug]/file/[fileId]/route.ts",
);

assert.match(
  practiceLayoutSource,
  /listener-practice-content px-5 pb-6 pt-0 lg:px-10 xl:px-0 xl:pb-8 xl:pt-0/,
  "iPhone gutter source stays the practice-route px-5 wrapper",
);
assert.ok(
  viewerSource.includes(COURSE_LEARNER_PDF_MOBILE_BREAKOUT_CLASS),
  "ready viewer section uses the mobile full-bleed breakout literals",
);
assert.ok(
  viewerSource.includes(COURSE_LEARNER_PDF_HEADER_MOBILE_PADDING_CLASS),
  "header literals re-apply practice px-5 on mobile",
);
assert.match(viewerSource, /data-course-learner-file-viewer-header="true"/);
assert.doesNotMatch(
  viewerSource,
  /data-course-learner-file-viewer="denied"[\s\S]*max-sm:-mx-5/,
  "denied chrome must keep normal practice gutters",
);
assert.ok(
  pagesSource.includes(COURSE_LEARNER_PDF_PAGE_MOBILE_FULL_BLEED_CLASS),
  "PDF page wrappers drop side radius/border on mobile",
);

const iphoneViewport = 390;
const paddedContentWidth = practiceLayoutPaddedContentWidth({
  viewportWidth: iphoneViewport,
});
assert.equal(COURSE_LEARNER_PRACTICE_MOBILE_GUTTER_PX, 20);
assert.equal(paddedContentWidth, 350);
assert.equal(mobilePdfFullBleedWidth(iphoneViewport), iphoneViewport);
assert.equal(
  isMobilePdfBodyFullBleed({
    viewportWidth: iphoneViewport,
    pdfBodyWidth: paddedContentWidth,
  }),
  false,
  "practice px-5 gutters are the leftover ~10% width",
);
assert.equal(
  isMobilePdfBodyFullBleed({
    viewportWidth: iphoneViewport,
    pdfBodyWidth: iphoneViewport,
  }),
  true,
);

const fullBleedSlots = buildPdfPageSlots({
  pageSizes,
  containerWidth: iphoneViewport,
  devicePixelRatio: 2,
});
assert.equal(fullBleedSlots[0].cssWidth, iphoneViewport);
assert.equal(
  documentHasHorizontalOverflow({
    containerWidth: iphoneViewport,
    pageCssWidths: fullBleedSlots.map((slot) => slot.cssWidth),
  }),
  false,
  "full-bleed pages must not create horizontal overflow",
);
assert.doesNotMatch(viewerSource, /<iframe/);
assert.match(pagesSource, /getDocument/);
assert.match(pagesSource, /<canvas/);
assert.match(pagesSource, /COURSE_LEARNER_PDF_ERROR_LABEL/);
assert.match(pagesSource, /useMemo/);
assert.match(pagesSource, /PdfPageRenderTaskRegistry/);
assert.match(pagesSource, /beginPdfRenderGeneration/);
assert.match(pagesSource, /shouldShowPdfPageRenderError/);
assert.match(pagesSource, /cancelAll/);
assert.match(pagesSource, /clear\(pageNumber, task\)/);
assert.match(pagesSource, /evictPdfPagesOutsideWindow/);
assert.doesNotMatch(pagesSource, /<iframe/);
assert.match(route, /signLearnerPublicationFile/);
assert.match(route, /createInlinePdfProxyResponse/);
assert.doesNotMatch(route, /NextResponse\.redirect\(signed\.url/);

const registry = new PdfPageRenderTaskRegistry();
const renderedPages = new Set([1]);
let firstCancelled = false;
let firstStillRunning = true;
const firstTask = {
  cancel() {
    firstCancelled = true;
    firstStillRunning = false;
  },
  promise: new Promise(() => undefined),
};
registry.set(1, firstTask);
assert.equal(registry.has(1), true);

const nextGeneration = beginPdfRenderGeneration({
  generation: 1,
  renderedPages,
  registry,
});
assert.equal(nextGeneration, 2);
assert.equal(firstCancelled, true);
assert.equal(firstStillRunning, false);
assert.equal(registry.has(1), false);
assert.equal(renderedPages.size, 0);

const cancelledError = {
  name: "RenderingCancelledException",
  message: "Rendering cancelled, page 1",
};
assert.equal(isPdfRenderCancelled(cancelledError), true);
assert.equal(shouldShowPdfPageRenderError(cancelledError), false);
assert.equal(
  shouldShowPdfPageRenderError(new Error("canvas_context_missing")),
  true,
);

let secondRendered = false;
const secondTask = {
  cancel() {
    throw new Error("second_generation_must_not_cancel_itself");
  },
  promise: Promise.resolve().then(() => {
    secondRendered = true;
  }),
};
registry.set(1, secondTask);
await secondTask.promise;
assert.equal(registry.clear(1, secondTask), true);
assert.equal(secondRendered, true);
assert.equal(registry.size, 0);

const staleRegistry = new PdfPageRenderTaskRegistry();
let taskACancelled = false;
let taskBCancelled = false;
const taskA = {
  cancel() {
    taskACancelled = true;
  },
  promise: Promise.resolve(),
};
const taskB = {
  cancel() {
    taskBCancelled = true;
  },
  promise: new Promise(() => undefined),
};
staleRegistry.set(1, taskA);
assert.equal(staleRegistry.get(1), taskA);
staleRegistry.cancel(1);
assert.equal(taskACancelled, true);
staleRegistry.set(1, taskB);
assert.equal(staleRegistry.get(1), taskB);
assert.equal(staleRegistry.clear(1, taskA), false);
assert.equal(staleRegistry.get(1), taskB);
assert.equal(staleRegistry.has(1), true);
assert.equal(taskBCancelled, false);
assert.equal(staleRegistry.cancelAll(), 1);
assert.equal(taskBCancelled, true);
assert.equal(staleRegistry.has(1), false);

const portrait = buildPdfPageSlots({
  pageSizes,
  containerWidth: 390,
  devicePixelRatio: 3,
});
const landscape = buildPdfPageSlots({
  pageSizes,
  containerWidth: 844,
  devicePixelRatio: 3,
});
const portraitAgain = buildPdfPageSlots({
  pageSizes,
  containerWidth: 390,
  devicePixelRatio: 3,
});
assert.equal(portrait[0].cssWidth, 390);
assert.equal(landscape[0].cssWidth, 844);
assert.equal(portraitAgain[0].cssWidth, 390);
assert.equal(portraitAgain[0].scale, portrait[0].scale);
assert.ok(portraitAgain[0].scale > 0);
assert.ok(portraitAgain[0].canvasWidth > 0);
assert.equal(
  documentHasHorizontalOverflow({
    containerWidth: 390,
    pageCssWidths: portraitAgain.map((slot) => slot.cssWidth),
  }),
  false,
);

const longDocResident = selectPdfPagesToRender({
  pageCount: 30,
  visiblePage: 15,
});
assert.deepEqual(longDocResident, [13, 14, 15, 16, 17]);
assert.ok(longDocResident.length <= 5, "resident canvas window stays bounded");
assert.deepEqual(
  listPdfPagesToRelease({ pageCount: 30, residentPages: longDocResident }),
  [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 19, 20, 21, 22, 23, 24, 25, 26,
    27, 28, 29, 30,
  ],
);

const evictionRegistry = new PdfPageRenderTaskRegistry();
const evictionRendered = new Set([1, 2, 3, 13, 14, 15]);
const canvases = new Map();
for (let page = 1; page <= 30; page += 1) {
  canvases.set(page, {
    width: 1170,
    height: 1560,
    style: { width: "390px", height: "520px" },
  });
}
let evictedPageOneTaskCancelled = false;
evictionRegistry.set(1, {
  cancel() {
    evictedPageOneTaskCancelled = true;
  },
  promise: new Promise(() => undefined),
});

const evicted = evictPdfPagesOutsideWindow({
  pageCount: 30,
  residentPages: longDocResident,
  renderedPages: evictionRendered,
  registry: evictionRegistry,
  getCanvas: (pageNumber) => canvases.get(pageNumber) ?? null,
});
assert.ok(evicted.includes(1));
assert.equal(evictedPageOneTaskCancelled, true);
assert.equal(evictionRendered.has(1), false);
assert.deepEqual([...evictionRendered].sort((left, right) => left - right), [
  13, 14, 15,
]);
assert.equal(canvases.get(1).width, 0);
assert.equal(canvases.get(1).height, 0);
assert.equal(canvases.get(1).style.width, "390px");
assert.equal(canvases.get(1).style.height, "520px");
assert.equal(canvases.get(15).width, 1170);
assert.equal(
  isPdfPageEligibleForRender({
    pageNumber: 1,
    residentPages: longDocResident,
    renderedPages: evictionRendered,
  }),
  false,
);

const backScrollResident = selectPdfPagesToRender({
  pageCount: 30,
  visiblePage: 1,
});
assert.deepEqual(backScrollResident, [1, 2, 3]);
assert.equal(
  isPdfPageEligibleForRender({
    pageNumber: 1,
    residentPages: backScrollResident,
    renderedPages: evictionRendered,
  }),
  true,
);

evictPdfPagesOutsideWindow({
  pageCount: 30,
  residentPages: backScrollResident,
  renderedPages: evictionRendered,
  registry: evictionRegistry,
  getCanvas: (pageNumber) => canvases.get(pageNumber) ?? null,
});
assert.equal(evictionRendered.has(15), false);
assert.equal(canvases.get(15).width, 0);
assert.equal(canvases.get(15).style.height, "520px");
canvases.get(1).width = backScrollResident.includes(1)
  ? portrait[0].canvasWidth
  : 0;
assert.ok(canvases.get(1).width > 0, "back-scroll re-renders evicted page 1");

const afterEvictionResize = beginPdfRenderGeneration({
  generation: 4,
  renderedPages: evictionRendered,
  registry: evictionRegistry,
});
assert.equal(afterEvictionResize, 5);
assert.equal(evictionRendered.size, 0);
const resizeResident = selectPdfPagesToRender({
  pageCount: 30,
  visiblePage: 15,
});
assert.equal(
  isPdfPageEligibleForRender({
    pageNumber: 15,
    residentPages: resizeResident,
    renderedPages: evictionRendered,
  }),
  true,
  "visible page is eligible again after resize, not left blank",
);
releasePdfPageCanvas(canvases.get(12));
assert.equal(canvases.get(12).style.width, "390px");

console.log("course-learner-pdf-viewer-unit: ok");
