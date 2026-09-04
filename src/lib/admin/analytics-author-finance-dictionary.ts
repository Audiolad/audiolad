/**
 * Wording for the author economy panel (P3.3.2).
 *
 * Every hint has to survive being read out loud in a payout dispute, so it
 * says what the number is *made of* rather than what it is called.
 */

export type AdminAuthorFinanceTermDefinition = {
  label: string;
  kind: "money" | "count" | "rate" | "status";
  formula: string;
  hint: string;
};

export const ADMIN_AUTHOR_FINANCE_DICTIONARY: Record<
  string,
  AdminAuthorFinanceTermDefinition
> = {
  gross: {
    label: "Получено оплат (P3.1)",
    kind: "money",
    formula: "sum(payments.amount_minor where status=succeeded)",
    hint: "Валовая сумма по методологии P3.1. Слой авторов её не переопределяет и не меняет.",
  },
  accrued: {
    label: "Начислено авторам",
    kind: "money",
    formula: "floor(payment.amount_minor × author_share_bps / 10000)",
    hint: "Сумма начислений по подтверждённым оплатам. Считается целочисленно в копейках; доли копейки округляются в пользу автора, доля платформы — остаток.",
  },
  reversed: {
    label: "Сторнировано",
    kind: "money",
    formula: "−(начислено − floor((оплата − возвраты) × bps / 10000))",
    hint: "Сторно считается накопительно от фактически оплаченной суммы, поэтому несколько частичных возвратов в любом порядке дают один и тот же итог.",
  },
  adjustments: {
    label: "Ручные корректировки",
    kind: "money",
    formula: "sum(author_ledger_entries where entry_type in (manual_credit, manual_debit, correction))",
    hint: "Реестр только дополняется: исправление ошибки — это новая компенсирующая запись с причиной, а не правка истории.",
  },
  netEntitlement: {
    label: "Обязательство перед авторами",
    kind: "money",
    formula: "начислено + сторно + корректировки",
    hint: "Сколько платформа должна авторам по реестру. Это не остаток к выплате: часть суммы может сохраняться.",
  },
  platformShare: {
    label: "Доля платформы",
    kind: "money",
    formula: "получено − (начислено + сторно)",
    hint: "До комиссий эквайринга и налогов — они пока не подключены.",
  },
  held: {
    label: "Сохраняется",
    kind: "money",
    formula: "сумма позиций, где available_at > сейчас",
    hint: "Период сохранения считается по оплате: available_at = дата подтверждения + hold_days. Сторно попадает в ту же корзину, что и начисление, которое оно отменяет.",
  },
  payable: {
    label: "Доступно к выплате",
    kind: "money",
    formula: "обязательство − сохраняется",
    hint: "Расчётная величина. Выплаты в P3.3.2 не подключены: ни одна сумма не отправляется в банк автоматически.",
  },
  shareBps: {
    label: "Доля автора",
    kind: "rate",
    formula: "author_share_bps / 100 %",
    hint: "Ставка берётся из утверждённых условий, действующих на момент подтверждения оплаты, и фиксируется в записи реестра навсегда.",
  },
  holdDays: {
    label: "Срок до доступности",
    kind: "count",
    formula: "hold_days",
    hint: "Дни от подтверждения оплаты до момента, когда начисление становится доступным к выплате. По умолчанию 14.",
  },
  obligations: {
    label: "Очередь обязательств",
    kind: "count",
    formula: "count(finance_obligations)",
    hint: "Оплата и доступ покупателя никогда не зависят от бухгалтерии: начисление ставится в очередь и обрабатывается отдельно. Записи «требуют проверки» ждут решения оператора.",
  },
};

export const ADMIN_AUTHOR_FINANCE_PAYOUT_CLASS_LABELS: Record<string, string> = {
  payout_eligible: "Внешний автор (выплаты)",
  platform_owned_heuristic: "Каталог платформы",
  commercial_pending: "Заявка на рассмотрении",
  suspended: "Приостановлен",
  terminated: "Расторгнут",
  free: "Бесплатный",
  unresolved_author: "Не определён",
};

export const ADMIN_AUTHOR_FINANCE_ENTRY_TYPE_LABELS: Record<string, string> = {
  sale_accrual: "Начисление",
  refund_reversal: "Сторно",
  manual_credit: "Ручное начисление",
  manual_debit: "Ручное списание",
  correction: "Корректировка",
};

export const ADMIN_AUTHOR_FINANCE_TERMS_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  approved: "Утверждены",
  superseded: "Заменены",
  cancelled: "Отменены",
};

export const ADMIN_AUTHOR_FINANCE_OBLIGATION_STATUS_LABELS: Record<
  string,
  string
> = {
  pending: "В очереди",
  processed: "Обработано",
  skipped: "Пропущено",
  requires_review: "Требует проверки",
  failed: "Ошибка",
};

export const ADMIN_AUTHOR_FINANCE_BLOCKER_LABELS: Record<string, string> = {
  payment_not_succeeded: "Оплата не подтверждена",
  author_snapshot_missing: "Нет привязки автора в заказе",
  author_not_payout_eligible: "Автор не получает выплаты",
  payout_profile_required: "Для выплаты сначала заполните реквизиты автора",
  no_active_terms: "Нет утверждённых условий",
  ambiguous_terms: "Несколько подходящих условий",
  platform_owned_no_payout: "Продукт платформы",
  no_sale_accrual: "Начисления не было",
};

export const ADMIN_AUTHOR_FINANCE_PAYOUTS_NOTE =
  "Выплаты, партии и банк в P3.3.2 не подключены: панель показывает обязательство по реестру, а не платёжное поручение.";

export const ADMIN_AUTHOR_FINANCE_ELIGIBILITY_NOTE =
  "Право на выплату — явное решение администратора. Коммерческий статус автора сам по себе его не даёт: текущий коммерческий каталог принадлежит платформе.";

export const ADMIN_AUTHOR_FINANCE_PRODUCT_OVERRIDE_NOTE =
  "Индивидуальная ставка на отдельный продукт не реализована: ставка задаётся только на уровне автора.";

export const ADMIN_AUTHOR_FINANCE_DRY_RUN_NOTE =
  "Предпросмотр только читает данные и ничего не записывает. Исторические начисления в P3.3.2 не создаются.";

export const ADMIN_AUTHOR_FINANCE_LEDGER_APPEND_ONLY_NOTE =
  "Реестр только дополняется: записи нельзя изменить или удалить, исправление оформляется отдельной корректировкой.";
