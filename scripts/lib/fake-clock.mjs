/**
 * Deterministic virtual clock for unit tests.
 * Does not use the real event loop for scheduling.
 */

export function createFakeClock(startMs = 0) {
  let nowMs = startMs;
  let nextId = 1;
  /** @type {Map<number, { id: number, due: number, interval: number | null, callback: Function, args: unknown[] }>} */
  const timers = new Map();
  let installed = null;

  function schedule(callback, delay, interval, args) {
    const id = nextId++;
    const due = nowMs + Math.max(0, Number(delay) || 0);
    timers.set(id, {
      id,
      due,
      interval: interval === null ? null : Math.max(1, Number(interval) || 0),
      callback,
      args,
    });
    return id;
  }

  function clear(id) {
    timers.delete(id);
  }

  function runDueTimers() {
    let guard = 0;
    while (guard < 10_000) {
      guard += 1;
      let next = null;
      for (const timer of timers.values()) {
        if (timer.due > nowMs) continue;
        if (
          !next ||
          timer.due < next.due ||
          (timer.due === next.due && timer.id < next.id)
        ) {
          next = timer;
        }
      }
      if (!next) break;

      if (next.interval === null) {
        timers.delete(next.id);
      } else {
        next.due = nowMs + next.interval;
      }
      next.callback(...next.args);
    }
    if (guard >= 10_000) {
      throw new Error("fake_clock_infinite_loop");
    }
  }

  const api = {
    now() {
      return nowMs;
    },
    setTimeout(callback, delay = 0, ...args) {
      return schedule(callback, delay, null, args);
    },
    setInterval(callback, interval = 0, ...args) {
      return schedule(callback, interval, interval, args);
    },
    clearTimeout(id) {
      clear(id);
    },
    clearInterval(id) {
      clear(id);
    },
    advanceBy(ms) {
      const delta = Math.max(0, Number(ms) || 0);
      const target = nowMs + delta;
      while (nowMs < target) {
        let nextDue = target;
        for (const timer of timers.values()) {
          if (timer.due > nowMs && timer.due < nextDue) {
            nextDue = timer.due;
          }
        }
        nowMs = nextDue;
        runDueTimers();
      }
    },
    advanceTo(ms) {
      const target = Math.max(nowMs, Number(ms) || 0);
      api.advanceBy(target - nowMs);
    },
    pendingCount() {
      return timers.size;
    },
    install() {
      if (installed) {
        throw new Error("fake_clock_already_installed");
      }
      installed = {
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
        setInterval: globalThis.setInterval,
        clearInterval: globalThis.clearInterval,
        dateNow: Date.now,
      };
      globalThis.setTimeout = api.setTimeout;
      globalThis.clearTimeout = api.clearTimeout;
      globalThis.setInterval = api.setInterval;
      globalThis.clearInterval = api.clearInterval;
      Date.now = api.now;
      return () => api.restore();
    },
    restore() {
      if (!installed) return;
      globalThis.setTimeout = installed.setTimeout;
      globalThis.clearTimeout = installed.clearTimeout;
      globalThis.setInterval = installed.setInterval;
      globalThis.clearInterval = installed.clearInterval;
      Date.now = installed.dateNow;
      installed = null;
      timers.clear();
    },
  };

  return api;
}
