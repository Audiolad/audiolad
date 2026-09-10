import {
  computePdfPageCssSize,
  type PdfPageCssSize,
  type PdfPageSize,
} from "./learner-pdf-layout";

export const COURSE_LEARNER_PDF_WORKER_SRC = "/pdfjs/pdf.worker.min.mjs";

export type CourseLearnerPdfLoadResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; status: number; error: "forbidden" | "not_found" | "load_failed" };

export function mapProtectedPdfResponseStatus(
  status: number,
): "forbidden" | "not_found" | "load_failed" {
  if (status === 401 || status === 403) {
    return "forbidden";
  }

  if (status === 404) {
    return "not_found";
  }

  return "load_failed";
}

export async function fetchProtectedPdfBytes(
  fileSrc: string,
  init?: RequestInit,
): Promise<CourseLearnerPdfLoadResult> {
  try {
    const response = await fetch(fileSrc, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/pdf",
      },
      ...init,
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: mapProtectedPdfResponseStatus(response.status),
      };
    }

    const buffer = await response.arrayBuffer();
    return { ok: true, bytes: new Uint8Array(buffer) };
  } catch {
    return { ok: false, status: 0, error: "load_failed" };
  }
}

export function buildPdfPageSlots(input: {
  pageSizes: readonly PdfPageSize[];
  containerWidth: number;
  devicePixelRatio?: number;
}): Array<PdfPageCssSize & { pageNumber: number }> {
  return input.pageSizes.map((size, index) => ({
    pageNumber: index + 1,
    ...computePdfPageCssSize({
      containerWidth: input.containerWidth,
      pageWidth: size.width,
      pageHeight: size.height,
      devicePixelRatio: input.devicePixelRatio,
    }),
  }));
}
