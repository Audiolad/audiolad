/**
 * Hall device command poll (Sergey 2026-11-08): «Продолжить в зале» reached a paused venue
 * device about 1.5 minutes late, while pause / next (sent while the music played) were
 * prompt. A hidden, silent page gets its main-thread timers throttled by Chrome to one
 * wake-up per minute; an audible page is exempt. So once the hall is paused, the 5 s
 * command poll ran about once a minute, and a missed apply waited for the 30 s lease.
 *
 * Timers inside a dedicated worker are not under that wake-up limit: the worker posts a
 * message every `ms`, and message delivery to the page is not a throttled timer. A plain
 * setInterval runs alongside as the fallback where workers or Blob URLs are unavailable. On iOS a locked
 * screen suspends the page altogether; nothing here can wake it.
 */

export type WakeTickerWorker = {
  onmessage: ((event: unknown) => void) | null;
  postMessage(value: unknown): void;
  terminate(): void;
};

export type WakeTickerEnv = {
  createWorker?: (source: string) => WakeTickerWorker | null;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (timer: unknown) => void;
  now?: () => number;
};

/** Worker body: tick every `ms` (sent as the first message). */
export const WAKE_TICKER_WORKER_SOURCE =
  "let t=null;onmessage=function(e){if(t!==null)clearInterval(t);t=setInterval(function(){postMessage(0)},Number(e.data)||5000)};";

function browserWorker(source: string): WakeTickerWorker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined" || typeof Blob === "undefined"
    || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return null;
  let url: string | null = null;
  try {
    url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    const worker = new Worker(url);
    const blobUrl = url;
    return {
      get onmessage() { return worker.onmessage as ((event: unknown) => void) | null; },
      set onmessage(fn: ((event: unknown) => void) | null) { worker.onmessage = fn; },
      postMessage: (value: unknown) => worker.postMessage(value),
      // The script URL is revoked only when the worker stops: an early revoke can fail the load.
      terminate: () => {
        worker.terminate();
        try { URL.revokeObjectURL(blobUrl); } catch { /* ignore */ }
      },
    };
  } catch {
    if (url) {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    }
    return null;
  }
}

/**
 * Calls `fn` about every `ms`, also in a hidden tab. A plain setInterval always runs as
 * well (a worker that fails to load reports that only asynchronously); the two sources
 * share one gap guard, so `fn` still runs once per period. Returns a stop function.
 */
export function startWakeTicker(fn: () => void, ms: number, env: WakeTickerEnv = {}): () => void {
  const now = env.now ?? (() => Date.now());
  let last = Number.NEGATIVE_INFINITY;
  const run = () => {
    const t = now();
    if (t - last < ms * 0.8) return;
    last = t;
    fn();
  };
  const create = env.createWorker ?? browserWorker;
  let worker: WakeTickerWorker | null = null;
  try {
    worker = create(WAKE_TICKER_WORKER_SOURCE);
    if (worker) {
      worker.onmessage = run;
      worker.postMessage(ms);
    }
  } catch {
    try { worker?.terminate(); } catch { /* ignore */ }
    worker = null;
  }
  const set = env.setInterval ?? ((f, t) => setInterval(f, t));
  const clear = env.clearInterval ?? ((t) => clearInterval(t as ReturnType<typeof setInterval>));
  const timer = set(run, ms);
  return () => {
    clear(timer);
    if (worker) {
      worker.onmessage = null;
      try { worker.terminate(); } catch { /* ignore */ }
    }
  };
}
