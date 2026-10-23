/**
 * One workspace is configured by business_space (task ba344b7f).
 * Four existing directions are modelled. Only the cafe space is enabled.
 */

export const BUSINESS_SPACE_IDS = ["cafe", "spa", "retail", "fitness"] as const;

export type BusinessSpaceId = (typeof BUSINESS_SPACE_IDS)[number];

export type BusinessSpace = {
  id: BusinessSpaceId;
  title: string;
  enabled: boolean;
};

export const BUSINESS_SPACES: readonly BusinessSpace[] = [
  { id: "cafe", title: "Кафе, рестораны и отели", enabled: true },
  { id: "spa", title: "SPA и расслабление", enabled: false },
  { id: "retail", title: "Магазины и салоны красоты", enabled: false },
  { id: "fitness", title: "Фитнес и активность", enabled: false },
];

export function isBusinessSpaceId(value: string | null | undefined): value is BusinessSpaceId {
  return (BUSINESS_SPACE_IDS as readonly string[]).includes(value ?? "");
}

export function resolveBusinessSpace(value: string | null | undefined): BusinessSpace {
  const id = isBusinessSpaceId(value) ? value : "cafe";
  return BUSINESS_SPACES.find((space) => space.id === id) ?? BUSINESS_SPACES[0];
}
