"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  COURSE_LEARNER_PDF_WORKER_SRC,
  buildPdfPageSlots,
  fetchProtectedPdfBytes,
} from "@/lib/course-content/learner-pdf-document";
import {
  COURSE_LEARNER_PDF_ERROR_LABEL,
  COURSE_LEARNER_PDF_LOADING_LABEL,
  COURSE_LEARNER_PDF_RETRY_LABEL,
  formatPdfPageErrorLabel,
  formatPdfPageLabel,
  selectPdfPagesToRender,
  type PdfPageSize,
} from "@/lib/course-content/learner-pdf-layout";
import {
  PdfPageRenderTaskRegistry,
  beginPdfRenderGeneration,
  evictPdfPagesOutsideWindow,
  shouldShowPdfPageRenderError,
} from "@/lib/course-content/learner-pdf-render-tasks";

type CourseLearnerPdfPagesProps = {
  fileSrc: string;
  filename: string;
};

type PdfJsModule = typeof import("pdfjs-dist");
type PdfDocument = Awaited<
  ReturnType<PdfJsModule["getDocument"]>["promise"]
>;

const RENDER_ROOT_MARGIN = "200px 0px";

async function loadPdfjs(): Promise<PdfJsModule> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = COURSE_LEARNER_PDF_WORKER_SRC;
  return pdfjs;
}

export default function CourseLearnerPdfPages({
  fileSrc,
  filename,
}: CourseLearnerPdfPagesProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pdfRef = useRef<PdfDocument | null>(null);
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const renderGenerationRef = useRef(0);
  const renderTasksRef = useRef(new PdfPageRenderTaskRegistry());

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pageSizes, setPageSizes] = useState<PdfPageSize[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);
  const [visiblePage, setVisiblePage] = useState(1);
  const [pageErrors, setPageErrors] = useState<Record<number, true>>({});
  const [loadGeneration, setLoadGeneration] = useState(0);

  const pageCount = pageSizes.length;
  const devicePixelRatio =
    typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
  const slots = useMemo(
    () =>
      buildPdfPageSlots({
        pageSizes,
        containerWidth,
        devicePixelRatio,
      }),
    [pageSizes, containerWidth, devicePixelRatio],
  );

  const bumpRenderGeneration = useCallback(() => {
    renderGenerationRef.current = beginPdfRenderGeneration({
      generation: renderGenerationRef.current,
      renderedPages: renderedPagesRef.current,
      registry: renderTasksRef.current,
    });
  }, []);

  const retry = useCallback(() => {
    bumpRenderGeneration();
    setStatus("loading");
    setPageSizes([]);
    setPageErrors({});
    setVisiblePage(1);
    pdfRef.current?.destroy().catch(() => undefined);
    pdfRef.current = null;
    setLoadGeneration((value) => value + 1);
  }, [bumpRenderGeneration]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }

    const applyWidth = () => {
      const next = Math.floor(node.getBoundingClientRect().width);
      if (next > 0) {
        setContainerWidth(next);
      }
    };

    applyWidth();
    const observer = new ResizeObserver(() => {
      applyWidth();
    });
    observer.observe(node);
    window.addEventListener("orientationchange", applyWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("orientationchange", applyWidth);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const renderTasks = renderTasksRef.current;

    async function loadDocument() {
      setStatus("loading");
      const loaded = await fetchProtectedPdfBytes(fileSrc);
      if (cancelled) {
        return;
      }

      if (!loaded.ok) {
        setStatus("error");
        return;
      }

      try {
        const pdfjs = await loadPdfjs();
        if (cancelled) {
          return;
        }

        const documentProxy = await pdfjs.getDocument({
          data: loaded.bytes,
          disableAutoFetch: false,
          disableStream: true,
        }).promise;

        if (cancelled) {
          await documentProxy.destroy();
          return;
        }

        const sizes: PdfPageSize[] = [];
        for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
          const page = await documentProxy.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          sizes.push({ width: viewport.width, height: viewport.height });
        }

        if (cancelled) {
          await documentProxy.destroy();
          return;
        }

        pdfRef.current = documentProxy;
        setPageSizes(sizes);
        setStatus("ready");
      } catch {
        if (!cancelled) {
          setStatus("error");
        }
      }
    }

    void loadDocument();

    return () => {
      cancelled = true;
      renderTasks.cancelAll();
      pdfRef.current?.destroy().catch(() => undefined);
      pdfRef.current = null;
    };
  }, [fileSrc, loadGeneration]);

  useEffect(() => {
    bumpRenderGeneration();
  }, [bumpRenderGeneration, containerWidth]);

  useEffect(() => {
    if (status !== "ready" || pageCount === 0) {
      return;
    }

    const nodes = [...pageRefs.current.values()];
    if (nodes.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => Number(entry.target.getAttribute("data-page-number")))
          .filter((page) => Number.isInteger(page) && page > 0)
          .sort((left, right) => left - right);

        if (visible[0]) {
          setVisiblePage(visible[0]);
        }
      },
      { root: null, rootMargin: RENDER_ROOT_MARGIN, threshold: 0.01 },
    );

    for (const node of nodes) {
      observer.observe(node);
    }

    return () => observer.disconnect();
  }, [pageCount, status]);

  useEffect(() => {
    if (status !== "ready" || !pdfRef.current || containerWidth <= 0) {
      return;
    }

    const pdf = pdfRef.current;
    const pagesToRender = selectPdfPagesToRender({
      pageCount,
      visiblePage,
    });
    const generation = renderGenerationRef.current;
    const renderTasks = renderTasksRef.current;
    evictPdfPagesOutsideWindow({
      pageCount,
      residentPages: pagesToRender,
      renderedPages: renderedPagesRef.current,
      registry: renderTasks,
      getCanvas: (pageNumber) =>
        pageRefs.current.get(pageNumber)?.querySelector("canvas") ?? null,
    });
    const dpr =
      typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;

    let cancelled = false;

    async function renderVisible() {
      for (const pageNumber of pagesToRender) {
        if (cancelled || generation !== renderGenerationRef.current) {
          return;
        }

        if (renderedPagesRef.current.has(pageNumber)) {
          continue;
        }

        const slot = slots.find((item) => item.pageNumber === pageNumber);
        const wrapper = pageRefs.current.get(pageNumber);
        const canvas = wrapper?.querySelector("canvas");
        if (!slot || !canvas || slot.cssWidth <= 0) {
          continue;
        }

        try {
          const page = await pdf.getPage(pageNumber);
          if (cancelled || generation !== renderGenerationRef.current) {
            return;
          }

          const viewport = page.getViewport({ scale: slot.scale * dpr });
          canvas.width = slot.canvasWidth;
          canvas.height = slot.canvasHeight;
          canvas.style.width = `${slot.cssWidth}px`;
          canvas.style.height = `${slot.cssHeight}px`;

          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("canvas_context_missing");
          }

          const task = page.render({
            canvasContext: context,
            viewport,
          });
          renderTasks.set(pageNumber, task);

          try {
            await task.promise;
          } finally {
            renderTasks.clear(pageNumber, task);
          }

          if (cancelled || generation !== renderGenerationRef.current) {
            return;
          }

          renderedPagesRef.current.add(pageNumber);
          setPageErrors((current) => {
            if (!current[pageNumber]) {
              return current;
            }

            const next = { ...current };
            delete next[pageNumber];
            return next;
          });
        } catch (error) {
          if (
            cancelled ||
            generation !== renderGenerationRef.current ||
            !shouldShowPdfPageRenderError(error)
          ) {
            continue;
          }

          setPageErrors((current) => ({ ...current, [pageNumber]: true }));
        }
      }
    }

    void renderVisible();

    return () => {
      cancelled = true;
      renderTasks.cancelAll();
    };
  }, [containerWidth, pageCount, slots, status, visiblePage]);

  return (
    <div
      ref={containerRef}
      data-course-learner-pdf-pages="true"
      data-pdf-status={status}
      className="mt-4 flex w-full min-w-0 max-w-full flex-col gap-4 overflow-x-clip"
    >
      {status === "loading" ? (
        <p
          data-course-learner-pdf-loading="true"
          className="rounded-[20px] border border-[#eadff8] bg-white px-5 py-8 text-center text-sm text-[#7d70a2]"
        >
          {COURSE_LEARNER_PDF_LOADING_LABEL}
        </p>
      ) : null}

      {status === "error" ? (
        <div
          data-course-learner-pdf-error="true"
          className="rounded-[20px] border border-[#eadff8] bg-white px-5 py-8 text-center"
        >
          <p className="text-sm leading-6 text-[#7d70a2]">
            {COURSE_LEARNER_PDF_ERROR_LABEL}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-4 inline-flex min-h-11 items-center rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
          >
            {COURSE_LEARNER_PDF_RETRY_LABEL}
          </button>
        </div>
      ) : null}

      {status === "ready"
        ? slots.map((slot) => (
            <div
              key={slot.pageNumber}
              ref={(node) => {
                if (node) {
                  pageRefs.current.set(slot.pageNumber, node);
                } else {
                  pageRefs.current.delete(slot.pageNumber);
                }
              }}
              data-course-learner-pdf-page={slot.pageNumber}
              data-page-number={slot.pageNumber}
              className="w-full min-w-0 max-w-full overflow-hidden rounded-[16px] border border-[#eadff8] bg-white"
              style={{
                width: "100%",
                maxWidth: "100%",
                minHeight: slot.cssHeight ? `${slot.cssHeight}px` : undefined,
              }}
            >
              <canvas
                aria-label={`${filename}, ${formatPdfPageLabel(slot.pageNumber, pageCount)}`}
                className="block h-auto w-full max-w-full"
                style={{
                  width: slot.cssWidth ? `${slot.cssWidth}px` : "100%",
                  height: slot.cssHeight ? `${slot.cssHeight}px` : "auto",
                  maxWidth: "100%",
                }}
              />
              {pageErrors[slot.pageNumber] ? (
                <p
                  data-course-learner-pdf-page-error={slot.pageNumber}
                  className="px-4 py-3 text-center text-sm text-[#b42318]"
                >
                  {formatPdfPageErrorLabel(slot.pageNumber)}
                </p>
              ) : (
                <p className="px-4 py-2 text-center text-xs text-[#7d70a2]">
                  {formatPdfPageLabel(slot.pageNumber, pageCount)}
                </p>
              )}
            </div>
          ))
        : null}
    </div>
  );
}
