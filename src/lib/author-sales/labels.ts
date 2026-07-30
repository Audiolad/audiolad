import type { AuthorSaleAccrualStatus, AuthorSalePayoutStatus } from "./types";

export const AUTHOR_SALES_SECTION_TITLE = "Продажи";

export const AUTHOR_SALES_SECTION_SUBTITLE =
  "Подтверждённые покупки ваших продуктов и статус начислений";

export const AUTHOR_SALES_EMPTY =
  "Подтверждённых продаж пока нет. Здесь появятся покупки после успешной оплаты.";

export const AUTHOR_SALES_METRIC_LABELS = {
  gross_purchases: "Покупки",
  refund_sales: "Возвраты",
  net_sales: "Чистые продажи",
  view_to_purchase: "Конверсия в покупку",
} as const;

export function getAuthorSaleAccrualStatusLabel(
  status: AuthorSaleAccrualStatus | string,
): string {
  switch (status) {
    case "accrued":
      return "Начислено";
    case "pending":
      return "Начисление обрабатывается";
    case "requires_review":
      return "Требуется проверка";
    case "failed":
      return "Требуется проверка";
    case "not_applicable":
      return "Без начисления";
    case "refunded":
      return "Возвращено";
    default:
      return "Требуется проверка";
  }
}

export function getAuthorSalePayoutStatusLabel(
  status: AuthorSalePayoutStatus | string | null | undefined,
): string {
  switch (status) {
    case "held":
      return "Удерживается";
    case "available":
      return "Доступно к выплате";
    case "reserved":
      return "Зарезервировано";
    case "paid":
      return "Выплачено";
    case "refunded":
      return "Возвращено";
    default:
      return "—";
  }
}

export const AUTHOR_SALES_CSV_COLUMNS = [
  "Дата оплаты",
  "Время оплаты",
  "Продукт",
  "Имя покупателя",
  "Фамилия покупателя",
  "Стоимость, ₽",
  "Возвращено, ₽",
  "Итоговая сумма, ₽",
  "Статус возврата",
  "Начисление автору, ₽",
  "Статус начисления",
  "Статус выплаты",
  "Идентификатор продажи",
] as const;

export function getAuthorSaleRefundStatusLabel(
  status: "none" | "partial" | "full",
): string {
  switch (status) {
    case "partial":
      return "Частичный возврат";
    case "full":
      return "Возвращено";
    default:
      return "Без возврата";
  }
}

export const AUTHOR_SALES_PRIVACY_NOTE =
  "В списке продаж отображаются только имя и фамилия покупателя. Email, телефон и платёжные данные недоступны.";
