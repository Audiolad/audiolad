"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  formatPayoutRequisitesSummary,
  maskEmail,
  maskInn,
  maskPhone,
} from "@/lib/author-payout-profiles/masking";
import { sensitivePayloadToFormValues } from "@/lib/author-payout-profiles/payload";
import type {
  AuthorPayoutMethod,
  AuthorPayoutProfileFormValues,
  AuthorPayoutProfilePublicView,
  AuthorPayoutRecipientType,
} from "@/lib/author-payout-profiles/types";
import {
  getAuthorPayoutMethodLabel,
  getAuthorPayoutProfileStatusLabel,
  getAuthorPayoutRecipientTypeLabel,
} from "@/lib/author-payout-profiles/types";
import {
  emptyAuthorPayoutProfileFormValues,
  type AuthorPayoutProfileFieldErrors,
} from "@/lib/author-payout-profiles/validation";

type AuthorPayoutProfileFormProps = {
  authorId: string;
  backHref: string;
  initialEmail?: string | null;
};

const RECIPIENT_OPTIONS: Array<{
  type: AuthorPayoutRecipientType;
  label: string;
  description: string;
}> = [
  {
    type: "self_employed",
    label: "Самозанятый",
    description: "Налог на профессиональный доход",
  },
  {
    type: "individual_entrepreneur",
    label: "Индивидуальный предприниматель",
    description: "ИП",
  },
  {
    type: "individual",
    label: "Физическое лицо",
    description: "Без статуса ИП или самозанятого",
  },
];

const METHOD_OPTIONS: Array<{
  method: AuthorPayoutMethod;
  label: string;
  description: string;
}> = [
  {
    method: "card",
    label: "Банковская карта",
    description: "Перевод на карту",
  },
  {
    method: "sbp",
    label: "СБП",
    description: "По номеру телефона",
  },
  {
    method: "bank_account",
    label: "Банковский счёт",
    description: "Расчётный или личный счёт",
  },
];

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-[#b34f63]">{message}</p>;
}

const inputClassName =
  "mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#25135c] disabled:opacity-70";

function profileToFormValues(
  profile: AuthorPayoutProfilePublicView,
  initialEmail?: string | null,
): AuthorPayoutProfileFormValues {
  if (profile.fields) {
    const values = sensitivePayloadToFormValues(
      profile.recipient_type,
      profile.fields,
      {
        is_npd_declared: profile.is_npd_declared,
        author_revision_comment: profile.author_revision_comment,
      },
    );
    if (!values.email && initialEmail) {
      values.email = initialEmail;
    }
    return values;
  }

  return {
    ...emptyAuthorPayoutProfileFormValues(),
    recipient_type: profile.recipient_type,
    payout_method: profile.payout_method ?? "",
    bank_name: profile.bank_display_name ?? "",
    email: initialEmail?.trim() || "",
  };
}

export default function AuthorPayoutProfileForm({
  authorId,
  backHref,
  initialEmail = null,
}: AuthorPayoutProfileFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [beginningEdit, setBeginningEdit] = useState(false);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [replaceRequisites, setReplaceRequisites] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] =
    useState<AuthorPayoutProfileFieldErrors>({});
  const [profile, setProfile] = useState<AuthorPayoutProfilePublicView | null>(
    null,
  );
  const [values, setValues] = useState<AuthorPayoutProfileFormValues>(() => ({
    ...emptyAuthorPayoutProfileFormValues(),
    email: initialEmail?.trim() || "",
  }));

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError(null);
      setSuccess(null);
      setFieldErrors({});
      setReplaceRequisites(false);

      try {
        const response = await fetch(
          `/api/author/payout-profile?author_id=${encodeURIComponent(authorId)}`,
        );
        if (!response.ok) throw new Error("load_failed");

        const payload = (await response.json()) as {
          profile: AuthorPayoutProfilePublicView | null;
        };
        if (cancelled) return;

        const row = payload.profile ?? null;
        setProfile(row);
        setValues(
          row
            ? profileToFormValues(row, initialEmail)
            : {
                ...emptyAuthorPayoutProfileFormValues(),
                email: initialEmail?.trim() || "",
              },
        );
      } catch {
        if (!cancelled) setError("Не удалось загрузить данные.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [authorId, initialEmail]);

  function updateField<K extends keyof AuthorPayoutProfileFormValues>(
    key: K,
    value: AuthorPayoutProfileFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function buildPayload() {
    return {
      author_id: authorId,
      recipient_type: values.recipient_type,
      payout_method: values.payout_method,
      legal_name: values.legal_name,
      first_name: values.first_name,
      last_name: values.last_name,
      middle_name: values.middle_name,
      inn: values.inn,
      ogrnip: values.ogrnip,
      email: values.email,
      phone: values.phone,
      card_number: values.card_number,
      bank_account: values.bank_account,
      bank_bik: values.bank_bik,
      bank_name: values.bank_name,
      bank_correspondent_account: values.bank_correspondent_account,
      is_npd_declared: values.is_npd_declared,
      details_confirmed: values.details_confirmed,
      author_revision_comment: values.author_revision_comment,
    };
  }

  async function saveDraft() {
    setSavingDraft(true);
    setError(null);
    setSuccess(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/author/payout-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const payload = (await response.json()) as {
        error?: string;
        fieldErrors?: AuthorPayoutProfileFieldErrors;
        profile?: AuthorPayoutProfilePublicView;
      };

      if (!response.ok) {
        if (payload.fieldErrors) setFieldErrors(payload.fieldErrors);
        setError(
          payload.error === "feature_not_available"
            ? "Заполнение данных для выплат временно недоступно. Попробуйте позднее."
            : "Не удалось сохранить черновик.",
        );
        return;
      }

      if (payload.profile) {
        setProfile(payload.profile);
        setValues(profileToFormValues(payload.profile, initialEmail));
        setReplaceRequisites(false);
      }
      setSuccess("Черновик сохранён.");
      router.refresh();
    } catch {
      setError("Не удалось сохранить черновик.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function saveComplete() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/author/payout-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildPayload(),
          action: "submit",
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        fieldErrors?: AuthorPayoutProfileFieldErrors;
        profile?: AuthorPayoutProfilePublicView;
      };

      if (!response.ok) {
        if (payload.fieldErrors) setFieldErrors(payload.fieldErrors);
        setError(
          payload.error === "feature_not_available"
            ? "Заполнение данных для выплат временно недоступно. Попробуйте позднее."
            : "Не удалось сохранить данные.",
        );
        return;
      }

      if (payload.profile) {
        setProfile(payload.profile);
        setValues(profileToFormValues(payload.profile, initialEmail));
        setReplaceRequisites(false);
      }
      setSuccess("Данные для выплат сохранены.");
      router.refresh();
    } catch {
      setError("Не удалось сохранить данные.");
    } finally {
      setSaving(false);
    }
  }

  async function beginVerifiedEdit() {
    setBeginningEdit(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/author/payout-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_id: authorId,
          action: "begin_edit",
          confirm: true,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        profile?: AuthorPayoutProfilePublicView;
      };

      if (!response.ok) {
        setError(payload.error ?? "Не удалось открыть редактирование.");
        return;
      }

      if (payload.profile) {
        setProfile(payload.profile);
        setValues(profileToFormValues(payload.profile, initialEmail));
        setReplaceRequisites(true);
      }
      setShowEditConfirm(false);
      setSuccess("Форма открыта для изменения реквизитов.");
      router.refresh();
    } catch {
      setError("Не удалось открыть редактирование.");
    } finally {
      setBeginningEdit(false);
    }
  }

  const status = profile?.status ?? null;
  const editable = profile?.can_edit ?? true;
  const busy = savingDraft || saving || beginningEdit;
  const recipientType = values.recipient_type;
  const payoutMethod = values.payout_method;
  const locked =
    status === "submitted" || status === "in_review" || status === "verified";
  const showForm = !locked || editable;

  const summary = useMemo(
    () =>
      formatPayoutRequisitesSummary({
        payout_method: profile?.payout_method ?? null,
        bank_display_name: profile?.bank_display_name ?? null,
        account_last4: profile?.account_last4 ?? null,
      }),
    [profile],
  );

  const hasStoredRequisites = Boolean(
    profile?.account_last4 ||
      profile?.requisites?.card.present ||
      profile?.requisites?.account.present,
  );
  const storedRequisitesMask =
    profile?.requisites?.card.masked ||
    profile?.requisites?.account.masked ||
    summary;
  const showRequisiteInputs =
    !hasStoredRequisites || replaceRequisites || !profile;

  return (
    <div
      data-payout-profile-form="true"
      className="ym-hide-content space-y-5"
    >
      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">
          Данные для выплат
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#796ba0]">
          Укажите, как вам удобно получать авторское вознаграждение. Если перед
          первой выплатой потребуются дополнительные сведения, мы свяжемся с
          вами.
        </p>

        {status ? (
          <p className="mt-4 inline-flex rounded-full bg-[#f3edfb] px-3 py-1 text-sm font-medium text-[#7042c5]">
            {getAuthorPayoutProfileStatusLabel(status)}
          </p>
        ) : null}

        {(status === "needs_changes" || status === "rejected") &&
        profile?.review_comment ? (
          <div className="mt-4 rounded-[18px] border border-[#f0dfab] bg-[#fffaf0] px-4 py-3 text-sm leading-6 text-[#8a6a1f]">
            <p className="font-medium">Нужно уточнение</p>
            <p className="mt-1 whitespace-pre-wrap">{profile.review_comment}</p>
          </div>
        ) : null}

        {locked && !editable ? (
          <div className="mt-4 space-y-3 rounded-[18px] border border-[#cfe8d9] bg-[#f3fbf6] px-4 py-4 text-sm text-[#2f5f45]">
            <p className="font-medium">Сохранённые данные</p>
            <dl className="space-y-2">
              <div>
                <dt className="text-[#5f8a72]">Кто вы</dt>
                <dd>
                  {getAuthorPayoutRecipientTypeLabel(profile!.recipient_type)}
                </dd>
              </div>
              {profile?.payout_method ? (
                <div>
                  <dt className="text-[#5f8a72]">Способ выплаты</dt>
                  <dd>{getAuthorPayoutMethodLabel(profile.payout_method)}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[#5f8a72]">Реквизиты</dt>
                <dd className="font-mono">{summary}</dd>
              </div>
              {profile?.inn_last4 ? (
                <div>
                  <dt className="text-[#5f8a72]">ИНН</dt>
                  <dd className="font-mono">•••• {profile.inn_last4}</dd>
                </div>
              ) : null}
            </dl>

            {status === "verified" ? (
              !showEditConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowEditConfirm(true)}
                  className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full border border-[#9bc9b0] px-5 text-sm font-medium text-[#2f5f45]"
                >
                  Изменить реквизиты
                </button>
              ) : (
                <div className="mt-3 rounded-[16px] border border-[#cfe8d9] bg-white px-4 py-3">
                  <p>
                    После изменения данные снова нужно будет сохранить. Полный
                    номер карты или счёта заново вводится вручную и не
                    подставляется в форму.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void beginVerifiedEdit()}
                      disabled={beginningEdit}
                      className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#3d8d65] px-5 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {beginningEdit ? "Открытие…" : "Продолжить"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEditConfirm(false)}
                      className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5]"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )
            ) : (
              <p className="mt-2 text-[#5f8a72]">
                Данные сохранены. Редактирование откроется, если потребуются
                уточнения.
              </p>
            )}
          </div>
        ) : null}

        {loading ? (
          <p className="mt-5 text-sm text-[#7d70a2]">Загрузка…</p>
        ) : showForm ? (
          <form
            className="mt-5 space-y-5"
            autoComplete="off"
            onSubmit={(event) => event.preventDefault()}
          >
            {error ? (
              <div className="rounded-[18px] border border-[#efc7cf] bg-[#fff8f9] px-4 py-3 text-sm text-[#b34f63]">
                {error}
              </div>
            ) : null}
            {success ? (
              <div className="rounded-[18px] border border-[#cfe8d9] bg-[#f3fbf6] px-4 py-3 text-sm text-[#3d8d65]">
                {success}
              </div>
            ) : null}

            <fieldset>
              <legend className="text-sm font-medium text-[#25135c]">
                Кто вы?
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {RECIPIENT_OPTIONS.map((option) => {
                  const selected = recipientType === option.type;
                  return (
                    <label
                      key={option.type}
                      className={`flex min-h-[88px] cursor-pointer flex-col rounded-[18px] border px-4 py-3 ${
                        selected
                          ? "border-[#7042c5] bg-[#f3edfb]"
                          : "border-[#eadff8] bg-[#faf6ff]"
                      } ${!editable || busy ? "opacity-60" : ""}`}
                    >
                      <span className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="recipient_type"
                          value={option.type}
                          checked={selected}
                          disabled={!editable || busy}
                          onChange={() =>
                            updateField("recipient_type", option.type)
                          }
                          className="mt-1 h-4 w-4 accent-[#7042c5]"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-[#25135c]">
                            {option.label}
                          </span>
                          <span className="mt-1 block text-sm text-[#796ba0]">
                            {option.description}
                          </span>
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <FieldError message={fieldErrors.recipient_type} />
            </fieldset>

            {recipientType ? (
              <>
                {recipientType === "individual" ? (
                  <div className="rounded-[18px] border border-[#e8dff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#5f5484]">
                    Налоги и обязательные удержания применяются в соответствии с
                    законодательством и статусом получателя.
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-[#25135c]">
                      Фамилия
                    </span>
                    <input
                      type="text"
                      value={values.last_name}
                      onChange={(e) => updateField("last_name", e.target.value)}
                      disabled={!editable || busy}
                      autoComplete="off"
                      className={inputClassName}
                    />
                    <FieldError message={fieldErrors.last_name} />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-[#25135c]">
                      Имя
                    </span>
                    <input
                      type="text"
                      value={values.first_name}
                      onChange={(e) =>
                        updateField("first_name", e.target.value)
                      }
                      disabled={!editable || busy}
                      autoComplete="off"
                      className={inputClassName}
                    />
                    <FieldError message={fieldErrors.first_name} />
                  </label>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-[#25135c]">
                    Отчество{" "}
                    <span className="font-normal text-[#9485b4]">
                      (необязательно)
                    </span>
                  </span>
                  <input
                    type="text"
                    value={values.middle_name}
                    onChange={(e) => updateField("middle_name", e.target.value)}
                    disabled={!editable || busy}
                    autoComplete="off"
                    className={inputClassName}
                  />
                  <FieldError message={fieldErrors.middle_name} />
                </label>

                {recipientType === "self_employed" ||
                recipientType === "individual_entrepreneur" ? (
                  <label className="block">
                    <span className="text-sm font-medium text-[#25135c]">
                      ИНН
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={values.inn}
                      onChange={(e) => updateField("inn", e.target.value)}
                      disabled={!editable || busy}
                      autoComplete="off"
                      data-mask="true"
                      className={inputClassName}
                    />
                    <FieldError message={fieldErrors.inn} />
                  </label>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-[#25135c]">
                      Email для связи по выплатам
                    </span>
                    <input
                      type="email"
                      value={values.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      disabled={!editable || busy}
                      autoComplete="off"
                      className={inputClassName}
                    />
                    <FieldError message={fieldErrors.email} />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-[#25135c]">
                      Телефон
                    </span>
                    <input
                      type="tel"
                      value={values.phone}
                      onChange={(e) => updateField("phone", e.target.value)}
                      disabled={!editable || busy}
                      autoComplete="off"
                      inputMode="tel"
                      placeholder="+7 …"
                      data-mask="true"
                      className={inputClassName}
                    />
                    <FieldError message={fieldErrors.phone} />
                  </label>
                </div>

                <fieldset>
                  <legend className="text-sm font-medium text-[#25135c]">
                    Способ получения выплаты
                  </legend>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {METHOD_OPTIONS.map((option) => {
                      const selected = payoutMethod === option.method;
                      return (
                        <label
                          key={option.method}
                          className={`flex min-h-[88px] cursor-pointer flex-col rounded-[18px] border px-4 py-3 ${
                            selected
                              ? "border-[#7042c5] bg-[#f3edfb]"
                              : "border-[#eadff8] bg-[#faf6ff]"
                          }`}
                        >
                          <span className="flex items-start gap-3">
                            <input
                              type="radio"
                              name="payout_method"
                              value={option.method}
                              checked={selected}
                              disabled={!editable || busy}
                              onChange={() => {
                                updateField("payout_method", option.method);
                                setReplaceRequisites(true);
                                updateField("card_number", "");
                                updateField("bank_account", "");
                              }}
                              className="mt-1 h-4 w-4 accent-[#7042c5]"
                            />
                            <span>
                              <span className="block text-sm font-semibold text-[#25135c]">
                                {option.label}
                              </span>
                              <span className="mt-1 block text-sm text-[#796ba0]">
                                {option.description}
                              </span>
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <FieldError message={fieldErrors.payout_method} />
                </fieldset>

                {payoutMethod ? (
                  <div className="space-y-4 rounded-[18px] border border-[#eadff8] bg-[#fcfaff] px-4 py-4">
                    {hasStoredRequisites && !replaceRequisites ? (
                      <div className="space-y-2 text-sm text-[#5f5484]">
                        <p className="font-medium text-[#25135c]">
                          Сохранённые реквизиты
                        </p>
                        <p className="font-mono">{storedRequisitesMask}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setReplaceRequisites(true);
                            updateField("card_number", "");
                            updateField("bank_account", "");
                          }}
                          className="inline-flex min-h-10 items-center rounded-full border border-[#bda6e1] px-4 text-sm font-medium text-[#7042c5]"
                        >
                          Изменить реквизиты
                        </button>
                      </div>
                    ) : null}

                    {showRequisiteInputs ? (
                      <>
                        <label className="block">
                          <span className="text-sm font-medium text-[#25135c]">
                            Банк получателя
                          </span>
                          <input
                            type="text"
                            value={values.bank_name}
                            onChange={(e) =>
                              updateField("bank_name", e.target.value)
                            }
                            disabled={!editable || busy}
                            autoComplete="off"
                            className={inputClassName}
                          />
                          <FieldError message={fieldErrors.bank_name} />
                        </label>

                        {payoutMethod === "card" ? (
                          <label className="block">
                            <span className="text-sm font-medium text-[#25135c]">
                              Номер карты
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              name="audiolad-payout-card"
                              value={values.card_number}
                              onChange={(e) =>
                                updateField("card_number", e.target.value)
                              }
                              disabled={!editable || busy}
                              autoComplete="new-password"
                              autoCorrect="off"
                              spellCheck={false}
                              data-lpignore="true"
                              data-1p-ignore="true"
                              data-form-type="other"
                              data-mask="true"
                              placeholder={
                                hasStoredRequisites
                                  ? "Введите новый номер карты"
                                  : undefined
                              }
                              className={inputClassName}
                            />
                            <FieldError message={fieldErrors.card_number} />
                          </label>
                        ) : null}

                        {payoutMethod === "sbp" ? (
                          <p className="text-sm leading-6 text-[#796ba0]">
                            Укажите номер телефона, подключённый к СБП в
                            выбранном банке. Используется телефон из поля выше.
                          </p>
                        ) : null}

                        {payoutMethod === "bank_account" ? (
                          <>
                            <label className="block">
                              <span className="text-sm font-medium text-[#25135c]">
                                БИК
                              </span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={values.bank_bik}
                                onChange={(e) =>
                                  updateField("bank_bik", e.target.value)
                                }
                                disabled={!editable || busy}
                                autoComplete="off"
                                data-mask="true"
                                className={inputClassName}
                              />
                              <FieldError message={fieldErrors.bank_bik} />
                            </label>
                            <label className="block">
                              <span className="text-sm font-medium text-[#25135c]">
                                Номер счёта
                              </span>
                              <input
                                type="text"
                                inputMode="numeric"
                                name="audiolad-payout-account"
                                value={values.bank_account}
                                onChange={(e) =>
                                  updateField("bank_account", e.target.value)
                                }
                                disabled={!editable || busy}
                                autoComplete="new-password"
                                autoCorrect="off"
                                spellCheck={false}
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-form-type="other"
                                data-mask="true"
                                placeholder={
                                  hasStoredRequisites
                                    ? "Введите новый номер счёта"
                                    : undefined
                                }
                                className={inputClassName}
                              />
                              <FieldError message={fieldErrors.bank_account} />
                            </label>
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}

                {recipientType === "self_employed" ? (
                  <label className="flex items-start gap-3 rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#5f5484]">
                    <input
                      type="checkbox"
                      checked={values.is_npd_declared}
                      onChange={(e) =>
                        updateField("is_npd_declared", e.target.checked)
                      }
                      disabled={!editable || busy}
                      className="mt-1 h-4 w-4 accent-[#7042c5]"
                    />
                    <span>
                      Я применяю налог на профессиональный доход и сообщу
                      Платформе, если мой статус изменится.
                      <FieldError message={fieldErrors.is_npd_declared} />
                    </span>
                  </label>
                ) : null}

                <label className="flex items-start gap-3 rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#5f5484]">
                  <input
                    type="checkbox"
                    checked={values.details_confirmed}
                    onChange={(e) =>
                      updateField("details_confirmed", e.target.checked)
                    }
                    disabled={!editable || busy}
                    className="mt-1 h-4 w-4 accent-[#7042c5]"
                  />
                  <span>
                    Я подтверждаю, что указанные сведения верны и принадлежат
                    мне.
                    <FieldError message={fieldErrors.details_confirmed} />
                  </span>
                </label>

                <p className="text-sm leading-6 text-[#796ba0]">
                  Данные используются только для организации авторских выплат и
                  связи по вопросам расчётов. При необходимости перед первой
                  выплатой Платформа может запросить дополнительные сведения.{" "}
                  <Link
                    href="/privacy"
                    className="font-medium text-[#7042c5] underline-offset-2 hover:underline"
                  >
                    Политика обработки персональных данных
                  </Link>
                  .
                </p>

                {profile?.fields ? (
                  <p className="text-xs text-[#9485b4]">
                    Контакты в сохранённом профиле:{" "}
                    {maskEmail(profile.fields.email)} ·{" "}
                    {maskPhone(profile.fields.phone)}
                    {profile.fields.inn
                      ? ` · ИНН ${maskInn(profile.fields.inn)}`
                      : ""}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void saveComplete()}
                    disabled={!editable || busy}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-6 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {saving ? "Сохранение…" : "Сохранить данные"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveDraft()}
                    disabled={!editable || busy}
                    className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#bda6e1] px-6 text-sm font-medium text-[#7042c5] disabled:opacity-60"
                  >
                    {savingDraft ? "Сохранение…" : "Сохранить черновик"}
                  </button>
                  <Link
                    href={backHref}
                    className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-medium text-[#796ba0]"
                  >
                    Назад
                  </Link>
                </div>
              </>
            ) : null}
          </form>
        ) : null}
      </section>
    </div>
  );
}
