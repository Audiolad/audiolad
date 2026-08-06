"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

import {
  GETCOURSE_WIDGETS,
  type SchoolGetCourseTariffId,
} from "@/lib/school/getcourse-widgets";

const LOAD_TIMEOUT_MS = 15000;

const SUPPORT_MAX_URL =
  "https://max.ru/u/f9LHodD0cOI9Z0TpTY6vON-AsaLO2UKjrEHxKZb8SoKf46sX5Bvih-n5QjQ";
const SUPPORT_TELEGRAM_URL = "https://t.me/petrovss";

type LoadState = "loading" | "ready" | "error";

type SchoolGetCourseModalProps = {
  tariffId: SchoolGetCourseTariffId | null;
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
};

function getStartWidget(scriptId: string): (() => void) | undefined {
  const value = (window as unknown as Record<string, unknown>)[
    `startWidget${scriptId}`
  ];
  return typeof value === "function" ? (value as () => void) : undefined;
}

function clearWidgetMount(mount: HTMLElement) {
  mount.replaceChildren();
  mount.style.height = "";
  mount.style.overflow = "";
}

function ensureWidgetMarker(mount: HTMLElement, scriptId: string) {
  let marker = document.getElementById(scriptId);
  if (marker && mount.contains(marker)) {
    return marker;
  }

  marker?.remove();
  marker = document.createElement("script");
  marker.id = scriptId;
  mount.appendChild(marker);
  return marker;
}

function startGetCourseWidget(
  mount: HTMLElement,
  tariffId: SchoolGetCourseTariffId,
) {
  const widget = GETCOURSE_WIDGETS[tariffId];
  const starter = getStartWidget(widget.scriptId);

  if (!starter) {
    throw new Error("getcourse_starter_missing");
  }

  // GetCourse looks up script by id, inserts iframe before it, then removes the script.
  ensureWidgetMarker(mount, widget.scriptId);
  starter();
}

function mountGetCourseWidget(
  mount: HTMLElement,
  tariffId: SchoolGetCourseTariffId,
): Promise<void> {
  const widget = GETCOURSE_WIDGETS[tariffId];

  clearWidgetMount(mount);
  mount.style.overflow = "hidden";

  if (getStartWidget(widget.scriptId)) {
    startGetCourseWidget(mount, tariffId);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    document.getElementById(widget.scriptId)?.remove();

    const script = document.createElement("script");
    script.id = widget.scriptId;
    script.src = widget.src;
    script.async = true;

    script.onload = () => {
      try {
        // The loaded script itself is the marker GetCourse expects.
        startGetCourseWidget(mount, tariffId);
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    script.onerror = () => {
      reject(new Error("getcourse_script_error"));
    };

    mount.appendChild(script);
  });
}

function waitForWidgetFrame(
  mount: HTMLElement,
  widgetId: string,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const matches = () => {
      const iframe = mount.querySelector("iframe");
      if (!iframe) return false;
      const src = iframe.getAttribute("src") || "";
      return src.includes(`id=${widgetId}`);
    };

    if (matches()) {
      resolve();
      return;
    }

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("getcourse_timeout"));
    }, LOAD_TIMEOUT_MS);

    const observer = new MutationObserver(() => {
      if (matches()) {
        cleanup();
        resolve();
      }
    });

    const cleanup = () => {
      window.clearTimeout(timer);
      observer.disconnect();
      signal.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new Error("getcourse_aborted"));
    };

    observer.observe(mount, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function getFocusable(container: HTMLElement) {
  return [
    ...container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
}

export default function SchoolGetCourseModal({
  tariffId,
  onClose,
  returnFocusRef,
}: SchoolGetCourseModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const open = tariffId !== null;
  const widget = tariffId ? GETCOURSE_WIDGETS[tariffId] : null;

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open || !tariffId || !widget) {
      return;
    }

    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const abort = new AbortController();
    let cancelled = false;
    setLoadState("loading");
    clearWidgetMount(mount);

    (async () => {
      try {
        await mountGetCourseWidget(mount, tariffId);
        if (cancelled) return;
        await waitForWidgetFrame(mount, widget.widgetId, abort.signal);
        if (cancelled) return;
        setLoadState("ready");
      } catch {
        if (cancelled || abort.signal.aborted) return;
        clearWidgetMount(mount);
        setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
      clearWidgetMount(mount);
    };
  }, [open, tariffId, widget]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) {
      document.body.style.paddingRight = `${scrollbar}px`;
    }

    const previouslyFocused =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    window.setTimeout(() => {
      closeRef.current?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }

      const focusable = getFocusable(panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        closeRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open, handleClose, returnFocusRef]);

  if (!open || !widget || !tariffId) {
    return null;
  }

  function onBackdropClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }

  function onPanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      handleClose();
    }
  }

  return (
    <div
      className="school-gc-modal"
      role="presentation"
      onMouseDown={onBackdropClick}
    >
      <div
        ref={panelRef}
        className="school-gc-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={`Форма записи на вариант ${widget.label}`}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onPanelKeyDown}
      >
        <span id={titleId} className="sr-only">
          Форма записи на вариант {widget.label}
        </span>

        <button
          ref={closeRef}
          type="button"
          className="school-gc-modal__close"
          aria-label="Закрыть форму"
          onClick={handleClose}
        >
          <span aria-hidden="true">×</span>
        </button>

        <div className="school-gc-modal__body">
          {loadState === "loading" ? (
            <p className="school-gc-modal__status" role="status">
              Загружаем форму…
            </p>
          ) : null}

          {loadState === "error" ? (
            <div className="school-gc-modal__error" role="alert">
              <p>
                Не удалось загрузить форму. Обновите страницу или напишите нам в
                MAX или Telegram.
              </p>
              <div className="school-gc-modal__error-links">
                <a
                  href={SUPPORT_MAX_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Написать в MAX
                </a>
                <a
                  href={SUPPORT_TELEGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Написать в Telegram
                </a>
              </div>
            </div>
          ) : null}

          <div
            ref={mountRef}
            className={
              loadState === "ready"
                ? "school-gc-modal__mount"
                : "school-gc-modal__mount school-gc-modal__mount--pending"
            }
            data-tariff={tariffId}
            data-widget-id={widget.widgetId}
          />
        </div>
      </div>
    </div>
  );
}
