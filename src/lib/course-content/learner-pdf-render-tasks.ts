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

  clear(pageNumber: number): void {
    this.tasks.delete(pageNumber);
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
