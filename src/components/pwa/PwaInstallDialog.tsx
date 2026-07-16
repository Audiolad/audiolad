"use client";

import { usePwaInstall } from "@/components/pwa/PwaInstallProvider";

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

export default function PwaInstallDialog() {
  const { dialogMode, closeDialog } = usePwaInstall();

  if (!dialogMode) {
    return null;
  }

  const title =
    dialogMode === "ios"
      ? "Добавьте АудиоЛад на экран «Домой»"
      : dialogMode === "in_app_browser"
        ? "Откройте АудиоЛад в Safari или Chrome"
        : dialogMode === "desktop_bookmark"
          ? "Сохраните АудиоЛад в браузере"
          : dialogMode === "installed"
            ? "АудиоЛад уже добавлен"
            : "Установка недоступна";

  const description =
    dialogMode === "ios"
      ? "Safari не позволяет показать системное окно установки, но вы можете добавить приложение вручную:"
      : dialogMode === "in_app_browser"
        ? "Во встроенном браузере MAX, Telegram и других приложений установка PWA обычно недоступна. Откройте audiolad.ru в Safari (iPhone) или Chrome (Android), войдите в аккаунт и добавьте приложение оттуда."
        : dialogMode === "desktop_bookmark"
          ? "В этом браузере установка как приложение может быть недоступна. Сохраните страницу в закладки или используйте Chrome / Edge для установки."
          : dialogMode === "installed"
            ? "АудиоЛад уже добавлен на это устройство. Открывайте его с домашнего экрана или из списка приложений."
            : "Попробуйте открыть АудиоЛад в Chrome, Edge или Safari на поддерживаемом устройстве.";

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
          <ul className="mt-5 space-y-3 text-sm leading-6 text-[#25135c]">
            <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
              Нажмите «Поделиться» или «⋯» и выберите «Открыть в Safari» / «Открыть в
              браузере».
            </li>
            <li className="rounded-[18px] bg-[#faf6ff] px-4 py-3">
              Если пункта нет — скопируйте ссылку и вставьте её в Safari или Chrome.
            </li>
          </ul>
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
