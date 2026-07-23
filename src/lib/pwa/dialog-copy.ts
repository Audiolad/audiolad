import type { PwaInstallDialogMode } from "@/lib/pwa/types";

export type PwaInstallDialogCopy = {
  title: string;
  description: string;
};

export const PWA_INSTALL_BOOKMARK_FOOTNOTE =
  "Также вы можете сохранить страницу в закладках браузера.";

export const PWA_INSTALL_ONE_TAP_FOOTNOTE =
  "Теперь вы сможете открывать АудиоЛад одним нажатием – как обычное приложение.";

const ANDROID_INSTALL_TITLE = "Установить АудиоЛад";
const ANDROID_INSTALL_DESCRIPTION =
  "Добавьте АудиоЛад на главный экран, чтобы открывать его как обычное приложение.";

export function getPwaInstallDialogCopy(
  mode: PwaInstallDialogMode,
): PwaInstallDialogCopy {
  switch (mode) {
    case "ios":
      return {
        title: "Как добавить АудиоЛад на экран телефона",
        description: "Это займёт меньше минуты.",
      };
    case "android":
      return {
        title: ANDROID_INSTALL_TITLE,
        description: ANDROID_INSTALL_DESCRIPTION,
      };
    case "in_app_browser":
      return {
        title: "Как добавить АудиоЛад на экран телефона",
        description:
          "Сейчас АудиоЛад открыт внутри другого приложения. Сначала откройте его в Safari или Chrome.",
      };
    case "desktop_chrome":
    case "desktop_edge":
      return {
        title: "Установить АудиоЛад",
        description:
          "Установите АудиоЛад как приложение через меню браузера или кнопку «Установить» ниже, если она доступна.",
      };
    case "desktop_safari":
      return {
        title: "Установить АудиоЛад",
        description:
          "Добавьте АудиоЛад в Dock через меню Safari, чтобы открывать его как приложение.",
      };
    case "desktop_bookmark":
      return {
        title: "Установить АудиоЛад",
        description:
          "Откройте АудиоЛад в Chrome или Edge и установите его как приложение через меню браузера.",
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

export function shouldShowInstallBookmarkFootnote(
  mode: PwaInstallDialogMode,
): boolean {
  return (
    mode === "desktop_chrome" ||
    mode === "desktop_edge" ||
    mode === "desktop_safari" ||
    mode === "desktop_bookmark"
  );
}

export function shouldShowInstallOneTapFootnote(
  mode: PwaInstallDialogMode,
): boolean {
  return mode === "ios" || mode === "android";
}
