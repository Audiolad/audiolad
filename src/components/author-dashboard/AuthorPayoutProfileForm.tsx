"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  AUTHOR_COMMERCIAL_SHARE_BPS,
  PLATFORM_COMMERCIAL_SHARE_BPS,
} from "@/lib/author-commercial/economics";
import {
  maskBankAccount,
  maskEmail,
  maskInn,
  maskPhone,
} from "@/lib/author-payout-profiles/masking";
import { sensitivePayloadToFormValues } from "@/lib/author-payout-profiles/payload";
import type {
  AuthorPayoutProfileFormValues,
  AuthorPayoutProfilePublicView,
  AuthorPayoutRecipientType,
} from "@/lib/author-payout-profiles/types";
import {
  AUTHOR_PAYOUT_RECIPIENT_TYPE_COMING_SOON,
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
};

type RecipientCard = {
  type: AuthorPayoutRecipientType | typeof AUTHOR_PAYOUT_RECIPIENT_TYPE_COMING_SOON;
  label: string;
  description: string;
  disabled?: boolean;
};

const RECIPIENT_CARDS: RecipientCard[] = [
  {
    type: "self_employed",
    label: "Самозанятый",
    description: "Режим «Налог на профессиональный доход»",
  },
  {
    type: "individual_entrepreneur",
    label: "Индивидуальный предприниматель",
    description: "ИП с расчётным счётом",
  },
  {
    type: "individual",
    label: "Физическое лицо",
    description: "Выплаты как физлицу",
  },
  {
    type: AUTHOR_PAYOUT_RECIPIENT_TYPE_COMING_SOON,
    label: "ООО",
    description: "Скоро",
    disabled: true,
  },
];

function formatSharePercent(bps: number): string {
  return String(bps / 100);
}

function profileToFormValues(
  profile: AuthorPayoutProfilePublicView,
): AuthorPayoutProfileFormValues {
  if (profile.fields) {
    return sensitivePayloadToFormValues(profile.recipient_type, profile.fields, {
      is_npd_declared: profile.is_npd_declared,
      author_revision_comment: profile.author_revision_comment,
    });
  }

  return {
    ...emptyAuthorPayoutProfileFormValues(),
    recipient_type: profile.recipient_type,
  };
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="mt-1 text-sm text-[#b34f63]">{message}</p>;
}

const inputClassName =
  "mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#25135c] disabled:opacity-70";

export default function AuthorPayoutProfileForm({
  authorId,
  backHref,
}: AuthorPayoutProfileFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [beginningEdit, setBeginningEdit] = useState(false);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] =
    useState<AuthorPayoutProfileFieldErrors>({});
  const [profile, setProfile] = useState<AuthorPayoutProfilePublicView | null>(
    null,
  );
  const [values, setValues] = useState<AuthorPayoutProfileFormValues>(
    emptyAuthorPayoutProfileFormValues(),
  );

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError(null);
      setSuccess(null);
      setFieldErrors({});

      try {
        const response = await fetch(
          `/api/author/payout-profile?author_id=${encodeURIComponent(authorId)}`,
        );

        if (!response.ok) {
          throw new Error("load_failed");
        }

        const payload = (await response.json()) as {
          profile: AuthorPayoutProfilePublicView | null;
        };

        if (cancelled) {
          return;
        }

        const row = payload.profile ?? null;
        setProfile(row);
        setValues(row ? profileToFormValues(row) : emptyAuthorPayoutProfileFormValues());
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить данные.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [authorId]);

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
      legal_name: values.legal_name,
      first_name: values.first_name,
      last_name: values.last_name,
      middle_name: values.middle_name,
      inn: values.inn,
      ogrnip: values.ogrnip,
      email: values.email,
      phone: values.phone,
      bank_account: values.bank_account,
      bank_bik: values.bank_bik,
      bank_name: values.bank_name,
      bank_correspondent_account: values.bank_correspondent_account,
      registration_address: values.registration_address,
      tax_residency_note: values.tax_residency_note,
      is_npd_declared: values.is_npd_declared,
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
        if (payload.fieldErrors) {
          setFieldErrors(payload.fieldErrors);
        }
        setError(payload.error ?? "Не удалось сохранить черновик.");
        return;
      }

      if (payload.profile) {
        setProfile(payload.profile);
        setValues(profileToFormValues(payload.profile));
      }

      setSuccess("Черновик сохранён.");
      router.refresh();
    } catch {
      setError("Не удалось сохранить черновик.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function submitProfile() {
    setSubmitting(true);
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
        if (payload.fieldErrors) {
          setFieldErrors(payload.fieldErrors);
        }
        setError(payload.error ?? "Не удалось отправить данные.");
        return;
      }

      if (payload.profile) {
        setProfile(payload.profile);
        setValues(profileToFormValues(payload.profile));
      }

      setSuccess("Данные отправлены на проверку.");
      router.refresh();
    } catch {
      setError("Не удалось отправить данные.");
    } finally {
      setSubmitting(false);
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
        setValues(profileToFormValues(payload.profile));
      }

      setShowEditConfirm(false);
      setSuccess("Форма открыта для редактирования. После изменений потребуется повторная проверка.");
      router.refresh();
    } catch {
      setError("Не удалось открыть редактирование.");
    } finally {
      setBeginningEdit(false);
    }
  }

  const status = profile?.status ?? null;
  const statusLabel = status ? getAuthorPayoutProfileStatusLabel(status) : null;
  const editable = profile?.can_edit ?? true;
  const canSubmit = profile?.can_submit ?? true;
  const busy = savingDraft || submitting || beginningEdit;
  const recipientType = values.recipient_type;
  const showFormFields =
    !profile ||
    editable ||
    status === "draft" ||
    status === "needs_changes";

  const authorShare = formatSharePercent(AUTHOR_COMMERCIAL_SHARE_BPS);
  const platformShare = formatSharePercent(PLATFORM_COMMERCIAL_SHARE_BPS);

  return (
    <div
      className="space-y-5"
      data-ym-disable-webvisor="true"
    >
      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">
          Данные для выплат
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#796ba0]">
          Укажите сведения, необходимые для начисления и перечисления авторского
          вознаграждения. Данные хранятся в зашифрованном виде и доступны только
          уполномоченным сотрудникам платформы.
        </p>

        {statusLabel ? (
          <p className="mt-4 inline-flex rounded-full bg-[#f3edfb] px-3 py-1 text-sm font-medium text-[#7042c5]">
            Статус: {statusLabel}
          </p>
        ) : null}

        <div className="mt-4 rounded-[18px] border border-[#e8dff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#5f5484]">
          <p className="font-medium text-[#25135c]">Как распределяется доход</p>
          <p className="mt-1">
            Автор получает {authorShare}% от суммы продажи, платформа —{" "}
            {platformShare}%. Точные условия фиксируются в соглашении о
            сотрудничестве.
          </p>
        </div>

        {status === "submitted" || status === "in_review" ? (
          <p className="mt-4 text-sm leading-6 text-[#796ba0]">
            Данные проверяются. Обычно это занимает до нескольких рабочих дней.
            Пока проверка не завершена, редактирование недоступно.
          </p>
        ) : null}

        {(status === "needs_changes" || status === "rejected") &&
        profile?.review_comment ? (
          <div className="mt-4 rounded-[18px] border border-[#f0dfab] bg-[#fffaf0] px-4 py-3 text-sm leading-6 text-[#8a6a1f]">
            <p className="font-medium">Комментарий команды</p>
            <p className="mt-1 whitespace-pre-wrap">{profile.review_comment}</p>
          </div>
        ) : null}

        {status === "verified" && profile?.fields ? (
          <div className="mt-4 space-y-3 rounded-[18px] border border-[#cfe8d9] bg-[#f3fbf6] px-4 py-4 text-sm text-[#2f5f45]">
            <p className="font-medium">Подтверждённые данные</p>
            <dl className="space-y-2">
              <div>
                <dt className="text-[#5f8a72]">Статус</dt>
                <dd>{getAuthorPayoutRecipientTypeLabel(profile.recipient_type)}</dd>
              </div>
              <div>
                <dt className="text-[#5f8a72]">ИНН</dt>
                <dd className="font-mono">{maskInn(profile.fields.inn)}</dd>
              </div>
              <div>
                <dt className="text-[#5f8a72]">Счёт</dt>
                <dd className="font-mono">
                  {maskBankAccount(profile.fields.bank_account)}
                </dd>
              </div>
              <div>
                <dt className="text-[#5f8a72]">Email</dt>
                <dd className="font-mono">{maskEmail(profile.fields.email)}</dd>
              </div>
              <div>
                <dt className="text-[#5f8a72]">Телефон</dt>
                <dd className="font-mono">{maskPhone(profile.fields.phone)}</dd>
              </div>
            </dl>
            {!showEditConfirm ? (
              <button
                type="button"
                onClick={() => setShowEditConfirm(true)}
                className="mt-2 inline-flex min-h-11 items-center justify-center rounded-full border border-[#9bc9b0] px-5 text-sm font-medium text-[#2f5f45]"
              >
                Изменить данные
              </button>
            ) : (
              <div className="mt-3 rounded-[16px] border border-[#cfe8d9] bg-white px-4 py-3 text-[#2f5f45]">
                <p>
                  После изменения данные снова отправятся на проверку. До
                  подтверждения шаг «Данные для выплат» будет считаться
                  незавершённым.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void beginVerifiedEdit()}
                    disabled={beginningEdit}
                    className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#3d8d65] px-5 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {beginningEdit ? "Открытие…" : "Подтвердить изменение"}
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
            )}
          </div>
        ) : null}

        {loading ? (
          <p className="mt-5 text-sm text-[#7d70a2]">Загрузка…</p>
        ) : showFormFields ? (
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
                Правовой статус получателя выплат
              </legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {RECIPIENT_CARDS.map((card) => {
                  const selected = recipientType === card.type;
                  const disabled = card.disabled || !editable || busy;

                  return (
                    <label
                      key={card.type}
                      className={`flex min-h-[88px] cursor-pointer flex-col rounded-[18px] border px-4 py-3 ${
                        selected
                          ? "border-[#7042c5] bg-[#f3edfb]"
                          : "border-[#eadff8] bg-[#faf6ff]"
                      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <span className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="recipient_type"
                          value={card.type}
                          checked={selected}
                          disabled={disabled || card.disabled}
                          onChange={() => {
                            if (!card.disabled) {
                              updateField(
                                "recipient_type",
                                card.type as AuthorPayoutRecipientType,
                              );
                            }
                          }}
                          className="mt-1 h-4 w-4 accent-[#7042c5]"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-[#25135c]">
                            {card.label}
                          </span>
                          <span className="mt-1 block text-sm text-[#796ba0]">
                            {card.description}
                          </span>
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <FieldError message={fieldErrors.recipient_type} />
            </fieldset>

            {recipientType === "individual" ? (
              <div className="rounded-[18px] border border-[#f0dfab] bg-[#fffaf0] px-4 py-3 text-sm leading-6 text-[#8a6a1f]">
                Выплаты физическому лицу могут облагаться налогом у источника.
                Убедитесь, что выбранный статус соответствует вашей ситуации.
              </div>
            ) : null}

            {recipientType === "individual_entrepreneur" ? (
              <label className="block">
                <span className="text-sm font-medium text-[#25135c]">
                  Полное наименование ИП
                </span>
                <input
                  type="text"
                  value={values.legal_name}
                  onChange={(event) =>
                    updateField("legal_name", event.target.value)
                  }
                  disabled={!editable || busy}
                  autoComplete="off"
                  className={inputClassName}
                />
                <FieldError message={fieldErrors.legal_name} />
              </label>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-[#25135c]">Фамилия</span>
                <input
                  type="text"
                  value={values.last_name}
                  onChange={(event) =>
                    updateField("last_name", event.target.value)
                  }
                  disabled={!editable || busy}
                  autoComplete="off"
                  className={inputClassName}
                />
                <FieldError message={fieldErrors.last_name} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[#25135c]">Имя</span>
                <input
                  type="text"
                  value={values.first_name}
                  onChange={(event) =>
                    updateField("first_name", event.target.value)
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
                <span className="font-normal text-[#9485b4]">(необязательно)</span>
              </span>
              <input
                type="text"
                value={values.middle_name}
                onChange={(event) =>
                  updateField("middle_name", event.target.value)
                }
                disabled={!editable || busy}
                autoComplete="off"
                className={inputClassName}
              />
              <FieldError message={fieldErrors.middle_name} />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-[#25135c]">ИНН</span>
              <input
                type="text"
                inputMode="numeric"
                value={values.inn}
                onChange={(event) => updateField("inn", event.target.value)}
                disabled={!editable || busy}
                autoComplete="off"
                data-mask="true"
                className={inputClassName}
              />
              <FieldError message={fieldErrors.inn} />
            </label>

            {recipientType === "individual_entrepreneur" ? (
              <label className="block">
                <span className="text-sm font-medium text-[#25135c]">ОГРНИП</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={values.ogrnip}
                  onChange={(event) =>
                    updateField("ogrnip", event.target.value)
                  }
                  disabled={!editable || busy}
                  autoComplete="off"
                  data-mask="true"
                  className={inputClassName}
                />
                <FieldError message={fieldErrors.ogrnip} />
              </label>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-[#25135c]">Email</span>
                <input
                  type="email"
                  value={values.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  disabled={!editable || busy}
                  autoComplete="off"
                  className={inputClassName}
                />
                <FieldError message={fieldErrors.email} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[#25135c]">Телефон</span>
                <input
                  type="tel"
                  value={values.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  disabled={!editable || busy}
                  autoComplete="off"
                  data-mask="true"
                  className={inputClassName}
                />
                <FieldError message={fieldErrors.phone} />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium text-[#25135c]">
                Наименование банка
              </span>
              <input
                type="text"
                value={values.bank_name}
                onChange={(event) =>
                  updateField("bank_name", event.target.value)
                }
                disabled={!editable || busy}
                autoComplete="off"
                className={inputClassName}
              />
              <FieldError message={fieldErrors.bank_name} />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-[#25135c]">БИК</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={values.bank_bik}
                  onChange={(event) =>
                    updateField("bank_bik", event.target.value)
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
                  Расчётный счёт
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={values.bank_account}
                  onChange={(event) =>
                    updateField("bank_account", event.target.value)
                  }
                  disabled={!editable || busy}
                  autoComplete="off"
                  data-mask="true"
                  className={inputClassName}
                />
                <FieldError message={fieldErrors.bank_account} />
              </label>
            </div>

            {recipientType === "individual_entrepreneur" ? (
              <label className="block">
                <span className="text-sm font-medium text-[#25135c]">
                  Корреспондентский счёт
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={values.bank_correspondent_account}
                  onChange={(event) =>
                    updateField(
                      "bank_correspondent_account",
                      event.target.value,
                    )
                  }
                  disabled={!editable || busy}
                  autoComplete="off"
                  data-mask="true"
                  className={inputClassName}
                />
                <FieldError message={fieldErrors.bank_correspondent_account} />
              </label>
            ) : null}

            {recipientType === "individual_entrepreneur" ||
            recipientType === "individual" ? (
              <label className="block">
                <span className="text-sm font-medium text-[#25135c]">
                  Адрес регистрации
                </span>
                <textarea
                  value={values.registration_address}
                  onChange={(event) =>
                    updateField("registration_address", event.target.value)
                  }
                  rows={3}
                  disabled={!editable || busy}
                  autoComplete="off"
                  data-mask="true"
                  className={inputClassName}
                />
                <FieldError message={fieldErrors.registration_address} />
              </label>
            ) : null}

            {recipientType === "individual" ? (
              <label className="block">
                <span className="text-sm font-medium text-[#25135c]">
                  Примечание о налоговом резидентстве{" "}
                  <span className="font-normal text-[#9485b4]">(необязательно)</span>
                </span>
                <textarea
                  value={values.tax_residency_note}
                  onChange={(event) =>
                    updateField("tax_residency_note", event.target.value)
                  }
                  rows={3}
                  disabled={!editable || busy}
                  autoComplete="off"
                  className={inputClassName}
                />
                <FieldError message={fieldErrors.tax_residency_note} />
              </label>
            ) : null}

            {recipientType === "self_employed" ? (
              <>
                <label className="flex items-start gap-3 rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#25135c]">
                  <input
                    type="checkbox"
                    checked={values.is_npd_declared}
                    disabled={!editable || busy}
                    onChange={(event) =>
                      updateField("is_npd_declared", event.target.checked)
                    }
                    className="mt-1 h-4 w-4 accent-[#7042c5]"
                  />
                  <span>
                    Подтверждаю, что применяю режим «Налог на профессиональный
                    доход» (самозанятость) и зарегистрирован в приложении «Мой
                    налог» или через банк-партнёр.
                  </span>
                </label>
                <FieldError message={fieldErrors.is_npd_declared} />
                <p className="text-sm leading-6 text-[#796ba0]">
                  Проверить статус самозанятого можно в приложении «Мой налог».
                  Команда платформы может запросить дополнительное подтверждение.
                </p>
              </>
            ) : null}

            {status === "needs_changes" ? (
              <label className="block">
                <span className="text-sm font-medium text-[#25135c]">
                  Комментарий для команды{" "}
                  <span className="font-normal text-[#9485b4]">(необязательно)</span>
                </span>
                <textarea
                  value={values.author_revision_comment}
                  onChange={(event) =>
                    updateField("author_revision_comment", event.target.value)
                  }
                  rows={3}
                  disabled={!editable || busy}
                  autoComplete="off"
                  className={inputClassName}
                />
                <FieldError message={fieldErrors.author_revision_comment} />
              </label>
            ) : null}

            {editable && canSubmit ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void saveDraft()}
                  disabled={busy}
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#bda6e1] px-5 text-sm font-medium text-[#7042c5] disabled:opacity-60"
                >
                  {savingDraft ? "Сохранение…" : "Сохранить черновик"}
                </button>
                <button
                  type="button"
                  onClick={() => void submitProfile()}
                  disabled={busy}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 text-sm font-medium text-white disabled:opacity-60"
                >
                  {submitting ? "Отправка…" : "Отправить на проверку"}
                </button>
              </div>
            ) : null}
          </form>
        ) : null}
      </section>

      <a
        href={backHref}
        className="inline-flex min-h-11 items-center text-sm font-medium text-[#7042c5]"
      >
        ← Вернуться в чеклист подключения
      </a>
    </div>
  );
}
