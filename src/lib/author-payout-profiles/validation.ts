import {
  isAuthorPayoutRecipientType,
  type AuthorPayoutProfileFormValues,
} from "./types";

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const HTML_LIKE = /[<>]/;

export type AuthorPayoutProfileFieldErrors = Partial<
  Record<keyof AuthorPayoutProfileFormValues | "recipient_type" | "form", string>
>;

function stripSpaces(value: string): string {
  return value.replace(/\s+/g, "");
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

/** OGRNIP (15 digits) with checksum. */
export function isValidOgrnip(raw: string): boolean {
  const value = stripSpaces(raw);

  if (!/^\d{15}$/.test(value)) {
    return false;
  }

  // 14-digit prefix fits in Number.MAX_SAFE_INTEGER.
  const check = Math.floor(Number(value.slice(0, 14)) % 13) % 10;
  return check === Number(value[14]);
}

export function isValidBik(raw: string): boolean {
  return /^\d{9}$/.test(stripSpaces(raw));
}

export function isValidBankAccount(raw: string): boolean {
  return /^\d{20}$/.test(stripSpaces(raw));
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
    legal_name: "",
    first_name: "",
    last_name: "",
    middle_name: "",
    inn: "",
    ogrnip: "",
    email: "",
    phone: "",
    bank_account: "",
    bank_bik: "",
    bank_name: "",
    bank_correspondent_account: "",
    registration_address: "",
    tax_residency_note: "",
    is_npd_declared: false,
    author_revision_comment: "",
  };
}

export function normalizeAuthorPayoutProfileFormValues(
  input: Record<string, unknown>,
): AuthorPayoutProfileFormValues {
  const recipientRaw =
    typeof input.recipient_type === "string" ? input.recipient_type.trim() : "";

  return {
    recipient_type: isAuthorPayoutRecipientType(recipientRaw)
      ? recipientRaw
      : "",
    legal_name: cleanText(input.legal_name, 300),
    first_name: cleanText(input.first_name, 100),
    last_name: cleanText(input.last_name, 100),
    middle_name: cleanText(input.middle_name, 100),
    inn: stripSpaces(cleanText(input.inn, 20)),
    ogrnip: stripSpaces(cleanText(input.ogrnip, 20)),
    email: cleanText(input.email, 320).toLowerCase(),
    phone: normalizePhone(cleanText(input.phone, 40)),
    bank_account: stripSpaces(cleanText(input.bank_account, 40)),
    bank_bik: stripSpaces(cleanText(input.bank_bik, 20)),
    bank_name: cleanText(input.bank_name, 200),
    bank_correspondent_account: stripSpaces(
      cleanText(input.bank_correspondent_account, 40),
    ),
    registration_address: cleanText(input.registration_address, 500),
    tax_residency_note: cleanText(input.tax_residency_note, 500),
    is_npd_declared: input.is_npd_declared === true,
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
 * `mode: draft` allows incomplete fields; `submit` requires type-specific rules.
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
      errors.recipient_type = "Выберите правовой статус.";
    }

    if (requireSubmit) {
      return errors;
    }
  }

  const type = values.recipient_type;
  const checkUnsafe = (key: keyof AuthorPayoutProfileFormValues, value: string) => {
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
  checkUnsafe("registration_address", values.registration_address);
  checkUnsafe("tax_residency_note", values.tax_residency_note);
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
      errors.bank_account = "Расчётный счёт должен содержать 20 цифр.";
    }
    if (
      values.bank_correspondent_account &&
      !isValidBankAccount(values.bank_correspondent_account)
    ) {
      errors.bank_correspondent_account =
        "Корреспондентский счёт должен содержать 20 цифр.";
    }
    if (values.email && !isValidEmail(values.email)) {
      errors.email = "Укажите корректный email.";
    }
    if (values.phone && !isValidPhone(values.phone)) {
      errors.phone = "Укажите телефон в формате +7…";
    }
    return errors;
  }

  // Submit rules
  const lastNameError = requireName(values.last_name, "фамилию");
  if (lastNameError) errors.last_name = lastNameError;
  const firstNameError = requireName(values.first_name, "имя");
  if (firstNameError) errors.first_name = firstNameError;
  if (values.middle_name) {
    checkUnsafe("middle_name", values.middle_name);
  }

  if (!isValidRussianPersonalInn(values.inn)) {
    errors.inn = "Укажите корректный ИНН (12 цифр).";
  }

  if (!isValidEmail(values.email)) {
    errors.email = "Укажите корректный email.";
  }

  if (!isValidPhone(values.phone)) {
    errors.phone = "Укажите телефон в формате +7…";
  }

  if (!isValidBik(values.bank_bik)) {
    errors.bank_bik = "БИК должен содержать 9 цифр.";
  }

  if (!isValidBankAccount(values.bank_account)) {
    errors.bank_account = "Расчётный счёт должен содержать 20 цифр.";
  }

  if (!values.bank_name) {
    errors.bank_name = "Укажите наименование банка.";
  }

  if (type === "self_employed") {
    if (!values.is_npd_declared) {
      errors.is_npd_declared =
        "Подтвердите применение режима «Налог на профессиональный доход».";
    }
  }

  if (type === "individual_entrepreneur") {
    if (!values.legal_name) {
      errors.legal_name = "Укажите полное наименование ИП.";
    }
    if (!isValidOgrnip(values.ogrnip)) {
      errors.ogrnip = "Укажите корректный ОГРНИП (15 цифр).";
    }
    if (!isValidBankAccount(values.bank_correspondent_account)) {
      errors.bank_correspondent_account =
        "Укажите корреспондентский счёт (20 цифр).";
    }
    if (!values.registration_address) {
      errors.registration_address = "Укажите адрес регистрации.";
    }
  }

  if (type === "individual") {
    if (!values.registration_address) {
      errors.registration_address = "Укажите адрес регистрации.";
    }
  }

  return errors;
}

/** Strip sequences that look like bank accounts / INN from admin comments. */
export function sanitizeStaffFacingComment(raw: string): string {
  return cleanText(raw, 4000)
    .replace(/\b\d{20}\b/g, "[скрыто]")
    .replace(/\b\d{15}\b/g, "[скрыто]")
    .replace(/\b\d{12}\b/g, "[скрыто]")
    .replace(/\b\d{9}\b/g, "[скрыто]");
}
