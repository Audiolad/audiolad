import { validateEmailFormat } from "@/lib/auth/email/validate-format";
import { containsControlCharacters } from "@/lib/auth/email/normalize";
import {
  SUPPORT_REQUEST_CATEGORIES,
  type SupportRequestCategory,
} from "@/lib/help/types";

export const SUPPORT_LIMITS = {
  contactNameMax: 120,
  contactEmailMax: 254,
  subjectMin: 3,
  subjectMax: 200,
  messageMin: 10,
  messageMax: 5000,
} as const;

export type SupportFormInput = {
  category: string;
  subject: string;
  message: string;
  contactName: string;
  contactEmail: string;
  sourceUrl?: string | null;
  authorId?: string | null;
};

export type SupportValidationErrorCode =
  | "category_invalid"
  | "subject_required"
  | "subject_too_short"
  | "subject_too_long"
  | "subject_invalid"
  | "message_required"
  | "message_too_short"
  | "message_too_long"
  | "message_invalid"
  | "contact_name_too_long"
  | "contact_name_invalid"
  | "contact_email_required"
  | "contact_email_invalid"
  | "contact_email_too_long"
  | "author_id_invalid";

export type SupportValidationResult =
  | {
      ok: true;
      value: {
        category: SupportRequestCategory;
        subject: string;
        message: string;
        contactName: string | null;
        contactEmail: string;
        authorId: string | null;
      };
    }
  | { ok: false; code: SupportValidationErrorCode };

const HTML_TAG_RE = /<\/?[a-z][\s\S]*>/i;
const HEADER_INJECTION_RE = /[\r\n]|%0a|%0d/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSupportCategory(value: string): value is SupportRequestCategory {
  return (SUPPORT_REQUEST_CATEGORIES as readonly string[]).includes(value);
}

function stripUnsafePlainText(value: string): string {
  return value.replace(/\u0000/g, "").normalize("NFC");
}

function assertPlainTextField(
  value: string,
  invalidCode: SupportValidationErrorCode,
): SupportValidationErrorCode | null {
  if (containsControlCharacters(value.replace(/\r?\n/g, ""))) {
    return invalidCode;
  }
  if (HTML_TAG_RE.test(value)) {
    return invalidCode;
  }
  if (HEADER_INJECTION_RE.test(value)) {
    return invalidCode;
  }
  return null;
}

export function validateSupportFormInput(
  input: SupportFormInput,
): SupportValidationResult {
  const categoryRaw = typeof input.category === "string" ? input.category.trim() : "";
  if (!isSupportCategory(categoryRaw)) {
    return { ok: false, code: "category_invalid" };
  }

  const subjectRaw =
    typeof input.subject === "string" ? stripUnsafePlainText(input.subject) : "";
  const subject = subjectRaw.trim();
  if (!subject) return { ok: false, code: "subject_required" };
  if (subject.length < SUPPORT_LIMITS.subjectMin) {
    return { ok: false, code: "subject_too_short" };
  }
  if (subject.length > SUPPORT_LIMITS.subjectMax) {
    return { ok: false, code: "subject_too_long" };
  }
  const subjectInvalid = assertPlainTextField(subject, "subject_invalid");
  if (subjectInvalid) return { ok: false, code: subjectInvalid };

  const messageRaw =
    typeof input.message === "string" ? stripUnsafePlainText(input.message) : "";
  const message = messageRaw.trim();
  if (!message) return { ok: false, code: "message_required" };
  if (message.length < SUPPORT_LIMITS.messageMin) {
    return { ok: false, code: "message_too_short" };
  }
  if (message.length > SUPPORT_LIMITS.messageMax) {
    return { ok: false, code: "message_too_long" };
  }
  // Allow newlines in message body, but block HTML/control/header injection.
  if (HTML_TAG_RE.test(message) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(message)) {
    return { ok: false, code: "message_invalid" };
  }
  if (/%0a|%0d/i.test(message)) {
    return { ok: false, code: "message_invalid" };
  }

  const nameRaw =
    typeof input.contactName === "string"
      ? stripUnsafePlainText(input.contactName)
      : "";
  const contactName = nameRaw.trim();
  if (contactName.length > SUPPORT_LIMITS.contactNameMax) {
    return { ok: false, code: "contact_name_too_long" };
  }
  if (contactName) {
    const nameInvalid = assertPlainTextField(contactName, "contact_name_invalid");
    if (nameInvalid) return { ok: false, code: nameInvalid };
  }

  const emailRaw =
    typeof input.contactEmail === "string" ? input.contactEmail.trim() : "";
  if (!emailRaw) return { ok: false, code: "contact_email_required" };
  if (emailRaw.length > SUPPORT_LIMITS.contactEmailMax) {
    return { ok: false, code: "contact_email_too_long" };
  }
  if (HEADER_INJECTION_RE.test(emailRaw) || containsControlCharacters(emailRaw)) {
    return { ok: false, code: "contact_email_invalid" };
  }
  const emailResult = validateEmailFormat(emailRaw);
  if (!emailResult.ok) {
    return { ok: false, code: "contact_email_invalid" };
  }

  let authorId: string | null = null;
  if (typeof input.authorId === "string" && input.authorId.trim()) {
    const candidate = input.authorId.trim();
    if (!UUID_RE.test(candidate)) {
      return { ok: false, code: "author_id_invalid" };
    }
    authorId = candidate.toLowerCase();
  }

  return {
    ok: true,
    value: {
      category: categoryRaw,
      subject,
      message,
      contactName: contactName || null,
      contactEmail: emailResult.normalizedEmail,
      authorId,
    },
  };
}

export function isSafeSupportReplyToEmail(email: string): boolean {
  if (!email || HEADER_INJECTION_RE.test(email) || containsControlCharacters(email)) {
    return false;
  }
  const result = validateEmailFormat(email);
  return result.ok;
}
