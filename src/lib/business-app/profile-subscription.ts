import type { BusinessChromeAccess } from "../access-grants/access-line";
import { ruDaysWord } from "../access-grants/policy";

/** Calendar dates, not elapsed 24-hour periods. DST cannot shorten a calendar day. */
export function businessCalendarDaysLeft(end: Date, now: Date, timeZone: string): number {
  const format = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" });
  const day = (date: Date) => {
    const parts = format.formatToParts(date);
    const n = (key: string) => Number(parts.find((p) => p.type === key)?.value);
    return Date.UTC(n("year"), n("month") - 1, n("day"));
  };
  return Math.ceil((day(end) - day(now)) / 86_400_000);
}

export function businessProfileSubscription(access: BusinessChromeAccess, timeZone: string, now: Date) {
  const ended = { title: "Оплатите, чтобы музыка продолжала играть.", until: null, button: "Оплатить" } as const;
  if (!access.endsAt || (access.mode !== "trial" && access.mode !== "paid")) return ended;
  const end = new Date(access.endsAt);
  if (!Number.isFinite(end.getTime()) || end.getTime() < now.getTime()) return ended;
  // Bad legacy timezone values should not break the whole profile.
  let zone = timeZone;
  try { new Intl.DateTimeFormat("ru-RU", { timeZone: zone }); } catch { zone = "Europe/Moscow"; }
  const days = businessCalendarDaysLeft(end, now, zone);
  const prefix = access.mode === "paid" ? "Музыка оплачена" : "Бесплатный доступ";
  return {
    title: days === 0
      ? `${prefix} – сегодня последний день`
      : `${prefix} ещё ${access.mode === "paid" ? "на " : ""}${days} ${ruDaysWord(days)}`,
    until: `до ${new Intl.DateTimeFormat("ru-RU", { timeZone: zone, day: "numeric", month: "long" }).format(end)}`,
    button: access.mode === "paid" ? "Продлить" : "Оплатить заранее",
  };
}
