import {
  areStudioProjectDocumentsEqual,
  type StudioProjectDocumentV2,
} from "./persistence";

export type StudioAutosaveStatus =
  | "saving"
  | "saved"
  | "error"
  | "conflict"
  | "asset-uploading"
  | "partial-disabled";

export type StudioAutosaveSnapshot = {
  name: string;
  document: StudioProjectDocumentV2;
  blocked?: "assets" | "asset-error" | "partial";
};

export type StudioAutosaveTransport = (input: {
  expectedRevision: number;
  name: string;
  projectData: StudioProjectDocumentV2;
}) => Promise<{ revision: number }>;

type TimerApi = {
  setTimeout: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof globalThis.setTimeout>;
  clearTimeout: (timer: ReturnType<typeof globalThis.setTimeout>) => void;
};

export type StudioAutosaveControllerOptions = {
  getSnapshot: () => StudioAutosaveSnapshot;
  update: StudioAutosaveTransport;
  onChange?: (state: StudioAutosaveState) => void;
  debounceMs?: number;
  timers?: TimerApi;
};

export type StudioAutosaveState = {
  status: StudioAutosaveStatus;
  revision: number;
  dirty: boolean;
  isInFlight: boolean;
  canWarnBeforeUnload: boolean;
};

function isConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error &&
    (error as { status?: unknown }).status === 409;
}

function stopsAutomaticRetry(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error &&
    [401, 403, 404, 422].includes((error as { status?: unknown }).status as number);
}

/**
 * Serializes project PUTs without depending on React. The shell calls
 * markDirty only for completed editor actions, so transient pointer previews
 * never enter the save queue.
 */
export class StudioAutosaveController {
  private readonly debounceMs: number;
  private readonly timers: TimerApi;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private revision = 0;
  private savedGeneration = 0;
  private generation = 0;
  private savedName = "";
  private savedDocument: StudioProjectDocumentV2 | null = null;
  private inFlight = false;
  private enabled = false;
  private conflict = false;
  private automaticStopped = false;
  private status: StudioAutosaveStatus = "saved";
  private settleWaiters: Array<(saved: boolean) => void> = [];

  constructor(private readonly options: StudioAutosaveControllerOptions) {
    this.debounceMs = options.debounceMs ?? 1500;
    this.timers = options.timers ?? globalThis;
  }

  hydrate(input: {
    revision: number;
    name: string;
    document: StudioProjectDocumentV2;
    complete: boolean;
  }) {
    this.clearTimer();
    this.revision = input.revision;
    this.savedName = input.name;
    this.savedDocument = input.document;
    this.generation = 0;
    this.savedGeneration = 0;
    this.inFlight = false;
    this.conflict = false;
    this.automaticStopped = !input.complete;
    this.enabled = input.complete;
    this.status = input.complete ? "saved" : "partial-disabled";
    this.emit();
  }

  markDirty() {
    if (!this.enabled || this.conflict) return;
    this.generation += 1;
    if (this.status === "error" && !this.automaticStopped) {
      // Network/server errors are retried only after another completed edit.
      this.status = "saved";
    }
    if (!this.automaticStopped) this.schedule();
    this.emit();
  }

  notifyAssetBound() {
    this.markDirty();
  }

  retry() {
    if (!this.enabled || this.conflict) return;
    this.automaticStopped = false;
    this.flush();
  }

  flush() {
    this.clearTimer();
    if (!this.enabled || this.conflict || this.inFlight) return;
    this.saveNow();
  }

  /**
   * Immediately persists outstanding edits and resolves only after they are
   * saved, or when saving can no longer make progress.
   */
  flushAndWait(): Promise<boolean> {
    this.clearTimer();
    const state = this.getState();
    if (!this.enabled || this.conflict || state.status === "error" ||
      state.status === "asset-uploading" || state.status === "partial-disabled") {
      return Promise.resolve(false);
    }
    if (!state.dirty && !state.isInFlight && state.status === "saved") {
      return Promise.resolve(true);
    }

    const settled = new Promise<boolean>((resolve) => {
      this.settleWaiters.push(resolve);
    });
    if (!this.inFlight) this.saveNow();
    return settled;
  }

  dispose() {
    this.clearTimer();
    this.resolveSettleWaiters(false);
  }

  getState(): StudioAutosaveState {
    const dirty = this.generation > this.savedGeneration;
    return {
      status: this.status,
      revision: this.revision,
      dirty,
      isInFlight: this.inFlight,
      canWarnBeforeUnload: dirty || this.inFlight || this.status === "error" ||
        this.status === "asset-uploading",
    };
  }

  private schedule() {
    this.clearTimer();
    if (this.inFlight || this.automaticStopped || this.conflict) return;
    const snapshot = this.options.getSnapshot();
    if (snapshot.blocked) {
      this.status = snapshot.blocked === "partial"
        ? "partial-disabled"
        : snapshot.blocked === "asset-error" ? "error" : "asset-uploading";
      this.emit();
      return;
    }
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      this.saveNow();
    }, this.debounceMs);
  }

  private saveNow() {
    if (this.inFlight || !this.enabled || this.conflict) return;
    const snapshot = this.options.getSnapshot();
    if (snapshot.blocked) {
      this.status = snapshot.blocked === "partial"
        ? "partial-disabled"
        : snapshot.blocked === "asset-error" ? "error" : "asset-uploading";
      this.emit();
      return;
    }
    const generation = this.generation;
    if (
      this.savedDocument &&
      snapshot.name === this.savedName &&
      areStudioProjectDocumentsEqual(snapshot.document, this.savedDocument)
    ) {
      this.savedGeneration = generation;
      this.status = "saved";
      this.emit();
      return;
    }

    this.inFlight = true;
    this.status = "saving";
    this.emit();
    void this.options.update({
      expectedRevision: this.revision,
      name: snapshot.name,
      projectData: snapshot.document,
    }).then(
      ({ revision }) => {
        this.inFlight = false;
        this.revision = revision;
        this.savedName = snapshot.name;
        this.savedDocument = snapshot.document;
        this.savedGeneration = generation;
        this.status = "saved";
        this.emit();
        if (this.generation > generation) {
          if (this.settleWaiters.length) {
            this.saveNow();
          } else {
            this.schedule();
          }
        }
      },
      (error: unknown) => {
        this.inFlight = false;
        if (isConflict(error)) {
          this.conflict = true;
          this.status = "conflict";
        } else {
          this.status = "error";
          this.automaticStopped = stopsAutomaticRetry(error);
        }
        this.emit();
      },
    );
  }

  private clearTimer() {
    if (this.timer !== null) {
      this.timers.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit() {
    this.options.onChange?.(this.getState());
    const state = this.getState();
    if (state.status === "error" || state.status === "conflict" ||
      state.status === "asset-uploading" || state.status === "partial-disabled") {
      this.resolveSettleWaiters(false);
    } else if (!state.dirty && !state.isInFlight && state.status === "saved") {
      this.resolveSettleWaiters(true);
    }
  }

  private resolveSettleWaiters(saved: boolean) {
    const waiters = this.settleWaiters;
    this.settleWaiters = [];
    for (const resolve of waiters) resolve(saved);
  }
}
