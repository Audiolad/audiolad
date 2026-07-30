"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import {
  FORMAT_PLAN_OPTIONS,
  type AuthorCommercialApplicationFieldErrors,
  type AuthorCommercialApplicationFormValues,
  type AuthorCommercialApplicationRow,
} from "@/lib/author-commercial-applications/types";
import {
  getCommercialApplicationStatusLabel,
} from "@/lib/author-dashboard/commercial-onboarding";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import { rowToCommercialApplicationFormValues } from "@/lib/author-commercial-applications/validation";

type AuthorCommercialApplicationFormProps = {
  authors: AuthorWorkspace[];
};

const EMPTY_VALUES: AuthorCommercialApplicationFormValues = {
  plannedProducts: "",
  topics: "",
  formatPlan: "",
  rightsConfirmation: false,
  teamComment: "",
};

function isEditableStatus(status: string | null | undefined): boolean {
  return !status || status === "draft" || status === "needs_changes";
}

export default function AuthorCommercialApplicationForm({
  authors,
}: AuthorCommercialApplicationFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedAuthor = useMemo(() => {
    const slug = searchParams.get("author");
    return authors.find((author) => author.slug === slug) ?? authors[0] ?? null;
  }, [authors, searchParams]);

  const [loading, setLoading] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] =
    useState<AuthorCommercialApplicationFieldErrors>({});
  const [application, setApplication] =
    useState<AuthorCommercialApplicationRow | null>(null);
  const [values, setValues] =
    useState<AuthorCommercialApplicationFormValues>(EMPTY_VALUES);

  useEffect(() => {
    if (!selectedAuthor) {
      return;
    }

    let cancelled = false;

    async function loadApplication() {
      setLoading(true);
      setError(null);
      setSuccess(null);
      setFieldErrors({});

      try {
        const response = await fetch(
          `/api/author/commercial-application?author_id=${encodeURIComponent(selectedAuthor.id)}`,
        );

        if (!response.ok) {
          throw new Error("load_failed");
        }

        const payload = (await response.json()) as {
          application: AuthorCommercialApplicationRow | null;
        };

        if (cancelled) {
          return;
        }

        const row = payload.application ?? null;
        setApplication(row);
        setValues(row ? rowToCommercialApplicationFormValues(row) : EMPTY_VALUES);
      } catch {
        if (!cancelled) {
          setError("Не удалось загрузить заявку.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadApplication();

    return () => {
      cancelled = true;
    };
  }, [selectedAuthor]);

  function updateField<K extends keyof AuthorCommercialApplicationFormValues>(
    key: K,
    value: AuthorCommercialApplicationFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function saveDraft() {
    if (!selectedAuthor) {
      return;
    }

    setSavingDraft(true);
    setError(null);
    setSuccess(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/author/commercial-application", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_id: selectedAuthor.id,
          plannedProducts: values.plannedProducts,
          topics: values.topics,
          formatPlan: values.formatPlan,
          rightsConfirmation: values.rightsConfirmation,
          teamComment: values.teamComment,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        errors?: AuthorCommercialApplicationFieldErrors;
        application?: AuthorCommercialApplicationRow | null;
      };

      if (!response.ok) {
        if (payload.errors) {
          setFieldErrors(payload.errors);
        }
        setError(payload.error ?? "Не удалось сохранить черновик.");
        return;
      }

      if (payload.application) {
        setApplication(payload.application);
        setValues(rowToCommercialApplicationFormValues(payload.application));
      }

      setSuccess("Черновик сохранён.");
    } catch {
      setError("Не удалось сохранить черновик.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function submitApplication() {
    if (!selectedAuthor) {
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);
    setFieldErrors({});

    try {
      const response = await fetch("/api/author/commercial-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_id: selectedAuthor.id,
          plannedProducts: values.plannedProducts,
          topics: values.topics,
          formatPlan: values.formatPlan,
          rightsConfirmation: values.rightsConfirmation,
          teamComment: values.teamComment,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        errors?: AuthorCommercialApplicationFieldErrors;
        application?: AuthorCommercialApplicationRow | null;
      };

      if (!response.ok) {
        if (payload.errors) {
          setFieldErrors(payload.errors);
        }
        setError(payload.error ?? "Не удалось отправить заявку.");
        return;
      }

      if (payload.application) {
        setApplication(payload.application);
        setValues(rowToCommercialApplicationFormValues(payload.application));
      }

      setSuccess("Заявка отправлена.");
      router.refresh();
    } catch {
      setError("Не удалось отправить заявку.");
    } finally {
      setSubmitting(false);
    }
  }

  const status = application?.status ?? null;
  const statusLabel = status
    ? getCommercialApplicationStatusLabel(status)
    : null;
  const editable = isEditableStatus(status);
  const showReviewComment =
    (status === "needs_changes" || status === "rejected") &&
    Boolean(application?.review_comment?.trim());
  const busy = savingDraft || submitting;

  if (!selectedAuthor) {
    return (
      <div className="rounded-[22px] border border-[#eadff8] bg-white p-5 text-sm text-[#796ba0]">
        Нет доступных авторских пространств.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <AuthorDashboardNav authorSlug={selectedAuthor.slug} />

      <section className="rounded-[22px] border border-[#eadff8] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">
          Заявка на коммерческий статус
        </h2>
        <p className="mt-2 text-sm leading-6 text-[#796ba0]">
          После одобрения заявки мы откроем следующие шаги подготовки
          коммерческого кабинета.
        </p>

        {statusLabel ? (
          <p className="mt-4 inline-flex rounded-full bg-[#f3edfb] px-3 py-1 text-sm font-medium text-[#7042c5]">
            Статус: {statusLabel}
          </p>
        ) : null}

        {showReviewComment ? (
          <div className="mt-4 rounded-[18px] border border-[#f0dfab] bg-[#fffaf0] px-4 py-3 text-sm leading-6 text-[#8a6a1f]">
            <p className="font-medium">Комментарий команды</p>
            <p className="mt-1 whitespace-pre-wrap">
              {application?.review_comment}
            </p>
          </div>
        ) : null}

        {status === "submitted" || status === "in_review" ? (
          <p className="mt-4 max-w-full text-sm leading-6 break-words text-[#796ba0]">
            Мы рассмотрим заявку и сообщим о решении. Пока заявка на рассмотрении,
            редактирование недоступно.
          </p>
        ) : null}

        {status === "approved" ? (
          <p className="mt-4 text-sm leading-6 text-[#3d8d65]">
            Заявка одобрена. Коммерческие шаги подготовки кабинета доступны в
            онбординге.
          </p>
        ) : null}

        {status === "rejected" && !showReviewComment ? (
          <p className="mt-4 text-sm leading-6 text-[#b34f63]">
            Заявка не одобрена.
          </p>
        ) : null}

        {loading ? (
          <p className="mt-5 text-sm text-[#7d70a2]">Загрузка…</p>
        ) : (
          <div className="mt-5 space-y-4">
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

            <label className="block">
              <span className="text-sm font-medium text-[#25135c]">
                Какие платные продукты вы планируете размещать?
              </span>
              <textarea
                value={values.plannedProducts}
                onChange={(event) =>
                  updateField("plannedProducts", event.target.value)
                }
                rows={5}
                disabled={!editable || busy}
                placeholder="Опишите идеи платных практик, программ или курсов"
                className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#25135c] disabled:opacity-70"
              />
              {fieldErrors.plannedProducts ? (
                <p className="mt-1 text-sm text-[#b34f63]">
                  {fieldErrors.plannedProducts}
                </p>
              ) : null}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-[#25135c]">Темы</span>
              <textarea
                value={values.topics}
                onChange={(event) => updateField("topics", event.target.value)}
                rows={3}
                disabled={!editable || busy}
                placeholder="Например: медитации, женские практики, работа с тревогой"
                className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#25135c] disabled:opacity-70"
              />
              {fieldErrors.topics ? (
                <p className="mt-1 text-sm text-[#b34f63]">{fieldErrors.topics}</p>
              ) : null}
            </label>

            <fieldset className="block">
              <legend className="text-sm font-medium text-[#25135c]">
                Формат материалов
              </legend>
              <div className="mt-2 space-y-2">
                {FORMAT_PLAN_OPTIONS.map((option) => (
                  <label
                    key={option}
                    className="flex min-h-11 items-center gap-3 rounded-[16px] border border-[#eadff8] bg-[#faf6ff] px-4 py-2 text-sm text-[#25135c]"
                  >
                    <input
                      type="radio"
                      name="formatPlan"
                      value={option}
                      checked={values.formatPlan === option}
                      disabled={!editable || busy}
                      onChange={() => updateField("formatPlan", option)}
                      className="h-4 w-4 accent-[#7042c5]"
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
              {fieldErrors.formatPlan ? (
                <p className="mt-1 text-sm text-[#b34f63]">
                  {fieldErrors.formatPlan}
                </p>
              ) : null}
            </fieldset>

            <label className="flex items-start gap-3 rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#25135c]">
              <input
                type="checkbox"
                checked={values.rightsConfirmation}
                disabled={!editable || busy}
                onChange={(event) =>
                  updateField("rightsConfirmation", event.target.checked)
                }
                className="mt-1 h-4 w-4 accent-[#7042c5]"
              />
              <span>
                Подтверждаю, что у меня есть права на размещение этих
                аудиоматериалов на платформе АудиоЛад.
              </span>
            </label>
            {fieldErrors.rightsConfirmation ? (
              <p className="text-sm text-[#b34f63]">
                {fieldErrors.rightsConfirmation}
              </p>
            ) : null}

            <label className="block">
              <span className="text-sm font-medium text-[#25135c]">
                Комментарий команде{" "}
                <span className="font-normal text-[#9485b4]">(необязательно)</span>
              </span>
              <textarea
                value={values.teamComment}
                onChange={(event) =>
                  updateField("teamComment", event.target.value)
                }
                rows={3}
                disabled={!editable || busy}
                placeholder="Если хотите что-то уточнить для команды платформы"
                className="mt-2 w-full rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3 text-sm leading-6 text-[#25135c] disabled:opacity-70"
              />
              {fieldErrors.teamComment ? (
                <p className="mt-1 text-sm text-[#b34f63]">
                  {fieldErrors.teamComment}
                </p>
              ) : null}
            </label>

            {editable ? (
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
                  onClick={() => void submitApplication()}
                  disabled={busy}
                  className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#7042c5] px-5 text-sm font-medium text-white disabled:opacity-60"
                >
                  {submitting ? "Отправка…" : "Отправить заявку"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
