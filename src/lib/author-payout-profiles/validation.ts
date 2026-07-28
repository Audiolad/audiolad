import {
  isAuthorPayoutMethod,
  isAuthorPayoutRecipientType,
  type AuthorPayoutProfileFormValues,
} from "./types";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const HTML_LIKE = /[<>]/;

export type AuthorPayoutProfileFieldErrors = Partial<
  Record<
    keyof AuthorPayoutProfileFormValues | "recipient_type" | "payout_method" | "form",
    string
  >
>;

function stripSpaces(value: string): string {
  return value.replace(/\s+/g, "");
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function rejectUnsafeText(value: string): string | null {
  if (!value) {
    return null;
  }

  if (CONTROL_CHARS.test(value) || HTML_LIKE.test(value)) {
    return "Недопустимые символы.";
  }

  return null;
}

/** Russian personal INN (12 digits) with checksum. */
export function isValidRussianPersonalInn(raw: string): boolean {
  const inn = stripSpaces(raw);

  if (!/^\d{12}$/.test(inn)) {
    return false;
  }

  const digits = inn.split("").map((d) => Number(d));
  const n11 =
    ((7 * digits[0] +
      2 * digits[1] +
      4 * digits[2] +
      10 * digits[3] +
      3 * digits[4] +
      5 * digits[5] +
      9 * digits[6] +
      4 * digits[7] +
      6 * digits[8] +
      8 * digits[9]) %
      11) %
    10;
  const n12 =
    ((3 * digits[0] +
      7 * digits[1] +
      2 * digits[2] +
      4 * digits[3] +
      10 * digits[4] +
      3 * digits[5] +
      5 * digits[6] +
      9 * digits[7] +
      4 * digits[8] +
      6 * digits[9] +
      8 * digits[10]) %
      11) %
    10;

  return digits[10] === n11 && digits[11] === n12;
}

/** OGRNIP (15 digits) with checksum — optional field. */
export function isValidOgrnip(raw: string): boolean {
  const value = stripSpaces(raw);

  if (!/^\d{15}$/.test(value)) {
    return false;
  }

  const check = Math.floor(Number(value.slice(0, 14)) % 13) % 10;
  return check === Number(value[14]);
}

export function isValidBik(raw: string): boolean {
  return /^\d{9}$/.test(stripSpaces(raw));
}

export function isValidBankAccount(raw: string): boolean {
  return /^\d{20}$/.test(stripSpaces(raw));
}

export function normalizeCardNumber(raw: string): string {
  return digitsOnly(raw);
}

/**
 * Soft card check: 13–19 digits.
 * Luhn is advisory — invalid Luhn still accepted if length is OK
 * (rare issuer formats / test bins); we only warn via return flag.
 */
export function isValidCardNumberLength(raw: string): boolean {
  const digits = normalizeCardNumber(raw);
  return digits.length >= 13 && digits.length <= 19;
}

export function passesLuhnCheck(raw: string): boolean {
  const digits = normalizeCardNumber(raw);
  if (!isValidCardNumberLength(digits)) {
    return false;
  }

  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function isValidEmail(raw: string): boolean {
  const email = raw.trim().toLowerCase();
  return (
    email.length <= 320 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    !CONTROL_CHARS.test(email)
  );
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("8") && digits.length === 11) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.startsWith("7") && digits.length === 11) {
    return `+${digits}`;
  }
  if (digits.startsWith("+7") && digits.length === 12) {
    return digits;
  }
  return digits;
}

export function isValidPhone(raw: string): boolean {
  const phone = normalizePhone(raw);
  return /^\+7\d{10}$/.test(phone);
}

export function emptyAuthorPayoutProfileFormValues(): AuthorPayoutProfileFormValues {
  return {
    recipient_type: "",
    payout_method: "",
    legal_name: "",
    first_name: "",
    last_name: "",
    middle_name: "",
    inn: "",
    ogrnip: "",
    email: "",
    phone: "",
    card_number: "",
    bank_account: "",
    bank_bik: "",
    bank_name: "",
    bank_correspondent_account: "",
    registration_address: "",
    tax_residency_note: "",
    is_npd_declared: false,
    details_confirmed: false,
    author_revision_comment: "",
  };
}

export function normalizeAuthorPayoutProfileFormValues(
  input: Record<string, unknown>,
): AuthorPayoutProfileFormValues {
  const recipientRaw =
    typeof input.recipient_type === "string" ? input.recipient_type.trim() : "";
  const methodRaw =
    typeof input.payout_method === "string" ? input.payout_method.trim() : "";

  return {
    recipient_type: isAuthorPayoutRecipientType(recipientRaw)
      ? recipientRaw
      : "",
    payout_method: isAuthorPayoutMethod(methodRaw) ? methodRaw : "",
    legal_name: cleanText(input.legal_name, 300),
    first_name: cleanText(input.first_name, 100),
    last_name: cleanText(input.last_name, 100),
    middle_name: cleanText(input.middle_name, 100),
    inn: stripSpaces(cleanText(input.inn, 20)),
    ogrnip: stripSpaces(cleanText(input.ogrnip, 20)),
    email: cleanText(input.email, 320).toLowerCase(),
    phone: normalizePhone(cleanText(input.phone, 40)),
    card_number: normalizeCardNumber(cleanText(input.card_number, 40)),
    bank_account: stripSpaces(cleanText(input.bank_account, 40)),
    bank_bik: stripSpaces(cleanText(input.bank_bik, 20)),
    bank_name: cleanText(input.bank_name, 200),
    bank_correspondent_account: stripSpaces(
      cleanText(input.bank_correspondent_account, 40),
    ),
    registration_address: cleanText(input.registration_address, 500),
    tax_residency_note: cleanText(input.tax_residency_note, 500),
    is_npd_declared: input.is_npd_declared === true,
    details_confirmed: input.details_confirmed === true,
    author_revision_comment: cleanText(input.author_revision_comment, 4000),
  };
}

export function hasAuthorPayoutProfileFieldErrors(
  errors: AuthorPayoutProfileFieldErrors,
): boolean {
  return Object.keys(errors).length > 0;
}

function requireName(value: string, label: string): string | undefined {
  if (!value) {
    return `Укажите ${label}.`;
  }

  return rejectUnsafeText(value) ?? undefined;
}

/**
 * Server-side validation before encryption.
 * `mode: draft` allows incomplete fields; `submit` requires type/method rules.
 */
export function validateAuthorPayoutProfileFormValues(
  values: AuthorPayoutProfileFormValues,
  options: { mode: "draft" | "submit" },
): AuthorPayoutProfileFieldErrors {
  const errors: AuthorPayoutProfileFieldErrors = {};
  const requireSubmit = options.mode === "submit";

  if (
    values.recipient_type === "" ||
    !isAuthorPayoutRecipientType(values.recipient_type)
  ) {
    if (requireSubmit || values.recipient_type !== "") {
      errors.recipient_type = "Выберите, кто вы.";
    }

    if (requireSubmit) {
      return errors;
    }
  }

  if (
    values.payout_method !== "" &&
    !isAuthorPayoutMethod(values.payout_method)
  ) {
    errors.payout_method = "Выберите способ получения выплаты.";
  }

  const type = values.recipient_type;
  const method = values.payout_method;
  const checkUnsafe = (
    key: keyof AuthorPayoutProfileFormValues,
    value: string,
  ) => {
    const unsafe = rejectUnsafeText(value);
    if (unsafe) {
      errors[key] = unsafe;
    }
  };

  checkUnsafe("legal_name", values.legal_name);
  checkUnsafe("first_name", values.first_name);
  checkUnsafe("last_name", values.last_name);
  checkUnsafe("middle_name", values.middle_name);
  checkUnsafe("bank_name", values.bank_name);
  checkUnsafe("author_revision_comment", values.author_revision_comment);

  if (!requireSubmit) {
    if (values.inn && !isValidRussianPersonalInn(values.inn)) {
      errors.inn = "Укажите корректный ИНН (12 цифр).";
    }
    if (values.ogrnip && !isValidOgrnip(values.ogrnip)) {
      errors.ogrnip = "Укажите корректный ОГРНИП (15 цифр).";
    }
    if (values.bank_bik && !isValidBik(values.bank_bik)) {
      errors.bank_bik = "БИК должен содержать 9 цифр.";
    }
    if (values.bank_account && !isValidBankAccount(values.bank_account)) {
      errors.bank_account = "Номер счёта должен содержать 20 цифр.";
    }
    if (
      values.bank_correspondent_account &&
      !isValidBankAccount(values.bank_correspondent_account)
    ) {
      errors.bank_correspondent_account =
        "Корреспондентский счёт должен содержать 20 цифр.";
    }
    if (values.card_number && !isValidCardNumberLength(values.card_number)) {
      errors.card_number = "Проверьте номер карты.";
    }
    if (values.email && !isValidEmail(values.email)) {
      errors.email = "Укажите корректный email.";
    }
    if (values.phone && !isValidPhone(values.phone)) {
      errors.phone = "Укажите телефон в формате +7…";
    }
    return errors;
  }

  // Submit / complete-save rules
  if (!isAuthorPayoutMethod(method)) {
    errors.payout_method = "Выберите способ получения выплаты.";
  }

  const lastNameError = requireName(values.last_name, "фамилию");
  if (lastNameError) errors.last_name = lastNameError;
  const firstNameError = requireName(values.first_name, "имя");
  if (firstNameError) errors.first_name = firstNameError;
  if (values.middle_name) {
    checkUnsafe("middle_name", values.middle_name);
  }

  if (!isValidEmail(values.email)) {
    errors.email = "Укажите корректный email.";
  }

  if (!isValidPhone(values.phone)) {
    errors.phone = "Укажите телефон в формате +7…";
  }

  if (!values.details_confirmed) {
    errors.details_confirmed =
      "Подтвердите, что указанные сведения верны и принадлежат вам.";
  }

  if (type === "self_employed" || type === "individual_entrepreneur") {
    if (!isValidRussianPersonalInn(values.inn)) {
      errors.inn = "Укажите корректный ИНН (12 цифр).";
    }
  }

  if (type === "self_employed" && !values.is_npd_declared) {
    errors.is_npd_declared =
      "Подтвердите, что вы применяете налог на профессиональный доход.";
  }

  if (values.ogrnip && !isValidOgrnip(values.ogrnip)) {
    errors.ogrnip = "Укажите корректный ОГРНИП (15 цифр).";
  }

  if (method === "card") {
    if (!values.bank_name) {
      errors.bank_name = "Укажите банк получателя.";
    }
    if (!isValidCardNumberLength(values.card_number)) {
      errors.card_number = "Укажите номер карты (от 13 до 19 цифр).";
    }
  }

  if (method === "sbp") {
    if (!values.bank_name) {
      errors.bank_name = "Укажите банк, подключённый к СБП.";
    }
    // SBP phone uses the contact phone field.
    if (!isValidPhone(values.phone)) {
      errors.phone =
        "Укажите номер телефона, подключённый к СБП в выбранном банке.";
    }
  }

  if (method === "bank_account") {
    if (!values.bank_name) {
      errors.bank_name = "Укажите банк.";
    }
    if (!isValidBik(values.bank_bik)) {
      errors.bank_bik = "БИК должен содержать 9 цифр.";
    }
    if (!isValidBankAccount(values.bank_account)) {
      errors.bank_account = "Номер счёта должен содержать 20 цифр.";
    }
    if (
      values.bank_correspondent_account &&
      !isValidBankAccount(values.bank_correspondent_account)
    ) {
      errors.bank_correspondent_account =
        "Корреспондентский счёт должен содержать 20 цифр.";
    }
  }

  return errors;
}

/**
 * Soft scrub of obvious account/INN-length digit runs from staff/author comments.
 */
export function sanitizeStaffFacingComment(raw: string): string {
  return cleanText(raw, 4000)
    .replace(CONTROL_CHARS, "")
    .replace(/\b\d{20}\b/g, "[скрыто]")
    .replace(/\b\d{16,19}\b/g, "[скрыто]")
    .replace(/\b\d{15}\b/g, "[скрыто]")
    .replace(/\b\d{12}\b/g, "[скрыто]");
}
