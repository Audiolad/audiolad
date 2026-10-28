import { formatBusinessMonthlyPrice } from "@/lib/business/plan";

/** Unified phrase for the landing, registration and cabinet (task 1e008ee8). */
export const BUSINESS_GIFT_TITLE = "30 дней в подарок";

/** Guest demo CTA (task ba344b7f). Visible before and after the 30-minute limit. */
export const BUSINESS_GIFT_CTA = "Получить 30 дней бесплатно";

export const BUSINESS_SIGN_UP_INTRO =
  "30 дней в подарок для АудиоЛад Бизнес. Карта не нужна, ничего не списывается. После подтверждения почты откроется кабинет, и в нём будет дата окончания.";

export const BUSINESS_SIGN_IN_INTRO =
  "Войдите, чтобы открыть кабинет АудиоЛад Бизнес. 30 дней в подарок даются один раз на адрес: повторная регистрация период не обновляет.";

export const BUSINESS_PAYMENT_RETURN_SIGN_IN_INTRO =
  "Войдите, чтобы вернуться в кабинет АудиоЛад Бизнес.";

export const BUSINESS_REGISTERED_NOTE =
  "Регистрация прошла успешно. Подтвердите адрес по письму и войдите: кабинет откроется с периодом «30 дней в подарок».";

/** One short line on the gift card while the 30 days are still running. */
export const BUSINESS_GIFT_CLOSING_NOTE =
  "После срока плеер закрыт до оплаты.";

/** Owner wording, 2026-10-28: the 30 gift days include the venue's music rights and licence. */
export const BUSINESS_GIFT_LICENSE_NOTE =
  "В 30 подарочных дней входят все права и лицензия на музыку для вашего заведения.";

/** Same price line on the cabinet home card and the email-confirmation screen. */
export function businessGiftPriceNote(): string {
  return `${formatBusinessMonthlyPrice()} за 30 дней, картой или по СБП. Автосписания нет.`;
}

export const BUSINESS_WORKSPACE_AUTOPLAY_NOTE =
  "Музыка включается после нажатия на круглую кнопку. Громкость и место в подборке сохраняются.";

export const BUSINESS_EMPTY_CATALOG_NOTE =
  "Подборка в этом направлении готовится – музыка появится здесь автоматически.";

export const BUSINESS_CONNECT_VENUE_NOTE =
  "Чтобы в кабинете играла музыка, подключите точку. Это занимает около минуты, карта не нужна.";

export const BUSINESS_CONNECT_VENUE_CTA = "Подключить точку";

export const BUSINESS_SUBSCRIPTION_NOTE =
  "Музыка остановлена. Кабинет и настройки сохранены. Оплата – 30 дней, картой или по СБП, без автосписания.";

export const BUSINESS_UNCONFIRMED_NOTE =
  "Сначала подтвердите адрес по письму. Пока письмо не подтверждено, 30 дней в подарок не начинаются и полный плеер закрыт.";

export const BUSINESS_SPACE_CLOSED_NOTE =
  "Это направление пока закрыто. Сейчас открыто только «Кафе, рестораны и отели».";

export const BUSINESS_STORE_UNAVAILABLE_NOTE =
  "Кабинет временно не открыл подарочный период. Ничего не списано. Данные, которые уже были сохранены, на месте.";
