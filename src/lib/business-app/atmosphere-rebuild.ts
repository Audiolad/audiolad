/**
 * «Пересобрать атмосферу» in the owner's «Управление кофейней» (Sergey 04.11.2026).
 * The owner built the atmosphere once (demo / first setup) and then only had «больше / меньше».
 * The rebuild reuses the same 4 × 4 builder (BusinessSoundSettings inside BusinessPlayerSettings),
 * the same save RPC and the same queue rebuild; this file only holds the copy. Pure / browser-safe.
 * En dash only.
 */
import {
  GUEST_COFFEE_CHARACTERS,
  GUEST_COFFEE_DIRECTIONS,
  type GuestCoffeeProfile,
} from "@/lib/business-app/guest-coffee/catalog";

export const ATMOSPHERE_REBUILD_LABEL = "Пересобрать атмосферу";

export const ATMOSPHERE_REBUILD_HINT =
  "Выберите характер заведения и тип звучания заново – музыка в зале соберётся по новым ответам.";

export const ATMOSPHERE_REBUILD_DONE = "Атмосфера пересобрана";

export const ATMOSPHERE_REBUILD_DONE_NOTE = "В кофейне новая подборка начнётся со следующего трека – текущий трек доиграет.";

/** «Уютная, Джаз» – the two choices that make the venue playlist. */
export function atmosphereChoiceLabel(profile: Pick<GuestCoffeeProfile, "character" | "direction">): string {
  const character = GUEST_COFFEE_CHARACTERS.find((item) => item.id === profile.character)?.label;
  const direction = GUEST_COFFEE_DIRECTIONS.find((item) => item.id === profile.direction)?.label;
  return [character, direction].filter(Boolean).join(", ");
}

/** What the owner sees before anything changes in the hall. */
export function atmosphereRebuildConfirmText(
  next: Pick<GuestCoffeeProfile, "character" | "direction">,
  current: Pick<GuestCoffeeProfile, "character" | "direction"> | null,
): string {
  const was = current ? ` (сейчас: ${atmosphereChoiceLabel(current)})` : "";
  return `Пересобрать атмосферу? Текущая подборка${was} заменится новой: ${atmosphereChoiceLabel(next)}. В зале она начнётся со следующего трека, музыка не прервётся.`;
}
