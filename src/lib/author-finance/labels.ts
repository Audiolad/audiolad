/**
 * P3.3.4 author-facing wording.
 *
 * Every sentence an author reads about their money lives here. The database
 * returns machine keys only, so a copy edit is a one-line change in one file
 * and never a migration.
 *
 * Tone rules that these strings follow, and that a future edit should keep:
 *   - an author is told what is true and what happens next, never why an
 *     operator decided something internally;
 *   - a delay is described as a delay, not as a failure of the author;
 *   - nothing here promises a date the platform has not committed to.
 */

import type {
  AuthorFinanceAmountState,
  AuthorFinanceDisplayTypeKey,
  AuthorFinanceEmptyStateCode,
  AuthorFinanceIntegrityStatus,
  AuthorFinancePayoutStatusKey,
  AuthorFinancePeriod,
  AuthorFinanceTermsStatus,
} from "./types";

export const AUTHOR_FINANCE_SECTION_TITLE = "Продажи и финансы";
export const AUTHOR_FINANCE_SECTION_SUBTITLE =
  "Начисления, удержание и выплаты по вашим продуктам";

export const AUTHOR_FINANCE_KPI_LABELS = {
  accrued: "Начислено",
  held: "Удерживается",
  payable: "Доступно к будущей выплате",
  reserved: "Зарезервировано",
  paid: "Выплачено",
} as const;

export const AUTHOR_FINANCE_KPI_HINTS = {
  accrued: "Ваша доля со всех продаж за всё время.",
  held: "Деньги уже ваши, но ещё идёт период удержания.",
  payable: "Готово к включению в ближайшую выплату.",
  reserved: "Уже включено в выплату, которая готовится.",
  paid: "Переведено вам по завершённым выплатам.",
} as const;

export const AUTHOR_APPRECIATION_FINANCE_LABEL = "Благодарность от слушателя";
export const AUTHOR_APPRECIATION_ADMIN_LABEL = "Благодарность автору";
export const AUTHOR_APPRECIATION_SUMMARY_LABELS = {
  confirmedCount: "Количество подтверждённых",
  gross: "Общая сумма",
  authorAccrued: "Начислено вам",
  held: "Удерживается",
  available: "Доступно к выплате",
} as const;

const TYPE_LABELS: Record<AuthorFinanceDisplayTypeKey, string> = {
  sale: "Продажа",
  appreciation: AUTHOR_APPRECIATION_FINANCE_LABEL,
  refund: "Возврат покупателю",
  adjustment_credit: "Начисление вручную",
  adjustment_debit: "Списание вручную",
  correction: "Корректировка",
  chargeback: "Оспаривание платежа",
  payout: "Выплата",
  payout_reversal: "Отмена выплаты",
  other: "Операция",
};

export function getAuthorFinanceTypeLabel(
  key: AuthorFinanceDisplayTypeKey | string,
): string {
  return TYPE_LABELS[key as AuthorFinanceDisplayTypeKey] ?? TYPE_LABELS.other;
}

const AMOUNT_STATE_LABELS: Record<AuthorFinanceAmountState, string> = {
  held: "На удержании",
  available: "Доступно",
  reserved: "В выплате",
  paid: "Выплачено",
  adjustment: "Корректировка",
};

export function getAuthorFinanceAmountStateLabel(
  state: AuthorFinanceAmountState | string,
): string {
  return AMOUNT_STATE_LABELS[state as AuthorFinanceAmountState] ?? "—";
}

const PAYOUT_STATUS_LABELS: Record<
  AuthorFinancePayoutStatusKey | "unknown",
  string
> = {
  preparing: "Готовится",
  processing: "В переводе",
  paid: "Выплачено",
  delayed: "Перенесена",
  cancelled: "Отменена",
  on_review: "На проверке",
  reversed: "Возвращена",
  unknown: "—",
};

export function getAuthorFinancePayoutStatusLabel(
  key: AuthorFinancePayoutStatusKey | "unknown" | string,
): string {
  return (
    PAYOUT_STATUS_LABELS[key as AuthorFinancePayoutStatusKey] ??
    PAYOUT_STATUS_LABELS.unknown
  );
}

/**
 * What an author is told about a payout that is not simply "paid".
 *
 * "Перенесена" and "На проверке" deliberately say nothing about the cause: the
 * internal failure code and the operator's review note are not the author's to
 * read, and a half-explanation is worse than an honest "мы разбираемся".
 */
const PAYOUT_STATUS_MESSAGES: Record<
  AuthorFinancePayoutStatusKey | "unknown",
  string | null
> = {
  preparing: "Выплата сформирована и ожидает отправки.",
  processing: "Перевод отправлен. Обычно зачисление занимает несколько дней.",
  paid: null,
  delayed:
    "Перевод не прошёл с первого раза. Деньги остаются вашими и войдут в ближайшую выплату.",
  cancelled: "Выплата отменена. Сумма вернулась в доступный остаток.",
  on_review:
    "Выплата на проверке. Мы уточняем детали перевода — сумма остаётся за вами.",
  reversed: "Выплата возвращена. Сумма снова учитывается в вашем остатке.",
  unknown: null,
};

export function getAuthorFinancePayoutStatusMessage(
  key: AuthorFinancePayoutStatusKey | "unknown" | string,
): string | null {
  return (
    PAYOUT_STATUS_MESSAGES[key as AuthorFinancePayoutStatusKey] ??
    PAYOUT_STATUS_MESSAGES.unknown
  );
}

const TERMS_STATUS_LABELS: Record<AuthorFinanceTermsStatus, string> = {
  missing: "Условия не согласованы",
  active: "Условия действуют",
  ended: "Условия завершены",
};

export function getAuthorFinanceTermsStatusLabel(
  status: AuthorFinanceTermsStatus | string,
): string {
  return TERMS_STATUS_LABELS[status as AuthorFinanceTermsStatus] ?? "—";
}

export type AuthorFinanceEmptyStateCopy = {
  title: string;
  body: string;
};

const EMPTY_STATE_COPY: Record<
  AuthorFinanceEmptyStateCode,
  AuthorFinanceEmptyStateCopy
> = {
  not_payout_eligible_free: {
    title: "Выплаты пока не подключены",
    body: "Сейчас у вас бесплатный авторский аккаунт: продажи и выплаты не ведутся. Чтобы продавать материалы, оставьте заявку на коммерческое подключение.",
  },
  not_payout_eligible_pending: {
    title: "Заявка на коммерческое подключение рассматривается",
    body: "Мы смотрим вашу заявку. Как только подключение будет открыто и условия согласованы, начисления начнут появляться здесь.",
  },
  not_payout_eligible_commercial: {
    title: "Выплаты ещё не открыты",
    body: "Коммерческий доступ у вас есть, но выплаты автору по вашему пространству пока не включены. Мы свяжемся с вами, когда всё будет готово.",
  },
  commercial_onboarding_incomplete: {
    title: "Коммерческое подключение ещё не завершено",
    body: "Когда подключение будет завершено, начисления и выплаты появятся здесь.",
  },
  author_terms_required: {
    title: "Примите Авторские условия",
    body: "Примите Авторские условия, чтобы завершить коммерческое подключение и учитывать продажи в начислениях.",
  },
  access_suspended: {
    title: "Коммерческий доступ приостановлен",
    body: "Продажи и выплаты по этому пространству временно недоступны. Если нужна помощь — напишите в поддержку.",
  },
  access_terminated: {
    title: "Коммерческий доступ прекращён",
    body: "Продажи и выплаты по этому пространству больше не ведутся.",
  },
  terms_missing: {
    title: "Параметры расчёта ещё не заданы",
    body: "Доля и срок удержания для начислений пока не заданы платформой. Если продажа уже возможна, напишите в поддержку.",
  },
  no_sales: {
    title: "Пока нет продаж",
    body: "Здесь появятся начисления по каждой продаже ваших платных материалов.",
  },
  held_only: {
    title: "Деньги на удержании",
    body: "Начисления есть, но по ним ещё идёт период удержания. После его окончания сумма станет доступна к выплате.",
  },
  below_threshold: {
    title: "Сумма пока меньше минимальной",
    body: "Остаток переносится на следующий период. Выплата формируется, когда доступная сумма достигает 1000 ₽.",
  },
  reserved_in_progress: {
    title: "Выплата уже готовится",
    body: "Весь доступный остаток включён в выплату, которая сейчас формируется.",
  },
  has_paid_history: {
    title: "Всё выплачено",
    body: "Свободного остатка сейчас нет — все начисления уже переведены. История выплат ниже.",
  },
  active_ok: {
    title: "Готово к выплате",
    body: "Доступная сумма достигла минимума и войдёт в ближайшую выплату.",
  },
};

export function getAuthorFinanceEmptyStateCopy(
  code: AuthorFinanceEmptyStateCode | string,
): AuthorFinanceEmptyStateCopy {
  return (
    EMPTY_STATE_COPY[code as AuthorFinanceEmptyStateCode] ??
    EMPTY_STATE_COPY.no_sales
  );
}

/**
 * The `eligibility_message` key from the summary. It equals the empty-state
 * code except when the balance is negative, which outranks everything else.
 */
export function getAuthorFinanceEligibilityMessage(key: string): string {
  if (key === "negative_balance") {
    return AUTHOR_FINANCE_NEGATIVE_WARNING;
  }
  return getAuthorFinanceEmptyStateCopy(key).body;
}

export const AUTHOR_FINANCE_NEGATIVE_WARNING =
  "Сейчас баланс отрицательный: возвраты покупателям превысили начисления. Отрицательный остаток закроется следующими продажами, ничего возвращать не нужно.";

const INTEGRITY_MESSAGES: Record<AuthorFinanceIntegrityStatus, string | null> = {
  ok: null,
  processing: "Часть операций ещё обрабатывается — суммы могут измениться в ближайшее время.",
  review_required:
    "По вашему пространству идёт проверка расчётов. Мы всё перепроверим и вернёмся с результатом.",
  unavailable: "Данные временно недоступны. Попробуйте обновить страницу позже.",
};

export function getAuthorFinanceIntegrityMessage(
  status: AuthorFinanceIntegrityStatus | string,
): string | null {
  return INTEGRITY_MESSAGES[status as AuthorFinanceIntegrityStatus] ?? null;
}

const PERIOD_LABELS: Record<AuthorFinancePeriod, string> = {
  all: "За всё время",
  year: "Текущий год",
  prev_year: "Прошлый год",
  custom: "Свой период",
};

export function getAuthorFinancePeriodLabel(
  period: AuthorFinancePeriod | string,
): string {
  return PERIOD_LABELS[period as AuthorFinancePeriod] ?? PERIOD_LABELS.all;
}

export const AUTHOR_FINANCE_MINIMUM_PAYOUT_TEXT =
  "Минимальная сумма выплаты — 1000 ₽. Если доступная сумма меньше, она не сгорает: остаток переносится и войдёт в следующую выплату.";

export const AUTHOR_FINANCE_BALANCE_AS_OF_TEXT =
  "Суммы в карточках показаны на текущий момент и не зависят от выбранного периода. Период фильтрует только список операций.";

/**
 * The methodology block. It is deliberately written as plain arithmetic: an
 * author should be able to check any single line of their history by hand.
 */
export const AUTHOR_FINANCE_METHODOLOGY: ReadonlyArray<{
  title: string;
  body: string;
}> = [
  {
    title: "Как считается начисление",
    body: "С каждой продажи берётся сумма, которую фактически заплатил покупатель, и от неё рассчитывается ваша доля по действующим условиям. Если при расчёте возникают доли копейки, округление выполняется в пользу автора.",
  },
  {
    title: "Что такое удержание",
    body: "После оплаты начисление какое-то время удерживается — это срок, в течение которого возможен возврат покупателю. Срок удержания указан в ваших условиях. Пока идёт удержание, деньги уже ваши, но ещё не доступны к выплате.",
  },
  {
    title: "Как учитываются возвраты",
    body: "Если покупатель вернул часть или всю сумму, ваша доля пересчитывается от того, что покупатель в итоге оплатил. Разница списывается отдельной строкой в истории.",
  },
  {
    title: "Когда деньги переходят в выплату",
    body: "Когда удержание закончилось, сумма становится доступной. Как только доступная сумма достигает 1000 ₽, формируется выплата: эти деньги резервируются и больше не участвуют в расчёте доступного остатка.",
  },
  {
    title: "Отрицательный остаток",
    body: "Если возвраты превысили начисления, остаток может стать отрицательным. Возвращать ничего не нужно — он закроется следующими продажами.",
  },
];

export const AUTHOR_FINANCE_PRIVACY_NOTE =
  "В кабинете видны только ваши операции. Данные покупателей и внутренние служебные пометки здесь не показываются.";

export const AUTHOR_FINANCE_CSV_COLUMNS = {
  ledger: [
    "Дата",
    "Тип операции",
    "Продукт",
    "Сумма, ₽",
    "Валюта",
    "Состояние",
    "Доступно с",
    "Выплата",
  ],
  payouts: [
    "Дата",
    "Период",
    "Сумма, ₽",
    "Валюта",
    "Статус",
    "Дата выплаты",
    "Референс",
  ],
  appreciation: [
    "Дата",
    "Источник",
    "Сумма благодарности, ₽",
    "Начислено вам, ₽",
    "Статус",
    "Доступно с",
  ],
} as const;
