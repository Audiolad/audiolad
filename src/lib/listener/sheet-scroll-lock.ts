import { emitMobileChromeDebug } from "@/lib/listener/mobile-chrome-debug";

export const SHEET_SCROLL_LOCK_CLASS = "catalog-sheet-lock";

let lockCount = 0;

/**
 * App-wide refcount for `html.catalog-sheet-lock`.
 * Adds/removes only the CSS class. Do not pin body with a negative top offset.
 * Overflow restoration is the class coming off after the last release.
 */
export function acquireSheetScrollLock(source?: string): void {
  if (typeof document === "undefined") {
    return;
  }

  lockCount += 1;
  if (lockCount === 1) {
    document.documentElement.classList.add(SHEET_SCROLL_LOCK_CLASS);
    emitMobileChromeDebug("filter-open", { source: source ?? null, lockCount });
  }
}

export function releaseSheetScrollLock(source?: string): void {
  if (typeof document === "undefined") {
    return;
  }

  if (lockCount <= 0) {
    lockCount = 0;
    return;
  }

  lockCount -= 1;
  if (lockCount === 0) {
    document.documentElement.classList.remove(SHEET_SCROLL_LOCK_CLASS);
    emitMobileChromeDebug("filter-close", { source: source ?? null, lockCount });
  }
}

export function getSheetScrollLockCount(): number {
  return lockCount;
}

export function resetSheetScrollLockForTests(): void {
  lockCount = 0;
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove(SHEET_SCROLL_LOCK_CLASS);
  }
}
