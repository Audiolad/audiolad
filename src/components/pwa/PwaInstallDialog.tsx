"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import { usePwaInstall } from "@/components/pwa/PwaInstallProvider";
import {
  getPwaInstallDialogCopy,
  PWA_INSTALL_BOOKMARK_FOOTNOTE,
  shouldShowInstallBookmarkFootnote,
} from "@/lib/pwa/dialog-copy";
import {
  getInstallDialogMode,
  subscribeInstallDialogMode,
} from "@/lib/pwa/install-dialog-controller";
import type { PwaInstallDialogMode } from "@/lib/pwa/types";

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M12 16V4m0 0 4 4m-4-4-4 4M5 20h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M14 5h5v5M10 14 19 5M15 5h4v4M5 19h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function useInstallDialogAccessibility(
  isOpen: boolean,
  onClose: () => void,
  panelRef: React.RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const panel = panelRef.current;
    const focusables = () => {
      if (!panel) {
        return [] as HTMLElement[];
      }

      return Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled"));
    };

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const initialFocus = focusables()[0] ?? panel;
    initialFocus?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const nodes = focusables();

      if (nodes.length === 0) {
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !panel?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose, panelRef]);
}

export default function PwaInstallDialog() {
  const {
    closeDialog,
    uiVariant,
    hasNativeInstallPrompt,
    runNativeInstallFromDialog,
  } = usePwaInstall();
  const dialogMode = useSyncExternalStore(
    subscribeInstallDialogMode,
    getInstallDialogMode,
    () => null,
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = uiVariant === "mobile";

  useInstallDialogAccessibility(Boolean(dialogMode), closeDialog, panelRef);

  const openInExternalBrowser = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = window.location.href;
    const opened = window.open(url, "_blank", "noopener,noreferrer");

    if (!opened) {
      window.location.assign(url);
    }
  }, []);

  if (!dialogMode) {
    return null;
  }

  const { title, description } = getPwaInstallDialogCopy(dialogMode);

  return (
    <div
      className={
        isMobile
          ? "fixed inset-0 z-[60] flex items-end justify-center bg-[#25135c]/35 p-0"
          : "fixed inset-0 z-[60] flex items-center justify-center bg-[#25135c]/35 p-4"
      }
      role="presentation"
      onClick={closeDialog}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-dialog-title"
        aria-describedby="pwa-install-dialog-description"
        tabIndex={-1}
        className={
          isMobile
            ? "flex max-h-[min(100dvh,720px)] w-full max-w-[430px] flex-col overflow-y-auto rounded-t-[24px] border border-[#eadff8] bg-white p-5 shadow-[0_20px_50px_rgba(86,52,141,0.22)]"
            : "w-full max-w-[430px] rounded-[24px] border border-[#eadff8] bg-white p-5 shadow-[0_20px_50px_rgba(86,52,141,0.18)]"
        }
        style={
          isMobile
            ? {
                paddingBottom:
                  "max(1.25rem, calc(env(safe-area-inset-bottom) + 1rem))",
              }
            : undefined
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="pwa-install-dialog-title"
              className="text-[20px] font-semibold text-[#25135c]"
            >
              {title}
            </h2>
            <p
              id="pwa-install-dialog-description"
              className="mt-2 text-sm leading-6 text-[#796ba0]"
            >
              {description}
            </p>
          </div>

          <button
            type="button"
            aria-label="Закрыть"
            onClick={closeDialog}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#7042c5] transition-colors hover:bg-[#f4ecfb] active:bg-[#eadff8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            <CloseIcon />
          </button>
        </div>

        <InstallDialogInstructions
          dialogMode={dialogMode}
          onOpenExternalBrowser={openInExternalBrowser}
        />

        {shouldShowInstallBookmarkFootnote(dialogMode) ? (
          <p className="mt-4 text-xs leading-5 text-[#9a8cb8]">
            {PWA_INSTALL_BOOKMARK_FOOTNOTE}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2">
          {hasNativeInstallPrompt ? (
            <button
              type="button"
              onClick={() => void runNativeInstallFromDialog()}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white transition-colors active:bg-[#6238ad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              Установить
            </button>
          ) : null}

          <button
            type="button"
            onClick={closeDialog}
            className={
              hasNativeInstallPrompt
                ? "inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#d9c6f2] bg-[#faf6ff] px-5 py-2.5 text-sm font-medium text-[#7042c5] transition-colors active:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
                : "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white transition-colors active:bg-[#6238ad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            }
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}

type InstallDialogInstructionsProps = {
  dialogMode: PwaInstallDialogMode;
  onOpenExternalBrowser: () => void;
};

function InstallDialogInstructions({
  dialogMode,
  onOpenExternalBrowser,
}: InstallDialogInstructionsProps) {
  if (dialogMode === "in_app_browser") {
    return (
      <>
        <ul className="mt-5 space-y-3 text-sm leading-6 text-[#25135c]">
          <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
            Нажмите «Поделиться» или «⋯» и выберите «Открыть в Safari» / «Открыть в
            браузере».
          </li>
          <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
            Если пункта нет — скопируйте ссылку и вставьте её в Safari или Chrome.
          </li>
        </ul>

        <button
          type="button"
          onClick={onOpenExternalBrowser}
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#d9c6f2] bg-[#faf6ff] px-5 py-2.5 text-sm font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          <ExternalLinkIcon />
          Открыть в браузере
        </button>
      </>
    );
  }

  if (dialogMode === "ios") {
    return (
      <ol className="mt-5 space-y-3 text-sm leading-6 text-[#25135c]">
        <li className="flex items-start gap-3 rounded-[18px] bg-[#faf6ff] px-4 py-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f4ecfb] text-[#7042c5]">
            <ShareIcon />
          </span>
          <span>
            <strong className="font-medium">1.</strong> Нажмите кнопку «Поделиться».
          </span>
        </li>
        <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
          <strong className="font-medium">2.</strong> Выберите «На экран &quot;Домой&quot;».
        </li>
        <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
          <strong className="font-medium">3.</strong> Нажмите «Добавить».
        </li>
      </ol>
    );
  }

  if (dialogMode === "android") {
    return (
      <ol className="mt-5 space-y-3 text-sm leading-6 text-[#25135c]">
        <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
          <strong className="font-medium">1.</strong> Откройте меню браузера — значок ⋮
          или ≡.
        </li>
        <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
          <strong className="font-medium">2.</strong> Выберите «Установить приложение»
          или «Добавить на главный экран».
        </li>
        <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
          <strong className="font-medium">3.</strong> Подтвердите добавление иконки.
        </li>
      </ol>
    );
  }

  if (dialogMode === "desktop_chrome" || dialogMode === "desktop_edge") {
    return (
      <ol className="mt-5 space-y-3 text-sm leading-6 text-[#25135c]">
        <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
          <strong className="font-medium">1.</strong> Откройте меню браузера — значок ⋮
          или ≡.
        </li>
        <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
          <strong className="font-medium">2.</strong> Выберите «Установить АудиоЛад» или
          «Установить приложение».
        </li>
        <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
          <strong className="font-medium">3.</strong> Подтвердите установку приложения.
        </li>
      </ol>
    );
  }

  if (dialogMode === "desktop_safari") {
    return (
      <ol className="mt-5 space-y-3 text-sm leading-6 text-[#25135c]">
        <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
          <strong className="font-medium">1.</strong> В меню «Файл» выберите «Добавить в
          Dock».
        </li>
        <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
          <strong className="font-medium">2.</strong> Подтвердите добавление АудиоЛад в Dock.
        </li>
      </ol>
    );
  }

  if (dialogMode === "desktop_bookmark") {
    return (
      <ol className="mt-5 space-y-3 text-sm leading-6 text-[#25135c]">
        <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
          <strong className="font-medium">1.</strong> Откройте АудиоЛад в Chrome или Edge.
        </li>
        <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
          <strong className="font-medium">2.</strong> Откройте меню браузера и выберите
          «Установить АудиоЛад» или «Установить приложение».
        </li>
        <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
          <strong className="font-medium">3.</strong> Подтвердите установку приложения.
        </li>
      </ol>
    );
  }

  return null;
}
