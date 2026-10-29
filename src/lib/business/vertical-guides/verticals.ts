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
    title: "Музыка для кофейни",
    byline: "АудиоЛад Кофейни",
    kicker: "АудиоЛад Бизнес",
    intro:
      "Раздел для тех, кто уже держит кофейню или готовится её открыть. Здесь практичные материалы о повседневной работе кофейни: зерно, гости, атмосфера зала.",
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
