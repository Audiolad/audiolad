import { APP_SCROLL_CONTAINER_SELECTOR } from "@/lib/navigation/reset-app-scroll";

/**
 * The catalog scrolls with the window on phones and inside the shell's center
 * column on the desktop layout.
 */
function getDesktopScroller(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  const node = document.querySelector(APP_SCROLL_CONTAINER_SELECTOR);

  if (!(node instanceof HTMLElement)) {
    return null;
  }

  const overflowY = window.getComputedStyle(node).overflowY;

  return overflowY === "auto" || overflowY === "scroll" ? node : null;
}

export function readCatalogScrollY(): number {
  const desktop = getDesktopScroller();

  return Math.max(0, Math.round(desktop ? desktop.scrollTop : window.scrollY));
}

function writeCatalogScrollY(y: number): void {
  const desktop = getDesktopScroller();

  if (desktop) {
    desktop.scrollTop = y;
    return;
  }

  window.scrollTo(0, y);
}

/**
 * Put the page back at `y` before paint, then keep re-asserting for a short
 * while: Next's own post-navigation scroll pass and late layout can move the
 * page after our first write. Stops at once if the visitor scrolls.
 * Returns a cancel function.
 */
export function restoreCatalogScroll(y: number): () => void {
  let cancelled = false;
  let frames = 0;
  let frameId = 0;
  const maxFrames = 40;

  const stop = () => {
    cancelled = true;
    window.cancelAnimationFrame(frameId);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("keydown", stop);
  };

  writeCatalogScrollY(y);
  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("keydown", stop);

  const tick = () => {
    if (cancelled) {
      return;
    }

    frames += 1;

    if (Math.abs(readCatalogScrollY() - y) > 2) {
      writeCatalogScrollY(y);
    }

    if (frames >= maxFrames) {
      stop();
      return;
    }

    frameId = window.requestAnimationFrame(tick);
  };

  frameId = window.requestAnimationFrame(tick);

  return stop;
}
