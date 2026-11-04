/**
 * a8240527 – honest copy of the guest coffee cabinet. Terms come from the same source as
 * the atlas offer (plan price, BUSINESS_GIFT_TITLE) so they can never drift apart.
 */
import { BUSINESS_GIFT_TITLE } from "@/lib/access-grants/copy";
import { COFFEE_ATLAS_CANONICAL, COFFEE_ATLAS_OFFER } from "@/lib/business/coffee-atlas/constants";
import { BUSINESS_INQUIRY_EMAIL } from "@/lib/business/landing";
import { PRODUCTION_APP_ORIGIN } from "@/lib/seo/app-origin";
import { BUSINESS_GIFT_DAYS } from "@/lib/business/plan";

export const GUEST_COFFEE_ATLAS_URL = COFFEE_ATLAS_CANONICAL;
export const GUEST_COFFEE_RIGHTS_URL = `${PRODUCTION_APP_ORIGIN}${COFFEE_ATLAS_OFFER.rightsHref}`;
export const GUEST_COFFEE_INQUIRY_EMAIL = BUSINESS_INQUIRY_EMAIL;

/** "799 ₽" with a no-break space so the price never wraps. */
export const GUEST_COFFEE_PRICE = COFFEE_ATLAS_OFFER.price.replace(/ /g, "\u00a0");
/** Gift line, separate from the 30-minute guest preview. Trial opens the cabinet player with no minute cap. */
export const GUEST_COFFEE_TERMS = `${BUSINESS_GIFT_TITLE} – полный доступ ко всем функциям, затем ${GUEST_COFFEE_PRICE} за 30 дней`;

export const GUEST_COFFEE_COPY = {
  title: "Настройте звучание вашей кофейни",
  lead: "Выберите характер заведения, тип звучания и время суток, нажмите «Собрать атмосферу» – и слушайте готовую подборку прямо в кабинете АудиоЛад Бизнес.",
  /** Guest-only addition to the lead (members are already signed in). */
  leadGuest: "Без регистрации.",
  nearEnd:
    "Гостевое прослушивание скоро подойдёт к концу. Чтобы музыка звучала в кофейне без ограничений, подключите АудиоЛад Бизнес.",
  lastTrack: "Гостевое прослушивание подошло к концу – этот трек доиграет до конца.",
  exhaustedTitle: "Гостевое прослушивание завершено",
  /** Shown only after the guest meter hits zero. The top banner does not mention the 30 minutes before that. */
  exhaustedBanner:
    `Гостевые 30 минут закончились. Зарегистрируйтесь – и получите ${BUSINESS_GIFT_TITLE} с полным доступом.`,
  /**
   * 253821e0: the top banner and the «Ваша атмосфера» block after the meter when the no-registration guest start
   * is on. The guest start signs in anonymously and asks for no card (see BUSINESS_GUEST_START_COPY.terms).
   */
  exhaustedBannerGuestStart:
    `Пробные 30 минут закончились. Получите ${BUSINESS_GIFT_DAYS} дней бесплатно – без регистрации и карты.`,
  exhaustedRegister: "Зарегистрироваться",
  exhaustedTrialTitle: "Знакомство с подборками завершено",
  exhaustedTrialText:
    "30 минут знакомства с подборками на этом устройстве использованы. Чтобы музыка звучала в заведении, подключите кофейню – бесплатный доступ у вас уже есть.",
  exhaustedMember:
    "30 минут знакомства с подборками на этом устройстве использованы. Музыка в эфир кофейни идёт через плеер программы – только треки с подтверждёнными правами.",
  unavailable: "Гостевое прослушивание временно недоступно. Попробуйте, пожалуйста, позже.",
  emptyShelf: "Подборки для кофеен сейчас не загрузились. Обновите страницу чуть позже – мы показываем только настоящие треки каталога.",
  directionFallback: "Для этого типа звучания пока нет подходящих подборок – показываем самые близкие.",
  settingsSaved: "Настройки сохраняются на этом устройстве и останутся в кабинете после подключения кофейни.",
  /** Gift starts after email confirmation. Payment is not charged from this cabinet. */
  connectNote:
    `Подключение кофейни – в этом же кабинете. ${BUSINESS_GIFT_TITLE} начинаются после подтверждения почты. Оплата и автосписания пока не подключены – ничего не списывается.`,
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
