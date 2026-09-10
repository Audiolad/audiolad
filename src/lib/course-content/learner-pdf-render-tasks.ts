import { listPdfPagesToRelease } from "./learner-pdf-layout";

/**
 * PDF.js forbids concurrent page.render() on the same canvas.
 * Keep one RenderTask per page and cancel it before the next generation
 * (resize, orientation, retry, document destroy).
 */
export type PdfRenderTaskLike = {
  cancel: () => void;
  promise: Promise<unknown>;
};

export function isPdfRenderCancelled(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { name?: unknown; message?: unknown };
  const name = typeof record.name === "string" ? record.name : "";
  const message = typeof record.message === "string" ? record.message : "";

  return (
    name === "RenderingCancelledException" ||
    /rendering cancelled/i.test(message)
  );
}

export function shouldShowPdfPageRenderError(error: unknown): boolean {
  return !isPdfRenderCancelled(error);
}

export class PdfPageRenderTaskRegistry {
  private readonly tasks = new Map<number, PdfRenderTaskLike>();

  set(pageNumber: number, task: PdfRenderTaskLike): void {
    this.cancel(pageNumber);
    this.tasks.set(pageNumber, task);
  }

  cancel(pageNumber: number): boolean {
    const task = this.tasks.get(pageNumber);
    if (!task) {
      return false;
    }

    this.tasks.delete(pageNumber);
    try {
      task.cancel();
    } catch {
      // PDF.js cancel() is safe to call more than once; ignore throw.
    }
    return true;
  }

  cancelAll(): number {
    const pageNumbers = [...this.tasks.keys()];
    let cancelled = 0;
    for (const pageNumber of pageNumbers) {
      if (this.cancel(pageNumber)) {
        cancelled += 1;
      }
    }
    return cancelled;
  }

  get(pageNumber: number): PdfRenderTaskLike | undefined {
    return this.tasks.get(pageNumber);
  }

  /**
   * Drop a finished task only if it is still the registered task.
   * A cancelled generation must not clear a newer task on the same page.
   */
  clear(pageNumber: number, task: PdfRenderTaskLike): boolean {
    if (this.tasks.get(pageNumber) !== task) {
      return false;
    }

    this.tasks.delete(pageNumber);
    return true;
  }

  has(pageNumber: number): boolean {
    return this.tasks.has(pageNumber);
  }

  get size(): number {
    return this.tasks.size;
  }
}

/**
 * A container-width / orientation change must drop painted pages and
 * cancel unfinished RenderTasks before the next generation starts.
 */
export function beginPdfRenderGeneration(input: {
  generation: number;
  renderedPages: Set<number>;
  registry: PdfPageRenderTaskRegistry;
}): number {
  input.registry.cancelAll();
  input.renderedPages.clear();
  return input.generation + 1;
}

export type PdfPageCanvasLike = {
  width: number;
  height: number;
  style?: { width?: string; height?: string };
};

/**
 * Drop the bitmap only. CSS width/height on the element stay so the
 * vertical placeholder does not collapse.
 */
export function releasePdfPageCanvas(
  canvas: PdfPageCanvasLike | null | undefined,
): void {
  if (!canvas) {
    return;
  }

  canvas.width = 0;
  canvas.height = 0;
}

export function evictPdfPagesOutsideWindow(input: {
  pageCount: number;
  residentPages: readonly number[];
  renderedPages: Set<number>;
  registry: PdfPageRenderTaskRegistry;
  getCanvas: (pageNumber: number) => PdfPageCanvasLike | null;
}): number[] {
  const released = listPdfPagesToRelease({
    pageCount: input.pageCount,
    residentPages: input.residentPages,
  });

  for (const pageNumber of released) {
    input.registry.cancel(pageNumber);
    input.renderedPages.delete(pageNumber);
    releasePdfPageCanvas(input.getCanvas(pageNumber));
  }

  return released;
}
