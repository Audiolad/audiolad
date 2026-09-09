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
  COURSE_LEARNER_PDF_ERROR_LABEL,
  COURSE_LEARNER_PDF_LOADING_LABEL,
  computePdfPageCssSize,
  documentHasHorizontalOverflow,
  formatPdfPageLabel,
  pageWrapperFitsContainer,
  selectPdfPagesToRender,
} from "../src/lib/course-content/learner-pdf-layout.ts";
import { buildPdfPageSlots } from "../src/lib/course-content/learner-pdf-document.ts";
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
assert.match(markup, new RegExp(COURSE_LEARNER_PDF_LOADING_LABEL));
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
const route = read(
  "src/app/api/listen/product/[slug]/[productSlug]/file/[fileId]/route.ts",
);
assert.doesNotMatch(viewerSource, /<iframe/);
assert.match(pagesSource, /getDocument/);
assert.match(pagesSource, /<canvas/);
assert.match(pagesSource, /COURSE_LEARNER_PDF_ERROR_LABEL/);
assert.match(route, /signLearnerPublicationFile/);
assert.match(route, /createInlinePdfProxyResponse/);
assert.doesNotMatch(route, /NextResponse\.redirect\(signed\.url/);

console.log("course-learner-pdf-viewer-unit: ok");
