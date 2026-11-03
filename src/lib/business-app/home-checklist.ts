/**
 * «С чего начать» on the owner Главная (Sergey, 03.11.2026): «я подключился, что делать дальше».
 * One short line per step and one button to the tab that does it. Главная itself no longer
 * repeats the controls of «Настройка» (pause, permission, rename, sound, device pairing).
 *
 * `done` comes from state the cabinet already has. `null` means there is no cheap and reliable
 * signal, so the step shows its number and no mark.
 */

import type { OwnerPlaybackSignal } from "@/lib/business-app/owner-home-signals";

export type BusinessHomeStepId = "music" | "device" | "documents";

export type BusinessHomeStepIcon = "music" | "settings" | "documents";

export type BusinessHomeStep = {
  id: BusinessHomeStepId;
  title: string;
  detail: string;
  done: boolean | null;
  href: string;
  cta: string;
  icon: BusinessHomeStepIcon;
};

/** Paired-device card on «Настройка» (PointPairingCard anchor). */
export const BUSINESS_HOME_DEVICE_HREF = "/preferences#device";

export function businessHomeMusicDone(input: {
  playback: Pick<OwnerPlaybackSignal, "kind">;
  lastPlayMinutesAgo: number | null | undefined;
}): boolean {
  if (input.playback.kind === "confirmed") return true;
  const age = input.lastPlayMinutesAgo;
  return age != null && Number.isFinite(age) && age >= 0;
}

export function buildBusinessHomeSteps(input: {
  musicDone: boolean;
  /** Paired device in the hall: true / false from the server, null when it could not be read. */
  deviceLinked: boolean | null;
  /** This browser is the paired hall device: only the music step applies. */
  pointMode: boolean;
}): BusinessHomeStep[] {
  const music: BusinessHomeStep = {
    id: "music",
    title: "Включите музыку",
    detail: input.musicDone
      ? "Музыка уже звучала в кабинете."
      : "Откройте вкладку «Музыка» и включите звучание для кофейни.",
    done: input.musicDone,
    href: "/music",
    cta: "Открыть музыку",
    icon: "music",
  };
  if (input.pointMode) return [music];
  return [
    music,
    {
      id: "device",
      title: "Подключите устройство в зале",
      detail:
        input.deviceLinked === true
          ? "Устройство в зале подключено."
          : "Планшет, компьютер или телефон у колонки – код и ссылка во вкладке «Настройка».",
      done: input.deviceLinked,
      href: BUSINESS_HOME_DEVICE_HREF,
      cta: "Открыть настройку",
      icon: "settings",
    },
    {
      id: "documents",
      title: "Посмотрите документы",
      detail: "Условия, лицензия и отчёт «Что играло в заведении» – во вкладке «Документы».",
      done: null,
      href: "/documents",
      cta: "Открыть документы",
      icon: "documents",
    },
  ];
}
