"use client";

import Link from "next/link";
import { useActionState } from "react";

import { submitAuthorApplication } from "@/app/become-author/actions";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import {
  getAuthorApplicationStatusDescription,
  getAuthorApplicationStatusTitle,
  shouldShowAuthorApplicationForm,
} from "@/lib/author-applications/status";
import type {
  AuthorApplicationFormState,
  AuthorApplicationFormValues,
  AuthorApplicationRow,
  BecomeAuthorAudience,
} from "@/lib/author-applications/types";
import { AUTHOR_APPLICATION_LIMITS } from "@/lib/author-applications/validation";

import {
  becomeAuthorBodyClass,
  becomeAuthorCheckboxCardClass,
  becomeAuthorInputClass,
  becomeAuthorLabelClass,
  becomeAuthorTextareaClass,
} from "./typography";

const INITIAL_STATE: AuthorApplicationFormState = {
  ok: false,
  errors: {},
};

type AuthorApplicationPanelProps = {
  audience: BecomeAuthorAudience;
  application: AuthorApplicationRow | null;
  workspaceCount: number;
  defaultValues: AuthorApplicationFormValues;
  showSubmittedBanner: boolean;
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} className="mt-2 text-[15px] leading-snug text-[#b34f63]" role="alert">
      {message}
    </p>
  );
}

function AuthorApplicationForm({
  defaultValues,
  state,
  formAction,
}: {
  defaultValues: AuthorApplicationFormValues;
  state: AuthorApplicationFormState;
  formAction: (payload: FormData) => void;
}) {
  const values = state.values ?? defaultValues;
  const errors = state.errors;

  return (
    <form action={formAction} className="space-y-4 pb-2">
      {(errors.form || errors.submit || errors.conflict || errors.auth) && (
        <div
          className="rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-3 text-[15px] leading-snug text-[#b34f63]"
          role="alert"
        >
          {errors.form ?? errors.submit ?? errors.conflict ?? errors.auth}
        </div>
      )}

      <div>
        <label htmlFor="displayName" className={becomeAuthorLabelClass}>
          Как вы хотите представляться?{" "}
          <span className="text-[#b34f63]">*</span>
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          minLength={AUTHOR_APPLICATION_LIMITS.displayNameMin}
          maxLength={AUTHOR_APPLICATION_LIMITS.displayNameMax}
          defaultValue={values.displayName}
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby={errors.displayName ? "displayName-error" : undefined}
          className={becomeAuthorInputClass}
        />
        <FieldError id="displayName-error" message={errors.displayName} />
      </div>

      <div>
        <label htmlFor="direction" className={becomeAuthorLabelClass}>
          В каком направлении вы работаете?{" "}
          <span className="text-[#b34f63]">*</span>
        </label>
        <input
          id="direction"
          name="direction"
          type="text"
          required
          minLength={AUTHOR_APPLICATION_LIMITS.directionMin}
          maxLength={AUTHOR_APPLICATION_LIMITS.directionMax}
          placeholder="Психология, медитации, телесные практики, молитвы, наставничество…"
          defaultValue={values.direction}
          aria-invalid={Boolean(errors.direction)}
          aria-describedby={errors.direction ? "direction-error" : undefined}
          className={becomeAuthorInputClass}
        />
        <FieldError id="direction-error" message={errors.direction} />
      </div>

      <div>
        <label htmlFor="about" className={becomeAuthorLabelClass}>
          Расскажите о себе и своём опыте{" "}
          <span className="text-[#b34f63]">*</span>
        </label>
        <textarea
          id="about"
          name="about"
          required
          minLength={AUTHOR_APPLICATION_LIMITS.aboutMin}
          maxLength={AUTHOR_APPLICATION_LIMITS.aboutMax}
          rows={4}
          defaultValue={values.about}
          aria-invalid={Boolean(errors.about)}
          aria-describedby={errors.about ? "about-error" : undefined}
          className={`${becomeAuthorTextareaClass} min-h-[150px]`}
        />
        <FieldError id="about-error" message={errors.about} />
      </div>

      <div>
        <label htmlFor="contact" className={becomeAuthorLabelClass}>
          Телефон, MAX или другой удобный способ связи{" "}
          <span className="text-[#b34f63]">*</span>
        </label>
        <input
          id="contact"
          name="contact"
          type="text"
          required
          minLength={AUTHOR_APPLICATION_LIMITS.contactMin}
          maxLength={AUTHOR_APPLICATION_LIMITS.contactMax}
          defaultValue={values.contact}
          aria-invalid={Boolean(errors.contact)}
          aria-describedby={errors.contact ? "contact-error" : undefined}
          className={becomeAuthorInputClass}
        />
        <FieldError id="contact-error" message={errors.contact} />
      </div>

      <fieldset
        className="space-y-3"
        aria-describedby={errors.readiness ? "readiness-error" : undefined}
      >
        <legend className={becomeAuthorLabelClass}>
          Готовность материалов <span className="text-[#b34f63]">*</span>
        </legend>

        <label className={becomeAuthorCheckboxCardClass}>
          <input
            type="checkbox"
            name="hasReadyMaterials"
            defaultChecked={values.hasReadyMaterials}
            className="mt-1 h-5 w-5 shrink-0 accent-[#7042c5]"
          />
          <span className={`${becomeAuthorBodyClass} text-[#25135c]`}>
            У меня уже есть готовые аудиоматериалы
          </span>
        </label>

        <label className={becomeAuthorCheckboxCardClass}>
          <input
            type="checkbox"
            name="wantsTraining"
            defaultChecked={values.wantsTraining}
            className="mt-1 h-5 w-5 shrink-0 accent-[#7042c5]"
          />
          <span className={`${becomeAuthorBodyClass} text-[#25135c]`}>
            Готовых материалов пока нет, но я хочу обучиться и создать их
          </span>
        </label>

        <FieldError id="readiness-error" message={errors.readiness} />
      </fieldset>

      <div>
        <label className={becomeAuthorCheckboxCardClass}>
          <input
            type="checkbox"
            name="consentPersonalData"
            defaultChecked={values.consentPersonalData}
            required
            aria-invalid={Boolean(errors.consentPersonalData)}
            aria-describedby={
              errors.consentPersonalData ? "consent-error" : undefined
            }
            className="mt-1 h-5 w-5 shrink-0 accent-[#7042c5]"
          />
          <span className={`${becomeAuthorBodyClass} text-[#25135c]`}>
            Я согласен на{" "}
            <Link
              href="/consent"
              className="font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            >
              обработку персональных данных
            </Link>{" "}
            <span className="text-[#b34f63]">*</span>
          </span>
        </label>
        <FieldError id="consent-error" message={errors.consentPersonalData} />
      </div>

      <button
        type="submit"
        className="flex min-h-12 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-[17px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        Отправить заявку
      </button>
    </form>
  );
}

export default function AuthorApplicationPanel({
  audience,
  application,
  workspaceCount,
  defaultValues,
  showSubmittedBanner,
}: AuthorApplicationPanelProps) {
  const [state, formAction] = useActionState(
    submitAuthorApplication,
    INITIAL_STATE,
  );

  if (audience === "guest") {
    return (
      <section
        className="rounded-[24px] border border-[#eadff8] bg-white p-5 shadow-sm lg:p-6"
        aria-labelledby="become-author-cta-heading"
      >
        <h2 id="become-author-cta-heading" className="text-[21px] font-semibold">
          Начать путь автора
        </h2>
        <p className={`mt-3 ${becomeAuthorBodyClass}`}>
          Зарегистрируйтесь как слушатель, а затем подайте заявку на авторство.
        </p>
        <Link
          href={buildAuthRouteHref("/auth/sign-up", "/become-author")}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-[17px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Зарегистрироваться и подать заявку
        </Link>
        <Link
          href={buildAuthRouteHref("/auth/sign-in", "/become-author")}
          className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-[#bda6e1] px-5 py-3 text-[17px] font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Уже есть аккаунт
        </Link>
      </section>
    );
  }

  if (audience === "author") {
    return (
      <section className="rounded-[24px] border border-[#cfe8d9] bg-[#f3fbf6] p-5 lg:p-6">
        <h2 className="text-[21px] font-semibold text-[#25135c]">
          Вы уже являетесь автором АудиоЛада
        </h2>
        <p className={`mt-3 ${becomeAuthorBodyClass}`}>
          Откройте кабинет автора, чтобы управлять материалами и продуктами.
        </p>
        <Link
          href="/author-dashboard"
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-[17px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Открыть кабинет автора
        </Link>
      </section>
    );
  }

  const status = application?.status ?? null;
  const showForm = shouldShowAuthorApplicationForm({
    workspaceCount,
    applicationStatus: status,
  });

  if (showSubmittedBanner) {
    return (
      <section
        className="rounded-[24px] border border-[#cfe8d9] bg-[#f3fbf6] p-5 lg:p-6"
        aria-live="polite"
      >
        <h2 className="text-[21px] font-semibold text-[#25135c]">Заявка отправлена</h2>
        <p className={`mt-3 ${becomeAuthorBodyClass}`}>
          Мы познакомимся с вашим опытом и свяжемся с вами при необходимости.
          Статус заявки можно посмотреть здесь и в профиле.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <Link
            href="/profile"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-[17px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Вернуться в профиль
          </Link>
          <Link
            href="/catalog"
            className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#bda6e1] px-5 py-3 text-[17px] font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Открыть каталог
          </Link>
        </div>
      </section>
    );
  }

  if (showForm) {
    return (
      <section
        className="rounded-[24px] border border-[#eadff8] bg-white p-5 shadow-sm lg:p-6"
        aria-labelledby="become-author-form-heading"
      >
        <h2 id="become-author-form-heading" className="text-[21px] font-semibold">
          Заявка автора
        </h2>
        <p className={`mt-2 ${becomeAuthorBodyClass}`}>
          Заполните короткую форму — мы рассмотрим её и свяжемся с вами при
          необходимости.
        </p>
        <div className="mt-5">
          <AuthorApplicationForm
            defaultValues={defaultValues}
            state={state}
            formAction={formAction}
          />
        </div>
      </section>
    );
  }

  const title = status
    ? getAuthorApplicationStatusTitle(status, workspaceCount > 0)
    : "Статус заявки";
  const description = status
    ? getAuthorApplicationStatusDescription(status, workspaceCount > 0)
    : "";

  return (
    <section
      className="rounded-[24px] border border-[#eadff8] bg-white p-5 shadow-sm lg:p-6"
      aria-labelledby="become-author-status-heading"
    >
      <h2 id="become-author-status-heading" className="text-[21px] font-semibold">
        {title}
      </h2>
      <p className={`mt-3 ${becomeAuthorBodyClass}`}>{description}</p>

      {application?.review_comment &&
      (status === "needs_changes" || status === "rejected") ? (
        <div
          className={`mt-4 rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 ${becomeAuthorBodyClass}`}
        >
          <p className="font-medium text-[#7042c5]">Комментарий команды</p>
          <p className="mt-2">{application.review_comment}</p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3">
        {status === "needs_changes" ? (
          <Link
            href="/become-author"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-[17px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
          >
            Дополнить заявку
          </Link>
        ) : null}

        <Link
          href="/profile"
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#bda6e1] px-5 py-3 text-[17px] font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Вернуться в профиль
        </Link>
      </div>
    </section>
  );
}
