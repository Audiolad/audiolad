import type { BusinessOwnerHomeSignals } from "@/lib/business-app/owner-home-signals";

/**
 * Honest Owner Home copy (c02fe282 P0-1). Only states what the signals prove:
 * heartbeat freshness and the last registered playback event. Unknown → neutral.
 */
export function formatBusinessAge(minutes: number | null): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 1) return "меньше минуты назад";
  if (minutes < 60) return `${Math.round(minutes)} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} ч назад`;
  return `${Math.round(hours / 24)} дн назад`;
}

export type BusinessHomeStatusCopy = {
  kind: "no_data" | "unknown" | "online" | "stale" | "offline";
  title: string;
  detail: string;
};

export function buildBusinessHomeStatusCopy(
  signals: BusinessOwnerHomeSignals | null,
): BusinessHomeStatusCopy {
  if (!signals || signals.playerCount === 0) {
    return {
      kind: "no_data",
      title: "Нет данных о плеерах",
      detail: "Кабинет не получил сведений о подключённых плеерах этой точки.",
    };
  }
  const seconds = signals.secondsSinceHeartbeat;
  const age =
    seconds != null && Number.isFinite(seconds) && seconds >= 0
      ? formatBusinessAge(seconds / 60)
      : null;
  const status = signals.primaryHealthStatus;
  if (status === "online") {
    return {
      kind: "online",
      title: "Есть связь с плеером",
      detail: age
        ? `Последний сигнал от плеера: ${age}. Это не подтверждает, что музыка звучит сейчас.`
        : "Это не подтверждает, что музыка звучит сейчас.",
    };
  }
  if (status === "stale" && age) {
    return {
      kind: "stale",
      title: "Данные о связи устарели",
      detail: `Последний сигнал от плеера: ${age}.`,
    };
  }
  if (status === "offline" && age) {
    return {
      kind: "offline",
      title: "Плеер давно не выходил на связь",
      detail: `Последний сигнал от плеера: ${age}. Причина кабинету неизвестна.`,
    };
  }
  return {
    kind: "unknown",
    title: "Состояние плеера неизвестно",
    detail: "Сигналов от плеера этой точки пока нет или их время неизвестно.",
  };
}
