import { COURSE_LEARNER_CONTENTS_ANCHOR_ID } from "@/lib/products/practice-access-ui";
import { buildPracticePublicPath } from "@/lib/products/paths";

const PUBLICATION_FILE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const COURSE_LEARNER_FILE_VIEWER_BACK_LABEL = "← Вернуться к курсу";
export const COURSE_LEARNER_FILE_OPEN_SEPARATELY_LABEL = "Открыть PDF отдельно";
export const COURSE_LEARNER_FILE_RAW_QUERY = "raw";

export type CourseLearnerFileHttpMode = "json" | "embed" | "document";

export type CourseLearnerFileViewerRoute = {
  authorSlug: string;
  productSlug: string;
  fileId: string;
};

export function isPublicationFileId(value: string | null | undefined): boolean {
  return Boolean(value && PUBLICATION_FILE_ID_PATTERN.test(value));
}

/**
 * Top-level document navigation to the protected file API must not become
 * the learner PDF surface. iframe/embed still need the PDF bytes.
 */
export function resolveCourseLearnerFileHttpMode(
  request: Request,
): CourseLearnerFileHttpMode {
  const url = new URL(request.url);
  if (url.searchParams.get(COURSE_LEARNER_FILE_RAW_QUERY) === "1") {
    return "embed";
  }

  const dest = request.headers.get("sec-fetch-dest")?.trim().toLowerCase();
  if (dest === "iframe" || dest === "embed" || dest === "object") {
    return "embed";
  }

  if (dest === "document") {
    return "document";
  }

  const mode = request.headers.get("sec-fetch-mode")?.trim().toLowerCase();
  if (mode === "navigate") {
    return "document";
  }

  const accept = request.headers.get("accept") ?? "";
  const prefersJson = accept.includes("application/json");
  const prefersHtml = accept.includes("text/html");
  if (prefersHtml && !prefersJson) {
    return "document";
  }

  return "json";
}

/**
 * @deprecated Prefer resolveCourseLearnerFileHttpMode. Kept for callers that
 * only need "not JSON".
 */
export function wantsProtectedFileDocumentOpen(request: Request): boolean {
  return resolveCourseLearnerFileHttpMode(request) !== "json";
}

export function buildCourseLearnerFilePath(
  authorSlug: string,
  productSlug: string,
  fileId: string,
  options?: { raw?: boolean },
): string {
  const path = `/api/listen/product/${encodeURIComponent(authorSlug)}/${encodeURIComponent(productSlug)}/file/${encodeURIComponent(fileId)}`;
  return options?.raw ? `${path}?${COURSE_LEARNER_FILE_RAW_QUERY}=1` : path;
}

export function buildCourseLearnerFileViewerPath(
  authorSlug: string,
  productSlug: string,
  fileId: string,
): string {
  return `${buildPracticePublicPath(authorSlug, productSlug)}/file/${encodeURIComponent(fileId)}`;
}

export function buildCourseLearnerFileReturnHref(
  authorSlug: string,
  productSlug: string,
): string {
  return `${buildPracticePublicPath(authorSlug, productSlug)}#${COURSE_LEARNER_CONTENTS_ANCHOR_ID}`;
}

export function resolvePracticeFileViewerRoute(
  segments: readonly string[],
): CourseLearnerFileViewerRoute | null {
  if (segments.length !== 4 || segments[2] !== "file") {
    return null;
  }

  const authorSlug = segments[0]?.trim() ?? "";
  const productSlug = segments[1]?.trim() ?? "";
  const fileId = segments[3]?.trim() ?? "";

  if (!authorSlug || !productSlug || !isPublicationFileId(fileId)) {
    return null;
  }

  return { authorSlug, productSlug, fileId };
}

export function buildInlinePdfContentDisposition(filename: string): string {
  const trimmed = filename.trim() || "file.pdf";
  const fallback =
    trimmed.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "") || "file.pdf";
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(trimmed)}`;
}

export async function createInlinePdfProxyResponse(input: {
  url: string;
  filename: string;
}): Promise<Response> {
  const upstream = await fetch(input.url);

  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: "sign_failed" }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": buildInlinePdfContentDisposition(input.filename),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
