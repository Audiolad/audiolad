"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";

import {
  trackHelpSupportOpen,
  trackHelpSupportSubmit,
} from "@/lib/help/analytics";
import { helpHubHref } from "@/lib/help/paths";
import { SUPPORT_LIMITS } from "@/lib/help/support-validation";
import {
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_REQUEST_CATEGORIES,
  type SupportRequestCategory,
} from "@/lib/help/types";

type HelpSupportFormProps = {
  initialName: string;
  initialEmail: string;
  authorId: string | null;
  sourceUrl: string | null;
};

const ERROR_MESSAGES: Record<string, string> = {
  category_invalid: "Выберите категорию обращения.",
  subject_required: "Укажите тему обращения.",
  subject_too_short: "Тема слишком короткая.",
  subject_too_long: "Тема слишком длинная.",
  subject_invalid: "Тема содержит недопустимые символы.",
  message_required: "Напишите сообщение.",
  message_too_short: "Сообщение слишком короткое.",
  message_too_long: "Сообщение слишком длинное.",
  message_invalid: "Сообщение содержит недопустимые символы или HTML.",
  contact_name_too_long: "Имя слишком длинное.",
  contact_name_invalid: "Имя содержит недопустимые символы.",
  contact_email_required: "Укажите электронную почту.",
  contact_email_invalid: "Проверьте адрес электронной почты.",
  contact_email_too_long: "Адрес электронной почты слишком длинный.",
  author_id_invalid: "Не удалось привязать авторское пространство.",
  rate_limited: "Слишком много обращений. Попробуйте позже.",
  forbidden_origin: "Запрос отклонён. Обновите страницу и попробуйте снова.",
  invalid_request: "Не удалось отправить форму. Проверьте поля.",
  internal_error: "Не удалось отправить обращение. Попробуйте позже.",
};

export default function HelpSupportForm({
  initialName,
  initialEmail,
  authorId,
  sourceUrl,
}: HelpSupportFormProps) {
  const [category, setCategory] = useState<SupportRequestCategory>("other");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [contactName, setContactName] = useState(initialName);
  const [contactEmail, setContactEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    trackHelpSupportOpen("/help/support");
  }, []);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/help/support", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            category,
            subject,
            message,
            contact_name: contactName,
            contact_email: contactEmail,
            author_id: authorId,
            source_url:
              sourceUrl ||
              (typeof window !== "undefined" ? window.location.href : null),
          }),
        });

        const data = (await response.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;

        if (!response.ok || !data?.ok) {
          const code = data?.error ?? "internal_error";
          setError(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.internal_error);
          return;
        }

        trackHelpSupportSubmit({ path: "/help/support", category });
        setSubmitted(true);
      } catch {
        setError(ERROR_MESSAGES.internal_error);
      }
    });
  }

  if (submitted) {
    return (
      <div className="mt-8 max-w-xl rounded-[24px] border border-[#eadff8] bg-white px-5 py-6">
        <h2 className="text-xl font-semibold text-[#25135c]">Вопрос отправлен</h2>
        <p className="mt-3 text-[15px] leading-7 text-[#4c3d78]">
          Вопрос отправлен. Ответ придёт на указанную электронную почту.
        </p>
        <Link
          href={helpHubHref()}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-[16px] bg-[#7042c5] px-5 text-sm font-semibold text-white"
        >
          Вернуться в справочный центр
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 max-w-xl space-y-5" noValidate>
      <div>
        <label htmlFor="support-category" className="text-sm font-medium text-[#5f5484]">
          Категория
        </label>
        <select
          id="support-category"
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as SupportRequestCategory)
          }
          className="mt-2 min-h-12 w-full rounded-[18px] border border-[#eadff8] bg-white px-4 text-[16px] text-[#25135c]"
        >
          {SUPPORT_REQUEST_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {SUPPORT_CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="support-subject" className="text-sm font-medium text-[#5f5484]">
          Тема
        </label>
        <input
          id="support-subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={SUPPORT_LIMITS.subjectMax}
          required
          className="mt-2 min-h-12 w-full rounded-[18px] border border-[#eadff8] bg-white px-4 text-[16px] text-[#25135c]"
        />
      </div>

      <div>
        <label htmlFor="support-message" className="text-sm font-medium text-[#5f5484]">
          Сообщение
        </label>
        <textarea
          id="support-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={SUPPORT_LIMITS.messageMax}
          required
          rows={7}
          className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-white px-4 py-3 text-[16px] leading-7 text-[#25135c]"
        />
      </div>

      <div>
        <label htmlFor="support-name" className="text-sm font-medium text-[#5f5484]">
          Имя
        </label>
        <input
          id="support-name"
          value={contactName}
          onChange={(event) => setContactName(event.target.value)}
          maxLength={SUPPORT_LIMITS.contactNameMax}
          className="mt-2 min-h-12 w-full rounded-[18px] border border-[#eadff8] bg-white px-4 text-[16px] text-[#25135c]"
        />
      </div>

      <div>
        <label htmlFor="support-email" className="text-sm font-medium text-[#5f5484]">
          Электронная почта
        </label>
        <input
          id="support-email"
          type="email"
          value={contactEmail}
          onChange={(event) => setContactEmail(event.target.value)}
          maxLength={SUPPORT_LIMITS.contactEmailMax}
          required
          className="mt-2 min-h-12 w-full rounded-[18px] border border-[#eadff8] bg-white px-4 text-[16px] text-[#25135c]"
        />
        <p className="mt-2 text-xs leading-5 text-[#8c7dab]">
          Ответ придёт на этот адрес. Можно указать другой контактный email.
        </p>
      </div>

      {error ? (
        <p className="rounded-[16px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-3 text-sm text-[#b34f63]" role="alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-[18px] bg-[#7042c5] px-6 text-[15px] font-semibold text-white disabled:opacity-60 sm:w-auto"
      >
        {isPending ? "Отправка…" : "Отправить вопрос"}
      </button>
    </form>
  );
}
