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
  "Возвраты пока не подключены к аналитике.";

export const ADMIN_MONEY_FUNNEL_NOTE =
  "Наблюдательная воронка: этапы имеют разные типы сущностей (event / order / payment / entitlement) и не образуют строгую person-path attribution.";
