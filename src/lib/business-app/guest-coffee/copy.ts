/**
 * a8240527 — honest copy of the guest coffee cabinet. Terms come from the same source as
 * the atlas offer (799 ₽/month, first 7 days free) so they can never drift apart.
 */
import { COFFEE_ATLAS_CANONICAL, COFFEE_ATLAS_OFFER } from "@/lib/business/coffee-atlas/constants";
import { BUSINESS_INQUIRY_EMAIL } from "@/lib/business/landing";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

export const GUEST_COFFEE_ATLAS_URL = COFFEE_ATLAS_CANONICAL;
export const GUEST_COFFEE_RIGHTS_URL = `${PRODUCTION_APP_ORIGIN}${COFFEE_ATLAS_OFFER.rightsHref}`;
export const GUEST_COFFEE_INQUIRY_EMAIL = BUSINESS_INQUIRY_EMAIL;

/** "799 ₽" with a no-break space so the price never wraps. */
export const GUEST_COFFEE_PRICE = COFFEE_ATLAS_OFFER.price.replace(/ /g, "\u00a0");
export const GUEST_COFFEE_TERMS = `Первые 7 дней – в подарок, затем ${GUEST_COFFEE_PRICE} в месяц`;

export const GUEST_COFFEE_COPY = {
  title: "Настройте звучание вашей кофейни",
  lead: "Без регистрации. Выберите характер заведения, музыкальное направление и время суток – и сразу слушайте настоящие подборки из каталога АудиоЛада.",
  limitNote: "В гостевом режиме доступно 30 минут прослушивания.",
  nearEnd:
    "Гостевое прослушивание скоро подойдёт к концу. Чтобы музыка звучала в кофейне без ограничений, подключите АудиоЛад Бизнес.",
  lastTrack: "Гостевое прослушивание подошло к концу – этот трек доиграет до конца.",
  exhaustedTitle: "Гостевое прослушивание завершено",
  exhaustedText:
    "Вы прослушали 30 минут музыки в гостевом режиме. Настройки и подборки остаются доступны для просмотра. Чтобы музыка звучала в кофейне каждый день, подключите АудиоЛад Бизнес.",
  unavailable: "Гостевое прослушивание временно недоступно. Попробуйте, пожалуйста, позже.",
  emptyShelf: "Подборки для кофеен сейчас не загрузились. Обновите страницу чуть позже – мы показываем только настоящие треки каталога.",
  directionFallback: "Для этого направления пока нет подборок – показываем самые близкие.",
  evaluationOnly:
    "Гостевой режим – для оценки звучания. Он не даёт права на публичное воспроизведение музыки в заведении.",
  shelfSource: "Подборки – альбомы из каталога АудиоЛада, отобранные для кофеен.",
  connectTitle: "Подключение АудиоЛад Бизнес",
  connectStage:
    "Онлайн-подключение откроется на следующем этапе. Сейчас здесь нельзя зарегистрироваться, начать пробный период или оплатить – ничего не списывается.",
  connectContact: "Хотите подключиться раньше – напишите нам:",
} as const;
