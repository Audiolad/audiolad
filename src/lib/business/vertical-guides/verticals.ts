import { BUSINESS_VENUES } from "@/lib/business/landing";

import type { B2BVertical } from "./types";

/**
 * Paths already taken or reserved for something other than these articles.
 * Coffee articles use /b/coffee, not /b/cafe (the venue card) and not /b/atlas-kofeen.
 * Restaurant, bar and hotel articles must not occupy the venue landings.
 */
export const RESERVED_B_PATHS = [
  "/b/atlas-kofeen",
  "/b/prava",
  "/b/bars",
  ...BUSINESS_VENUES.map((venue) => venue.futurePath),
] as const;

// Подписи будущих секторов задаются при запуске по образцу «АудиоЛад <Сектор>», например «АудиоЛад СПА».
export const B2B_VERTICALS: readonly B2BVertical[] = [
  {
    id: "coffee",
    status: "active",
    path: "/b/coffee",
    // Label only: the URL stays /b/coffee. The section is about opening and running a кофейня,
    // music for the hall lives in «Музыка для бизнеса» (/b), linked from the «О разделе» block.
    title: "Кофейня: открытие и работа",
    byline: "АудиоЛад Кофейни",
    kicker: "АудиоЛад Бизнес",
    intro:
      "Разборы для тех, кто открывает кофейню или уже ведёт её: бизнес-план и расчёты, документы и оборудование, барная стойка, кофе в зёрнах и ассортимент к нему.",
    about: [
      "«АудиоЛад Кофейни» – раздел сервиса АудиоЛад о том, как открыть кофейню и вести её каждый день. Здесь собраны спокойные разборы без рекламы марок: о зерне, оборудовании, расчётах, документах и ассортименте.",
      "Требования законов и стандартов в статьях названы вместе с документом, например ГОСТ или постановление Правительства, чтобы их было легко найти в официальном тексте. Цитаты экспертов взяты из опубликованных интервью и книг, источник подписан под каждой цитатой.",
      "Числа в расчётах – учебные примеры: они помечены словом «например» и показывают способ подсчёта, а не цены рынка. Кофейни из атласа не связаны с АудиоЛадом, их названия принадлежат владельцам.",
    ],
    reservedVenuePath: "/b/cafe",
  },
  {
    id: "restaurants",
    status: "planned",
    path: "/b/restaurant-guides",
    title: "Музыка для ресторанов",
    kicker: "АудиоЛад Бизнес",
    intro: "Раздел ещё не открыт.",
    reservedVenuePath: "/b/restaurants",
  },
  {
    id: "bars",
    status: "planned",
    path: "/b/bar-guides",
    title: "Музыка для баров",
    kicker: "АудиоЛад Бизнес",
    intro: "Раздел ещё не открыт.",
    reservedVenuePath: "/b/bars",
  },
  {
    id: "hotels",
    status: "planned",
    path: "/b/hotel-guides",
    title: "Музыка для отелей",
    kicker: "АудиоЛад Бизнес",
    intro: "Раздел ещё не открыт.",
    reservedVenuePath: "/b/hotels",
  },
];

export function getVertical(id: string): B2BVertical | null {
  return B2B_VERTICALS.find((item) => item.id === id) ?? null;
}

export function listActiveVerticals(): B2BVertical[] {
  return B2B_VERTICALS.filter((item) => item.status === "active");
}

export function verticalPathConflicts(path: string): boolean {
  const normalized = path.replace(/\/$/, "");
  return RESERVED_B_PATHS.some(
    (reserved) => normalized === reserved || normalized.startsWith(`${reserved}/`),
  );
}
