/**
 * Owner-facing rights status copy (P1-08) — HG-3 DECIDED alignment.
 *
 * Source of truth for posture: execution RIGHTS-MODEL-RU.md §5.
 * Fail-closed: never claim «лицензировано» / «легально для бизнеса» /
 * «вся музыка на платформе подходит для заведений».
 *
 * Decision codes (ELIGIBLE / UNKNOWN / …) remain the machine truth;
 * this module only maps them to safe Russian owner copy.
 * Does not invent grants, freeze-list rows, or catalog eligibility.
 */

/** Mirror of BUSINESS_ELIGIBILITY_DECISIONS — keep in sync; no import cycle. */
export type BusinessRightsStatusDecision =
  | "ELIGIBLE"
  | "INELIGIBLE"
  | "CONDITIONAL"
  | "UNKNOWN";

/** Forbidden substrings for owner-facing rights claims (HG-3 §5). */
export const BUSINESS_RIGHTS_FORBIDDEN_CLAIM_PATTERNS = [
  /лицензирован/i,
  /лицензия активн/i,
  /легальн\w*\s+для\s+бизнес/i,
  /вся\s+музыка\s+на\s+платформе\s+легальн/i,
] as const;

export const BUSINESS_RIGHTS_STATUS_SECTION_TITLE = "Статус прав на эфир";

export const BUSINESS_RIGHTS_HOME_CONTROL = {
  title: BUSINESS_RIGHTS_STATUS_SECTION_TITLE,
  /** Fail-closed until RPC ELIGIBLE ∩ freeze-list — never «Лицензия активна». */
  detail: "Уточняется · каталог эфира пока без подтверждённых треков",
  tone: "warn" as const,
};

export const BUSINESS_RIGHTS_DOCUMENTS_EMPTY = {
  title: "Документы и оплата",
  description:
    "Договоры и оплата появятся позже. Статус прав на музыку для эфира — отдельно: сейчас каталог без подтверждённой пригодности (не «лицензировано»).",
};

export const BUSINESS_RIGHTS_MUSIC_PAGE_HEADER = {
  eyebrow: "Музыка · статус прав",
  title: "Кандидаты эфира",
  description:
    "Читаем статус прав по точке. В эфир попадают только треки с подтверждённой пригодностью. Пока статус «уточняется» — каталог эфира пуст. Мы не утверждаем, что музыка «лицензирована».",
};

export const BUSINESS_RIGHTS_PROBE_FOOTNOTE =
  "Статус прав · только чтение · «уточняется» ≠ разрешение на эфир · без формулировок «лицензировано»";

export const BUSINESS_RIGHTS_PLAYER_GATE_NOTE =
  "В пул эфира — только треки с подтверждённой пригодностью. Пока статус уточняется, каталог эфира пуст (технический пилот-тон — отдельно, не каталог).";

export const BUSINESS_RIGHTS_ONBOARDING_DISCLAIMER =
  "Каталог эфира пока без подтверждённых треков. Статус прав — уточняется, пока нет evidence и утверждённого списка. Мы не утверждаем, что музыка «лицензирована».";

export const BUSINESS_RIGHTS_UNKNOWN_NE_ELIGIBLE =
  "«Уточняется» не равно разрешению на эфир";

type DecisionOwnerCopy = {
  /** Short badge for lists (owner RU + machine code). */
  badge: string;
  /** One-line explanation under the badge. */
  explanation: string;
};

const DECISION_OWNER_COPY: Record<
  BusinessRightsStatusDecision,
  DecisionOwnerCopy
> = {
  ELIGIBLE: {
    badge: "Подтверждено для эфира",
    explanation:
      "Пригодность для заявленного Business-эфира подтверждена системой прав. Это не рекламный ярлык «лицензировано» вне цепочки прав.",
  },
  INELIGIBLE: {
    badge: "Не подходит для эфира",
    explanation:
      "По текущим данным трек не подходит для эфира в этой точке.",
  },
  CONDITIONAL: {
    badge: "Нужны условия",
    explanation:
      "Есть условия или пробелы — без их закрытия трек не попадает в эфир.",
  },
  UNKNOWN: {
    badge: "Статус прав уточняется",
    explanation:
      "Недостаточно данных для решения. Fail-closed: «уточняется» ≠ разрешение на эфир.",
  },
};

export function formatOwnerEligibilityDecisionLabel(
  decision: BusinessRightsStatusDecision,
): string {
  return DECISION_OWNER_COPY[decision]?.badge ?? DECISION_OWNER_COPY.UNKNOWN.badge;
}

export function formatOwnerEligibilityDecisionExplanation(
  decision: BusinessRightsStatusDecision,
): string {
  return (
    DECISION_OWNER_COPY[decision]?.explanation ??
    DECISION_OWNER_COPY.UNKNOWN.explanation
  );
}

/** Machine code kept visible for support / diagnostics (secondary). */
export function formatEligibilityDecisionCode(
  decision: BusinessRightsStatusDecision,
): string {
  return decision;
}

export function venueAirplayOwnerEmptyStateCopy(input: {
  hasLocation: boolean;
  probed: boolean;
  eligibleCount: number;
}): { title: string; description: string } {
  if (!input.hasLocation) {
    return {
      title: "Нет точки для проверки прав",
      description:
        "Сначала создайте организацию и точку на Главной или в мастере подключения. Без точки статус прав для эфира не проверить.",
    };
  }
  if (!input.probed) {
    return {
      title: "Проверка статуса прав",
      description: `Нажмите «Проверить», чтобы обновить статус. ${BUSINESS_RIGHTS_UNKNOWN_NE_ELIGIBLE}.`,
    };
  }
  if (input.eligibleCount === 0) {
    return {
      title: "Каталог эфира пуст",
      description:
        "Нет треков с подтверждённой пригодностью для эфира. Статус прав по кандидатам — уточняется (fail-closed). Технический пилот-тон плеера — отдельно и не является каталогом эфира. Мы не утверждаем, что музыка «лицензирована».",
    };
  }
  return {
    title: "Есть треки для эфира",
    description: `В пуле эфира: ${input.eligibleCount} трек(ов) с подтверждённой пригодностью.`,
  };
}

/**
 * True when copy does not make a positive license/legality claim.
 * Negation disclaimers that mention «лицензировано» are allowed.
 */
export function assertOwnerRightsCopyIsSafe(text: string): boolean {
  const hasLicenseWord = /лицензирован|лицензия активн/i.test(text);
  if (hasLicenseWord) {
    const negationOk =
      /не утверждаем|не «лицензировано»|без формулировок «лицензировано»|\(не «лицензировано»\)/i.test(
        text,
      );
    if (!negationOk) return false;
  }
  if (/легальн\w*\s+для\s+бизнес/i.test(text)) return false;
  if (/вся\s+музыка\s+на\s+платформе\s+легальн/i.test(text)) return false;
  return true;
}
