/**
 * Card colours of the ten atlas shops for the «10 кофеен» banner of a guide.
 * Copied from the shop themes in src/components/business/coffee-atlas/coffee-atlas.css
 * (that stylesheet is loaded only on atlas pages). Keep the two in sync.
 */
export type AtlasCardTheme = {
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  accentInk: string;
};

const LIGHT_ACCENT_INK = "#ffffff";

export const ATLAS_CARD_THEMES: Readonly<Record<string, AtlasCardTheme>> = {
  "caffe-florian": { surface: "#fffaf2", ink: "#2e1712", muted: "#6e4f45", accent: "#7d1f27", accentInk: LIGHT_ACCENT_INK },
  "cafe-de-flore": { surface: "#fffdf6", ink: "#1e2a22", muted: "#56645a", accent: "#2f5b46", accentInk: LIGHT_ACCENT_INK },
  "coffee-collective": { surface: "#ffffff", ink: "#22201d", muted: "#6c6862", accent: "#3d3a35", accentInk: LIGHT_ACCENT_INK },
  "fuglen-tokyo": { surface: "#fff8f0", ink: "#2c2018", muted: "#6f5b4c", accent: "#b2382f", accentInk: LIGHT_ACCENT_INK },
  "starbucks-reserve-shanghai": { surface: "#211d19", ink: "#f3e7d6", muted: "#c3ae94", accent: "#c7834a", accentInk: "#160f09" },
  "cafe-tortoni": { surface: "#fbf4e8", ink: "#2a1a10", muted: "#6a5242", accent: "#8e1f22", accentInk: LIGHT_ACCENT_INK },
  "cafe-san-alberto": { surface: "#fffaf0", ink: "#33210f", muted: "#735b40", accent: "#b6336f", accentInk: LIGHT_ACCENT_INK },
  "truth-coffee-roasting": { surface: "#26211c", ink: "#efe2cf", muted: "#bba68b", accent: "#b8733a", accentInk: "#140e09" },
  "single-o-surry-hills": { surface: "#ffffff", ink: "#141414", muted: "#575757", accent: "#121212", accentInk: LIGHT_ACCENT_INK },
  "la-colombe": { surface: "#fbf8f3", ink: "#1b1f26", muted: "#5a5f68", accent: "#1f2a38", accentInk: LIGHT_ACCENT_INK },
};

export const DEFAULT_ATLAS_CARD_THEME: AtlasCardTheme = ATLAS_CARD_THEMES["caffe-florian"]!;

/**
 * Russian spelling of the atlas shop names for the guide banner. Guide pages print no Latin
 * text (owner rule, 2026-10-29); the atlas pages themselves keep the original names.
 */
export const ATLAS_CARD_NAMES_RU: Readonly<Record<string, string>> = {
  "caffe-florian": "Кафе «Флориан»",
  "cafe-de-flore": "Кафе «Де Флор»",
  "coffee-collective": "«Кофи Коллектив»",
  "fuglen-tokyo": "«Фуглен Токио»",
  "starbucks-reserve-shanghai": "«Старбакс Резерв Ростери Шанхай»",
  "cafe-tortoni": "Кафе «Тортони»",
  "cafe-san-alberto": "Кафе «Сан-Альберто»",
  "truth-coffee-roasting": "«Трут Кофи Ростинг»",
  "single-o-surry-hills": "«Сингл О Сарри-Хиллз»",
  "la-colombe": "«Ла Коломб»",
};

const SOUND_TAG_RU: Readonly<Record<string, string>> = {
  "вечером – lounge-jazz": "вечером – лаунж-джаз",
  "nu-jazz": "ню-джаз",
  "Latin jazz": "латиноамериканский джаз",
  funk: "фанк",
  "neo-soul": "неосоул",
  "jazz-funk": "джаз-фанк",
  groove: "грув",
};

/** Sound tag as printed on a guide page: Russian only. */
export function atlasSoundTagRu(tag: string): string {
  return SOUND_TAG_RU[tag] ?? tag;
}
