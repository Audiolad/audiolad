"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { submitAuthorApplication } from "@/app/become-author/actions";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import {
  clearAuthorApplicationDraft,
  formValuesToDraft,
  readAuthorApplicationDraft,
  resolveInitialAuthorApplicationFormValues,
  writeAuthorApplicationDraft,
} from "@/lib/author-applications/draft";
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
import {
  AUTHOR_APPLICATION_LIMITS,
  buildAuthorApplicationFormData,
} from "@/lib/author-applications/validation";

import AuthorApplicationDirectionPicker from "@/components/become-author/AuthorApplicationDirectionPicker";
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

const DRAFT_DEBOUNCE_MS = 400;

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

function AuthorApplicationSuccessScreen({ contact }: { contact: string }) {
  return (
    <section
      className="rounded-[24px] border border-[#cfe8d9] bg-[#f3fbf6] p-5 lg:p-6"
      aria-live="polite"
    >
      <h2 className="text-[21px] font-semibold text-[#25135c]">
        Спасибо! Ваша заявка принята
      </h2>
      <p className={`mt-3 ${becomeAuthorBodyClass}`}>
        Мы рассмотрим её и свяжемся с вами по указанному контакту.
      </p>
      <div
        className={`mt-4 rounded-[18px] border border-[#cfe8d9] bg-white px-4 py-3 ${becomeAuthorBodyClass}`}
      >
        <p className="font-medium text-[#25135c]">Контакт для связи:</p>
        <p className="mt-1 break-words text-[#25135c]">{contact}</p>
      </div>
      <p className={`mt-4 ${becomeAuthorBodyClass}`}>
        Статус заявки всегда можно посмотреть в вашем профиле.
      </p>
      <div className="mt-5 flex flex-col gap-3">
        <Link
          href="/profile"
          className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-[17px] font-medium text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          Перейти в профиль
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#bda6e1] px-5 py-3 text-[17px] font-medium text-[#7042c5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
        >
          На главную
        </Link>
      </div>
    </section>
  );
}

function AuthorApplicationForm({
  values,
  errors,
  isPending,
  restoredDraftNotice,
  onValuesChange,
  onSubmit,
}: {
  values: AuthorApplicationFormValues;
  errors: AuthorApplicationFormState["errors"];
  isPending: boolean;
  restoredDraftNotice: boolean;
  onValuesChange: (next: AuthorApplicationFormValues) => void;
  onSubmit: () => void;
}) {
  const contactInputRef = useRef<HTMLInputElement>(null);

  function patchValues(patch: Partial<AuthorApplicationFormValues>) {
    onValuesChange({ ...values, ...patch });
  }

  return (
    <form
      className="space-y-4 pb-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {restoredDraftNotice ? (
        <div className="rounded-[18px] border border-[#d9ccf5] bg-[#faf6ff] px-4 py-3 text-[15px] leading-snug text-[#5f538f]">
          Мы восстановили данные, которые вы вводили ранее.
        </div>
      ) : null}

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
          value={values.displayName}
          onChange={(event) => patchValues({ displayName: event.currentTarget.value })}
          aria-invalid={Boolean(errors.displayName)}
          aria-describedby={errors.displayName ? "displayName-error" : undefined}
          className={becomeAuthorInputClass}
          disabled={isPending}
        />
        <FieldError id="displayName-error" message={errors.displayName} />
      </div>

      <AuthorApplicationDirectionPicker
        selectedDirections={values.selectedDirections}
        directionOther={values.directionOther}
        directionError={errors.direction}
        directionOtherError={errors.directionOther}
        onSelectedDirectionsChange={(selectedDirections) =>
          patchValues({ selectedDirections })
        }
        onDirectionOtherChange={(directionOther) => patchValues({ directionOther })}
      />

      <div>
        <label htmlFor="about" className={becomeAuthorLabelClass}>
          Расскажите немного о себе и о том, чем занимаетесь{" "}
          <span className="text-[#b34f63]">*</span>
        </label>
        <textarea
          id="about"
          name="about"
          required
          minLength={AUTHOR_APPLICATION_LIMITS.aboutMin}
          maxLength={AUTHOR_APPLICATION_LIMITS.aboutMax}
          rows={4}
          value={values.about}
          onChange={(event) => patchValues({ about: event.currentTarget.value })}
          aria-invalid={Boolean(errors.about)}
          aria-describedby={errors.about ? "about-error" : undefined}
          className={`${becomeAuthorTextareaClass} min-h-[150px]`}
          disabled={isPending}
        />
        <FieldError id="about-error" message={errors.about} />
      </div>

      <div>
        <label htmlFor="contact" className={becomeAuthorLabelClass}>
          Телефон, MAX или другой удобный способ связи{" "}
          <span className="text-[#b34f63]">*</span>
        </label>
        <input
          ref={contactInputRef}
          id="contact"
          name="contact"
          type="text"
          required
          minLength={AUTHOR_APPLICATION_LIMITS.contactMin}
          maxLength={AUTHOR_APPLICATION_LIMITS.contactMax}
          value={values.contact}
          onChange={(event) => patchValues({ contact: event.currentTarget.value })}
          aria-invalid={Boolean(errors.contact)}
          aria-describedby={errors.contact ? "contact-error" : undefined}
          className={becomeAuthorInputClass}
          disabled={isPending}
        />
        <FieldError id="contact-error" message={errors.contact} />
      </div>

      <fieldset
        className="space-y-3"
        aria-describedby={errors.readiness ? "readiness-error" : undefined}
      >
        <legend className={becomeAuthorLabelClass}>
          Ваш опыт с аудиопрактиками <span className="text-[#b34f63]">*</span>
        </legend>

        <label className={becomeAuthorCheckboxCardClass}>
          <input
            type="checkbox"
            name="hasReadyMaterials"
            checked={values.hasReadyMaterials}
            onChange={(event) =>
              patchValues({ hasReadyMaterials: event.currentTarget.checked })
            }
            className="mt-1 h-5 w-5 shrink-0 accent-[#7042c5]"
            disabled={isPending}
          />
          <span className={`${becomeAuthorBodyClass} text-[#25135c]`}>
            Я уже записываю свои аудиопрактики
          </span>
        </label>

        <label className={becomeAuthorCheckboxCardClass}>
          <input
            type="checkbox"
            name="wantsTraining"
            checked={values.wantsTraining}
            onChange={(event) =>
              patchValues({ wantsTraining: event.currentTarget.checked })
            }
            className="mt-1 h-5 w-5 shrink-0 accent-[#7042c5]"
            disabled={isPending}
          />
          <span className={`${becomeAuthorBodyClass} text-[#25135c]`}>
            Хочу научиться создавать аудиопрактики
          </span>
        </label>

        <FieldError id="readiness-error" message={errors.readiness} />
      </fieldset>

      <label className={becomeAuthorCheckboxCardClass}>
        <input
          type="checkbox"
          name="interestedInSchool"
          checked={values.interestedInSchool}
          onChange={(event) =>
            patchValues({ interestedInSchool: event.currentTarget.checked })
          }
          className="mt-1 h-5 w-5 shrink-0 accent-[#7042c5]"
          disabled={isPending}
        />
        <span className={`${becomeAuthorBodyClass} text-[#25135c]`}>
          Мне интересно обучение в Школе аудиопрактик
        </span>
      </label>

      <div>
        <label className={becomeAuthorCheckboxCardClass}>
          <input
            type="checkbox"
            name="consentPersonalData"
            checked={values.consentPersonalData}
            onChange={(event) =>
              patchValues({ consentPersonalData: event.currentTarget.checked })
            }
            required
            aria-invalid={Boolean(errors.consentPersonalData)}
            aria-describedby={
              errors.consentPersonalData ? "consent-error" : undefined
            }
            className="mt-1 h-5 w-5 shrink-0 accent-[#7042c5]"
            disabled={isPending}
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

      {values.contact.trim() ? (
        <div className="rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3">
          <p className={`${becomeAuthorBodyClass} text-[#25135c]`}>
            Мы свяжемся с вами по контакту:{" "}
            <span className="font-medium break-words">{values.contact.trim()}</span>
          </p>
          <button
            type="button"
            onClick={() => contactInputRef.current?.focus()}
            className="mt-2 text-[15px] font-medium text-[#7042c5] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
            disabled={isPending}
          >
            Изменить
          </button>
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
        className="flex min-h-12 w-full items-center justify-center rounded-full bg-[#7042c5] px-5 py-3 text-[17px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        {isPending ? "Отправляем…" : "Стать автором"}
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
  const [state, submitAction, isPending] = useActionState(
    submitAuthorApplication,
    INITIAL_STATE,
  );

  const initialResolution = useMemo(
    () =>
      resolveInitialAuthorApplicationFormValues({
        databaseValues: defaultValues,
        application,
        draft: null,
      }),
    [application, defaultValues],
  );

  const [formValues, setFormValues] = useState(initialResolution.values);
  const [restoredDraftNotice, setRestoredDraftNotice] = useState(false);
  const [successContact, setSuccessContact] = useState<string | null>(null);
  const draftHydratedRef = useRef(false);
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    if (draftHydratedRef.current) {
      return;
    }

    draftHydratedRef.current = true;

    const draft = readAuthorApplicationDraft(window.localStorage);
    const resolved = resolveInitialAuthorApplicationFormValues({
      databaseValues: defaultValues,
      application,
      draft,
    });

    setFormValues(resolved.values);
    setRestoredDraftNotice(resolved.restoredFromDraft);

    if (application && resolved.restoredFromDraft === false) {
      clearAuthorApplicationDraft(window.localStorage);
    }
  }, [application, defaultValues]);

  useEffect(() => {
    if (successContact || showSubmittedBanner) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      writeAuthorApplicationDraft(
        window.localStorage,
        formValuesToDraft(formValues),
      );
    }, DRAFT_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [formValues, showSubmittedBanner, successContact]);

  function handleSubmit() {
    if (isPending || submitInFlightRef.current) {
      return;
    }

    submitInFlightRef.current = true;

    void Promise.resolve(
      submitAction(buildAuthorApplicationFormData(formValues)),
    ).then((nextState) => {
      submitInFlightRef.current = false;

      if (!nextState) {
        return;
      }

      if (nextState.submitted && nextState.submittedContact) {
        clearAuthorApplicationDraft(window.localStorage);
        setSuccessContact(nextState.submittedContact);
        return;
      }

      if (nextState.values) {
        setFormValues(nextState.values);
      }
    });
  }

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

  const resolvedSuccessContact =
    successContact ??
    (showSubmittedBanner ? defaultValues.contact.trim() || null : null);

  if (resolvedSuccessContact) {
    return <AuthorApplicationSuccessScreen contact={resolvedSuccessContact} />;
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

        {application?.review_comment && status === "needs_changes" ? (
          <div
            className={`mt-4 rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 ${becomeAuthorBodyClass}`}
          >
            <p className="font-medium text-[#7042c5]">Комментарий команды</p>
            <p className="mt-2">{application.review_comment}</p>
          </div>
        ) : null}

        <div className="mt-5">
          <AuthorApplicationForm
            values={formValues}
            errors={state.errors}
            isPending={isPending}
            restoredDraftNotice={restoredDraftNotice}
            onValuesChange={setFormValues}
            onSubmit={handleSubmit}
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
