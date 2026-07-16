"use client";

import { useCallback } from "react";

import { usePwaInstall } from "@/components/pwa/PwaInstallProvider";
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

type DialogCopy = {
  title: string;
  description: string;
};

function getDialogCopy(mode: PwaInstallDialogMode): DialogCopy {
  switch (mode) {
    case "ios":
      return {
        title: "Добавьте АудиоЛад на экран «Домой»",
        description:
          "Safari не показывает системное окно установки, но вы можете добавить приложение вручную:",
      };
    case "android":
      return {
        title: "Установите АудиоЛад на телефон",
        description:
          "Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».",
      };
    case "in_app_browser":
      return {
        title: "Откройте АудиоЛад во внешнем браузере",
        description:
          "Во встроенном браузере MAX, Telegram и других приложений установка обычно недоступна. Продолжите установку в Safari или Chrome.",
      };
    case "desktop_chrome":
      return {
        title: "Установите АудиоЛад в Chrome",
        description:
          "Если системное окно не открылось, установите приложение через меню браузера или сохраните страницу в закладки.",
      };
    case "desktop_edge":
      return {
        title: "Установите АудиоЛад в Edge",
        description:
          "Если системное окно не открылось, установите приложение через меню браузера или сохраните страницу в закладки.",
      };
    case "desktop_safari":
      return {
        title: "Сохраните АудиоЛад в Safari",
        description:
          "В Safari на Mac можно добавить сайт в Dock или сохранить его в закладки.",
      };
    case "desktop_bookmark":
      return {
        title: "Сохраните АудиоЛад в браузере",
        description:
          "В этом браузере установка как приложение может быть недоступна. Сохраните страницу в закладки или используйте Chrome / Edge.",
      };
    case "installed":
      return {
        title: "АудиоЛад уже добавлен",
        description:
          "АудиоЛад уже добавлен на это устройство. Открывайте его с домашнего экрана или из списка приложений.",
      };
    default:
      return {
        title: "Установка недоступна",
        description:
          "Попробуйте открыть АудиоЛад в Chrome, Edge или Safari на поддерживаемом устройстве.",
      };
  }
}

export default function PwaInstallDialog() {
  const { dialogMode, closeDialog } = usePwaInstall();

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

  const { title, description } = getDialogCopy(dialogMode);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#25135c]/35 p-4 sm:items-center"
      role="presentation"
      onClick={closeDialog}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-dialog-title"
        className="w-full max-w-[430px] rounded-[24px] border border-[#eadff8] bg-white p-5 shadow-[0_20px_50px_rgba(86,52,141,0.18)]"
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
            <p className="mt-2 text-sm leading-6 text-[#796ba0]">{description}</p>
          </div>

          <button
            type="button"
            aria-label="Закрыть"
            onClick={closeDialog}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#7042c5] hover:bg-[#f4ecfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            <CloseIcon />
          </button>
        </div>

        {dialogMode === "in_app_browser" ? (
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
              onClick={openInExternalBrowser}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-[#d9c6f2] bg-[#faf6ff] px-5 py-2.5 text-sm font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              <ExternalLinkIcon />
              Открыть в браузере
            </button>
          </>
        ) : null}

        {dialogMode === "ios" ? (
          <ol className="mt-5 space-y-3 text-sm leading-6 text-[#25135c]">
            <li className="flex items-start gap-3 rounded-[18px] bg-[#faf6ff] px-4 py-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f4ecfb] text-[#7042c5]">
                <ShareIcon />
              </span>
              <span>
                <strong className="font-medium">1.</strong> Нажмите кнопку «Поделиться» в
                нижней панели Safari.
              </span>
            </li>
            <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
              <strong className="font-medium">2.</strong> Выберите «На экран &quot;Домой&quot;».
            </li>
            <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
              <strong className="font-medium">3.</strong> Подтвердите добавление.
            </li>
          </ol>
        ) : null}

        {dialogMode === "android" ? (
          <ol className="mt-5 space-y-3 text-sm leading-6 text-[#25135c]">
            <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
              <strong className="font-medium">1.</strong> Откройте меню браузера (обычно «⋮» или
              «⋯»).
            </li>
            <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
              <strong className="font-medium">2.</strong> Выберите «Установить приложение» или
              «Добавить на главный экран».
            </li>
            <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
              <strong className="font-medium">3.</strong> Подтвердите установку.
            </li>
          </ol>
        ) : null}

        {dialogMode === "desktop_chrome" || dialogMode === "desktop_edge" ? (
          <ul className="mt-5 space-y-3 text-sm leading-6 text-[#25135c]">
            <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
              Откройте меню браузера и выберите «Установить АудиоЛад» или «Установить
              приложение», если пункт доступен.
            </li>
            <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
              Нажмите <strong className="font-medium">Ctrl+D</strong> (или{" "}
              <strong className="font-medium">Cmd+D</strong> на Mac), чтобы добавить страницу в
              закладки.
            </li>
            <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
              Создайте ярлык на рабочем столе через меню браузера, если такой пункт есть.
            </li>
          </ul>
        ) : null}

        {dialogMode === "desktop_safari" ? (
          <ul className="mt-5 space-y-3 text-sm leading-6 text-[#25135c]">
            <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
              В меню «Файл» выберите «Добавить в Dock», чтобы закрепить АудиоЛад на панели
              Dock.
            </li>
            <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
              Нажмите <strong className="font-medium">Cmd+D</strong>, чтобы добавить страницу в
              закладки.
            </li>
          </ul>
        ) : null}

        {dialogMode === "desktop_bookmark" ? (
          <ul className="mt-5 space-y-3 text-sm leading-6 text-[#25135c]">
            <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
              Нажмите <strong className="font-medium">Ctrl+D</strong> (или{" "}
              <strong className="font-medium">Cmd+D</strong> на Mac), чтобы добавить страницу
              в закладки.
            </li>
            <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
              В Chrome или Edge откройте меню браузера и выберите «Установить АудиоЛад» или
              «Установить приложение», если пункт доступен.
            </li>
          </ul>
        ) : null}

        <button
          type="button"
          onClick={closeDialog}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-2.5 text-sm font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}
