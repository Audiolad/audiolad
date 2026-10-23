import { STUDIO_GUEST_MAX_PROJECTS } from "@/lib/studio/guest-constants";
import {
  MAX_STUDIO_ASSET_BYTES,
  MAX_STUDIO_AUDIO_DURATION_SECONDS,
  MAX_STUDIO_PROJECT_BYTES,
  MAX_STUDIO_PROJECT_TIMELINE_SECONDS,
  MAX_STUDIO_TRACKS,
} from "@/lib/studio/limits";

import { BUSINESS_PLAN_PERIOD_LABEL } from "@/lib/business/plan";

/** Unified phrase for the landing, registration and cabinet (task 1e008ee8). */
export const BUSINESS_GIFT_TITLE = "30 дней в подарок";

/** Guest demo CTA (task ba344b7f). Visible before and after the 30-minute limit. */
export const BUSINESS_GIFT_CTA = "Получить 30 дней бесплатно";

export const BUSINESS_SIGN_UP_INTRO =
  "30 дней в подарок для АудиоЛад Бизнес. Карта не нужна, ничего не списывается. После подтверждения почты откроется кабинет, и в нём будет дата окончания.";

export const BUSINESS_SIGN_IN_INTRO =
  "Войдите, чтобы открыть кабинет АудиоЛад Бизнес. 30 дней в подарок даются один раз на адрес: повторная регистрация период не обновляет.";

export const BUSINESS_REGISTERED_NOTE =
  "Регистрация прошла успешно. Подтвердите адрес по письму и войдите: кабинет откроется с периодом «30 дней в подарок».";

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));
const hours = (seconds: number) => Math.round(seconds / 3600);

/**
 * The gift is the business music workspace, not unlimited Studio AI.
 * Numbers come from the existing Studio limits.
 */
export function businessGiftRulesText(): string {
  return [
    `${BUSINESS_GIFT_TITLE}: один раз на подтверждённый адрес, без карты и без автосписания.`,
    "После даты окончания полный плеер закрывается, вход и данные кабинета остаются.",
    `Дальше подписка добровольная, ${BUSINESS_PLAN_PERIOD_LABEL}. Если её не оформлять, списаний нет.`,
    `Генерация музыки в Студии в подарок не входит и не становится безлимитной. Пределы Студии: дорожка до ${hours(MAX_STUDIO_AUDIO_DURATION_SECONDS)} часов и ${mb(MAX_STUDIO_ASSET_BYTES)} МБ, проект до ${hours(MAX_STUDIO_PROJECT_TIMELINE_SECONDS)} часов, ${MAX_STUDIO_TRACKS} дорожек и ${mb(MAX_STUDIO_PROJECT_BYTES)} МБ. Гостевой проект Студии – не больше ${STUDIO_GUEST_MAX_PROJECTS}.`,
    "Музыка в кабинете начинается только после нажатия «Играть».",
  ].join(" ");
}

export const BUSINESS_WORKSPACE_AUTOPLAY_NOTE =
  "Музыка не включается сама: нажмите «Играть». Громкость и место в подборке сохраняются в этом браузере и в кабинете, когда связь есть.";

export const BUSINESS_EMPTY_CATALOG_NOTE =
  "Подборка в этом направлении готовится – музыка появится здесь автоматически.";

export const BUSINESS_SUBSCRIPTION_NOTE =
  "Полный плеер закрыт. Подписка добровольная: онлайн-оформление ничего не списывает, пока оплата не подключена отдельно. Подборка и настройки кабинета сохранены.";

export const BUSINESS_UNCONFIRMED_NOTE =
  "Сначала подтвердите адрес по письму. Пока письмо не подтверждено, 30 дней в подарок не начинаются и полный плеер закрыт.";

export const BUSINESS_SPACE_CLOSED_NOTE =
  "Это направление пока закрыто. Сейчас открыто только «Кафе, рестораны и отели».";

export const BUSINESS_STORE_UNAVAILABLE_NOTE =
  "Кабинет временно не открыл подарочный период. Ничего не списано. Данные, которые уже были сохранены, на месте.";
