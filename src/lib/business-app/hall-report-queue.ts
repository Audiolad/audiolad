/**
 * t1331u: listening samples of the hall device recorded while the internet was down (the hall
 * played from its offline buffer). They are kept on the device and sent once the connection is
 * back, oldest first, as `kind: "usage"` reports flagged `offline: true`. Only usage samples are
 * replayed: live state / heartbeat are never sent late, so the owner sees the hall as «нет связи»
 * for the whole outage and never a green dot it did not earn.
 */

export type HallUsageSample = {
  eventId: string;
  sessionId: string;
  seq: number;
  positionMs: number;
  audioItemId: string;
  /** Device clock when the sample was taken (diagnostics only, the server keeps its own time). */
  at: number;
};

/** sent: delivered (or a duplicate); drop: the server refused it for good; retry: network. */
export type HallUsageSendResult = "sent" | "drop" | "retry";

export const HALL_REPORT_QUEUE_KEY = "audiolad.hall-report-queue.v1";
/** 15-second samples: ~2.5 hours, more than the 2-hour buffer can play. */
export const HALL_REPORT_QUEUE_MAX = 600;
/** Samples older than this are not sent any more. */
export const HALL_REPORT_QUEUE_MAX_AGE_MS = 24 * 60 * 60_000;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

function valid(x: unknown): x is HallUsageSample {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  return typeof s.eventId === "string" && typeof s.sessionId === "string" && typeof s.audioItemId === "string"
    && Number.isSafeInteger(s.seq) && Number(s.seq) >= 1
    && Number.isSafeInteger(s.positionMs) && Number(s.positionMs) >= 0
    && typeof s.at === "number" && Number.isFinite(s.at);
}

export class HallReportQueue {
  private flushing: Promise<number> | null = null;

  constructor(
    private readonly storage: Storage | null,
    private readonly now: () => number = Date.now,
  ) {}

  read(): HallUsageSample[] {
    try {
      const raw = this.storage?.getItem(HALL_REPORT_QUEUE_KEY);
      if (!raw) return [];
      const list = JSON.parse(raw) as unknown;
      if (!Array.isArray(list)) return [];
      const fresh = this.now() - HALL_REPORT_QUEUE_MAX_AGE_MS;
      return list.filter(valid).filter((s) => s.at >= fresh);
    } catch {
      return [];
    }
  }

  private write(list: HallUsageSample[]): void {
    try {
      if (list.length === 0) this.storage?.removeItem(HALL_REPORT_QUEUE_KEY);
      else this.storage?.setItem(HALL_REPORT_QUEUE_KEY, JSON.stringify(list.slice(-HALL_REPORT_QUEUE_MAX)));
    } catch { /* storage full / blocked: the sample is lost, playback goes on */ }
  }

  get size(): number {
    return this.read().length;
  }

  push(sample: HallUsageSample): void {
    if (!valid(sample)) return;
    const list = this.read();
    if (list.some((s) => s.eventId === sample.eventId)) return; // already queued: keep its place
    list.push(sample);
    this.write(list);
  }

  clear(): void {
    this.write([]);
  }

  /** Sends queued samples oldest first; stops at the first network failure. Returns how many left. */
  flush(send: (sample: HallUsageSample) => Promise<HallUsageSendResult>): Promise<number> {
    if (this.flushing) return this.flushing;
    const run = this.drain(send);
    // Review #1 F2: cleared only after it is stored (an empty queue finishes synchronously).
    this.flushing = run;
    void run.then(() => {
      if (this.flushing === run) this.flushing = null;
    });
    return run;
  }

  private async drain(send: (sample: HallUsageSample) => Promise<HallUsageSendResult>): Promise<number> {
    for (;;) {
      const list = this.read();
      const head = list[0];
      if (!head) return 0;
      let result: HallUsageSendResult;
      try {
        result = await send(head);
      } catch {
        result = "retry";
      }
      if (result === "retry") return list.length;
      // Re-read: samples may have been queued meanwhile.
      this.write(this.read().filter((s) => s.eventId !== head.eventId));
    }
  }
}
