/**
 * a8240527 – honest copy of the guest coffee cabinet. Terms come from the same source as
 * the atlas offer (plan price, 30 дней в подарок) so they can never drift apart.
 */
import { BUSINESS_GIFT_TITLE } from "@/lib/access-grants/copy";
import { COFFEE_ATLAS_CANONICAL, COFFEE_ATLAS_OFFER } from "@/lib/business/coffee-atlas/constants";
import { BUSINESS_INQUIRY_EMAIL } from "@/lib/business/landing";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";

export const GUEST_COFFEE_ATLAS_URL = COFFEE_ATLAS_CANONICAL;
export const GUEST_COFFEE_RIGHTS_URL = `${PRODUCTION_APP_ORIGIN}${COFFEE_ATLAS_OFFER.rightsHref}`;
export const GUEST_COFFEE_INQUIRY_EMAIL = BUSINESS_INQUIRY_EMAIL;

/** "799 ₽" with a no-break space so the price never wraps. */
export const GUEST_COFFEE_PRICE = COFFEE_ATLAS_OFFER.price.replace(/ /g, "\u00a0");
/** Gift line, separate from the 30-minute guest preview. Trial opens the cabinet player with no minute cap. */
export const GUEST_COFFEE_TERMS = `${BUSINESS_GIFT_TITLE} – полный доступ ко всем функциям, затем ${GUEST_COFFEE_PRICE} в месяц`;

export const GUEST_COFFEE_COPY = {
  title: "Настройте звучание вашей кофейни",
  lead: "Выберите характер заведения, тип звучания и время суток, нажмите «Собрать атмосферу» – и слушайте готовую подборку прямо в кабинете АудиоЛад Бизнес.",
  /** Guest-only addition to the lead (members are already signed in). */
  leadGuest: "Без регистрации.",
  limitNote: "30 минут прослушивания без регистрации.",
  nearEnd:
    "Гостевое прослушивание скоро подойдёт к концу. Чтобы музыка звучала в кофейне без ограничений, подключите АудиоЛад Бизнес.",
  nearEndShort: "Гостевое прослушивание скоро подойдёт к концу.",
  lastTrack: "Гостевое прослушивание подошло к концу – этот трек доиграет до конца.",
  exhaustedTitle: "Гостевое прослушивание завершено",
  exhaustedText:
    "Вы прослушали 30 минут музыки в гостевом режиме. Настройки и подборки остаются доступны для просмотра. Чтобы музыка звучала в кофейне каждый день, подключите АудиоЛад Бизнес.",
  exhaustedTrialTitle: "Знакомство с подборками завершено",
  exhaustedTrialText:
    "30 минут знакомства с подборками на этом устройстве использованы. Чтобы музыка звучала в заведении, подключите точку – бесплатный доступ у вас уже есть.",
  exhaustedMember:
    "30 минут знакомства с подборками на этом устройстве использованы. Музыка в эфир точки идёт через плеер программы – только треки с подтверждёнными правами.",
  unavailable: "Гостевое прослушивание временно недоступно. Попробуйте, пожалуйста, позже.",
  emptyShelf: "Подборки для кофеен сейчас не загрузились. Обновите страницу чуть позже – мы показываем только настоящие треки каталога.",
  directionFallback: "Для этого типа звучания пока нет подходящих подборок – показываем самые близкие.",
  evaluationOnly:
    "Гостевой режим – для оценки звучания. Он не даёт права на публичное воспроизведение музыки в заведении.",
  shelfSource:
    "Подборки – бесплатные публичные альбомы каталога АудиоЛада для знакомства со звучанием. Это не каталог эфира: в заведении звучат только треки с подтверждёнными для бизнеса правами.",
  settingsSaved: "Настройки сохраняются на этом устройстве и останутся в кабинете после подключения точки.",
  /** Gift starts after email confirmation. Payment is not charged from this cabinet. */
  connectNote:
    "Подключение точки – в этом же кабинете. 30 дней в подарок начинаются после подтверждения почты. Оплата и автосписания пока не подключены – ничего не списывается.",
  connectContact: "Вопросы о подключении – напишите нам:",
} as const;

/**
 * a8240527 (Sergey 17.10.2026 23:21): the explicit «Собрать атмосферу» step. The result is
 * ONE playlist assembled from real tracks of the curated free albums; the match is stated
 * honestly per album, without technical passport details.
 */
export const GUEST_COFFEE_ATMOSPHERE_COPY = {
  assemble: "Собрать атмосферу",
  reassemble: "Пересобрать атмосферу",
  assembled: "Атмосфера собрана",
  assembling: "Собираем…",
  assemblingTitle: "Собираем вашу атмосферу",
  resultsTitle: "Ваша атмосфера",
  eyebrow: "Ваша атмосфера",
  settingsHint: "Выберите настройки и нажмите «Собрать атмосферу» – мы соберём одну готовую подборку под ваш выбор.",
  emptyTitle: "Здесь появится ваша атмосфера",
  emptyText:
    "Выберите характер заведения, тип звучания и время суток и нажмите «Собрать атмосферу». Мы соберём одну подборку из настоящих треков каталога АудиоЛада.",
  dirty: "Настройки изменились. Нажмите «Пересобрать атмосферу» – до этого подборка остаётся прежней.",
  stale: "Собрано для прежних настроек.",
  play: "Слушать атмосферу",
  matchTitle: "Что совпало с вашим выбором",
  matchNote: "Подбор учитывает звучание треков и описание альбомов каталога. Это подсказка – окончательно решает ваш слух.",
  sourcesTitle: "Собрано из альбомов",
  playerIdle: "Соберите атмосферу и нажмите «Слушать атмосферу» – музыка заиграет здесь.",
  playerReady: "Атмосфера собрана. Нажмите «Слушать атмосферу» или выберите трек.",
} as const;
