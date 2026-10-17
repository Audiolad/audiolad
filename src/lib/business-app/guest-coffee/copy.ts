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
  lead: "Выберите характер заведения, музыкальное направление и время суток, нажмите «Собрать атмосферу» – и слушайте готовую подборку прямо в кабинете АудиоЛад Бизнес.",
  /** Guest-only addition to the lead (members are already signed in). */
  leadGuest: "Без регистрации.",
  limitNote: "В гостевом режиме доступно 30 минут прослушивания.",
  nearEnd:
    "Гостевое прослушивание скоро подойдёт к концу. Чтобы музыка звучала в кофейне без ограничений, подключите АудиоЛад Бизнес.",
  nearEndShort: "Гостевое прослушивание скоро подойдёт к концу.",
  lastTrack: "Гостевое прослушивание подошло к концу – этот трек доиграет до конца.",
  exhaustedTitle: "Гостевое прослушивание завершено",
  exhaustedText:
    "Вы прослушали 30 минут музыки в гостевом режиме. Настройки и подборки остаются доступны для просмотра. Чтобы музыка звучала в кофейне каждый день, подключите АудиоЛад Бизнес.",
  exhaustedMember:
    "30 минут знакомства с подборками на этом устройстве использованы. Музыка в эфир точки идёт через плеер программы – только треки с подтверждёнными правами.",
  unavailable: "Гостевое прослушивание временно недоступно. Попробуйте, пожалуйста, позже.",
  emptyShelf: "Подборки для кофеен сейчас не загрузились. Обновите страницу чуть позже – мы показываем только настоящие треки каталога.",
  directionFallback: "Для этого направления пока нет подборок – показываем самые близкие.",
  evaluationOnly:
    "Гостевой режим – для оценки звучания. Он не даёт права на публичное воспроизведение музыки в заведении.",
  shelfSource:
    "Подборки – бесплатные публичные альбомы каталога АудиоЛада для знакомства со звучанием. Это не каталог эфира: в заведении звучат только треки с подтверждёнными для бизнеса правами.",
  settingsSaved: "Настройки сохраняются на этом устройстве и останутся в кабинете после подключения точки.",
  /** Honest state of the conversion path (phase 1): no online trial activation or payment yet. */
  connectNote:
    "Подключение – в этом же кабинете: вход в аккаунт АудиоЛада и создание точки. Онлайн-активация 7 дней в подарок и оплата пока не подключены – ничего не списывается.",
  connectContact: "Вопросы о подключении – напишите нам:",
} as const;

/**
 * a8240527 (Sergey 17.10.2026 23:21): the explicit «Собрать атмосферу» step. The result is
 * ONE playlist assembled from real tracks of the curated free albums; the match is stated
 * honestly (album-level tags, not per-track analysis).
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
    "Выберите характер заведения, направление и время суток и нажмите «Собрать атмосферу». Мы соберём одну подборку из настоящих треков каталога АудиоЛада.",
  dirty: "Настройки изменились. Нажмите «Пересобрать атмосферу» – до этого подборка остаётся прежней.",
  stale: "Собрано для прежних настроек.",
  play: "Слушать атмосферу",
  matchTitle: "Что совпало с вашим выбором",
  matchNote: "Подбор – по описанию альбомов каталога, а не каждого трека отдельно.",
  sourcesTitle: "Собрано из альбомов",
  playerIdle: "Соберите атмосферу и нажмите «Слушать атмосферу» – музыка заиграет здесь.",
  playerReady: "Атмосфера собрана. Нажмите «Слушать атмосферу» или выберите трек.",
} as const;
