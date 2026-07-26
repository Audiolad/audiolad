export type AdminMoneyMetricKey =
  | "payments"
  | "buyers"
  | "gross"
  | "aov"
  | "repeatBuyers";

export const ADMIN_MONEY_METRIC_DICTIONARY: Record<
  AdminMoneyMetricKey,
  {
    label: string;
    kind: "payment" | "account" | "money";
    kindLabel: string;
    formula: string;
    hint: string;
  }
> = {
  payments: {
    label: "Успешные оплаты",
    kind: "payment",
    kindLabel: "payment count",
    formula: "count(payments where status=succeeded AND is_test=false)",
    hint: "Количество успешных платежей. Pending/failed/cancelled не входят. По умолчанию без тестовых.",
  },
  buyers: {
    label: "Покупатели",
    kind: "account",
    kindLabel: "unique account",
    formula: "count(distinct order.user_id) among succeeded non-test payments",
    hint: "Уникальные аккаунты с хотя бы одной успешной реальной оплатой в периоде.",
  },
  gross: {
    label: "Получено оплат",
    kind: "money",
    kindLabel: "money sum",
    formula: "sum(payments.amount_minor) where succeeded AND non-test",
    hint: "Валовая сумма успешных оплат по snapshot платежа. Не «чистая выручка»: возвраты, налог и комиссия провайдера пока не подключены.",
  },
  aov: {
    label: "Средний чек",
    kind: "money",
    kindLabel: "money ratio",
    formula: "gross_minor / payment_count",
    hint: "Средняя сумма одной успешной оплаты. При нуле оплат — «—».",
  },
  repeatBuyers: {
    label: "Повторные покупатели",
    kind: "account",
    kindLabel: "unique account",
    formula:
      "users with a succeeded payment in period who already had an earlier real succeeded payment",
    hint: "Покупатели периода, у которых первая успешная оплата была раньше начала периода. New/repeat не пересекаются.",
  },
};

export const ADMIN_MONEY_AUTHOR_GROSS_TOOLTIP =
  "Сумма оплат за продукты автора. Это не сумма выплаты автору.";

export const ADMIN_MONEY_REFUNDS_NOTE =
  "Возвраты подключены как отдельный слой фактов: «Получено оплат» остаётся валовой суммой и не уменьшается после возврата.";

export const ADMIN_MONEY_PROVIDER_FEES_NOTE = "Не подключено";

export type AdminRefundMetricKey =
  | "refunded"
  | "netCollected"
  | "providerFees"
  | "refundsPending"
  | "refundsRequiresReview";

export const ADMIN_REFUND_METRIC_DICTIONARY: Record<
  AdminRefundMetricKey,
  {
    label: string;
    kind: "money" | "payment";
    kindLabel: string;
    formula: string;
    hint: string;
  }
> = {
  refunded: {
    label: "Возвраты подтверждённые",
    kind: "money",
    kindLabel: "money sum",
    formula:
      "sum(payment_refunds.amount_minor) where status=succeeded AND confirmed_at in period",
    hint: "Сумма фактически подтверждённых возвратов за период. Методология «кассовая активность»: возврат попадает в тот период, когда он подтверждён, а не когда была оплата.",
  },
  netCollected: {
    label: "Чистые поступления",
    kind: "money",
    kindLabel: "money sum",
    formula: "gross_minor − refunded_minor",
    hint: "До комиссий и налогов. Комиссия провайдера и выплаты авторам пока не подключены.",
  },
  providerFees: {
    label: "Комиссия провайдера",
    kind: "money",
    kindLabel: "money sum",
    formula: "—",
    hint: "Комиссия эквайринга пока не подключена: данные от Точки не собираются.",
  },
  refundsPending: {
    label: "Возвраты в процессе",
    kind: "payment",
    kindLabel: "refund count",
    formula: "count(payment_refunds where status in requested/submitted/pending)",
    hint: "Возвраты, отправленные провайдеру и ещё не подтверждённые. Их сумма зарезервирована и недоступна для повторного возврата. Счётчик «на сейчас», а не за период.",
  },
  refundsRequiresReview: {
    label: "Требуют проверки",
    kind: "payment",
    kindLabel: "refund count",
    formula: "count(payment_refunds where status=requires_review)",
    hint: "Итог у провайдера неизвестен (таймаут, неоднозначный вебхук). Деньги остаются зарезервированными, пока оператор не сверит операцию в Точке.",
  },
};

export const ADMIN_REFUND_ACCESS_NOTE =
  "Возврат не отзывает доступ автоматически. Полный возврат помечается как «нужно решение по доступу» — отзыв выполняется вручную.";

export const ADMIN_REFUND_REAL_MONEY_WARNING =
  "Будет отправлен реальный возврат через Точку";

export const ADMIN_REFUND_REASON_LABELS: Record<string, string> = {
  customer_request: "Запрос покупателя",
  duplicate_payment: "Дубль оплаты",
  content_unavailable: "Контент недоступен",
  quality_complaint: "Претензия к качеству",
  payment_error: "Ошибка оплаты",
  chargeback_prevention: "Предотвращение чарджбэка",
  other: "Другое",
};

export const ADMIN_REFUND_STATUS_LABELS: Record<string, string> = {
  requested: "Запрошен",
  submitted: "Отправлен",
  pending: "В обработке",
  succeeded: "Подтверждён",
  failed: "Отклонён",
  cancelled: "Отменён",
  requires_review: "Требует проверки",
};

export const ADMIN_MONEY_FUNNEL_NOTE =
  "Наблюдательная воронка: этапы имеют разные типы сущностей (event / order / payment / entitlement) и не образуют строгую person-path attribution.";
