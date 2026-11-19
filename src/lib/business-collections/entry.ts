/**
 * Wording and routing of the personal-link entry screen (t1616u–t1618u). Pure, browser-safe.
 * No gift, price, days or «Подключить» here: the visitor first looks and listens.
 */
export const COLLECTION_ENTRY_COPY = {
  eyebrow: "Подборка для вашего заведения",
  lead: "Откройте приложение АудиоЛад Кофейня – в музыке будет только эта подборка. Регистрация не нужна.",
  open: "Открыть приложение",
  loading: "Открываем приложение…",
  retry: "Попробовать ещё раз",
  acceptance: "Принимаю договор-оферту и политику обработки персональных данных",
  failed: "Не получилось открыть приложение. Попробуйте ещё раз.",
  limit: "С этой сети сегодня уже открывали приложение несколько раз. Попробуйте завтра.",
  full: "По этой ссылке приложение уже открыто на всех местах. Напишите нам – пришлём новую ссылку.",
  unavailableTitle: "Подборка сейчас недоступна",
  unavailableText: "Ссылка больше не действует. Напишите нам – пришлём новую.",
  gone: "Подборка сейчас недоступна. Напишите нам – пришлём новую ссылку.",
} as const;

/** Sent by the entry screen: the guest start then fails closed for the collection. */
export const COLLECTION_ENTRY_HEADER = "x-audiolad-collection-entry";

/** The ordinary guest start answers /cabinet on coffee; the personal link opens the music first. */
export function collectionEntryDestination(url: string): string {
  return url === "/cabinet" || url === "/" ? "/music" : url;
}
