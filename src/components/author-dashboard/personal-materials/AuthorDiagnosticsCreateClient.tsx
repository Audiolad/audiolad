"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import AuthorDiagnosticsFormFields from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsFormFields";
import {
  createAuthorPersonalMaterial,
  instantiateAuthorPersonalMaterialTemplate,
  listAuthorPersonalMaterialTemplates,
  type AuthorPersonalMaterialTemplate,
} from "@/lib/personal-materials/client/api";
import { getPersonalMaterialErrorMessage } from "@/lib/personal-materials/client/errors";
import type { PersonalMaterialFormValues } from "@/lib/personal-materials/client/validation";
import {
  getDefaultMaterialDate,
  validatePersonalMaterialForm,
} from "@/lib/personal-materials/client/validation";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import type { PersonalMaterialType } from "@/lib/personal-materials/types";

type AuthorDiagnosticsCreateClientProps = {
  authors: AuthorWorkspace[];
};

type CreateMode = "choose" | "blank" | "from-template";

export default function AuthorDiagnosticsCreateClient({
  authors,
}: AuthorDiagnosticsCreateClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const submittingRef = useRef(false);
  const [mode, setMode] = useState<CreateMode | "loading">("loading");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<AuthorPersonalMaterialTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [values, setValues] = useState<PersonalMaterialFormValues>({
    materialType: "diagnostic",
    clientFirstName: "",
    clientLastName: "",
    materialDate: getDefaultMaterialDate(),
    title: "",
    description: "",
    personalRecommendation: "",
    returnUrl: "",
    returnButtonLabel: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectedAuthor = useMemo(() => {
    const slug = searchParams.get("author");
    return authors.find((author) => author.slug === slug) ?? authors[0] ?? null;
  }, [authors, searchParams]);

  useEffect(() => {
    if (!selectedAuthor) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function loadTemplates() {
      try {
        const next = await listAuthorPersonalMaterialTemplates(
          selectedAuthor!.id,
          controller.signal,
        );
        if (!cancelled) {
          setTemplates(next);
          setSelectedTemplateId(next[0]?.id ?? "");
          setMode(next.length > 0 ? "choose" : "blank");
        }
      } catch {
        if (!cancelled) {
          setTemplates([]);
          setMode("blank");
        }
      }
    }

    void loadTemplates();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedAuthor]);

  function updateField(field: keyof PersonalMaterialFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submittingRef.current || !selectedAuthor) {
      return;
    }

    const nextErrors = validatePersonalMaterialForm(values);
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const material = await createAuthorPersonalMaterial({
        authorId: selectedAuthor.id,
        materialType: values.materialType as PersonalMaterialType,
        clientFirstName: values.clientFirstName.trim() || null,
        clientLastName: values.clientLastName.trim() || null,
        materialDate: values.materialDate,
        title: values.title.trim() || null,
        description: values.description.trim() || null,
        personalRecommendation: values.personalRecommendation.trim() || null,
        returnUrl: values.returnUrl.trim() || null,
        returnButtonLabel: values.returnButtonLabel.trim() || null,
      });

      router.replace(
        `/author-dashboard/diagnostics/${material.id}?author=${encodeURIComponent(selectedAuthor.slug)}#audio`,
      );
    } catch (error) {
      setSubmitError(getPersonalMaterialErrorMessage(error));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleCreateFromTemplate() {
    if (submittingRef.current || !selectedAuthor || !selectedTemplateId) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const material = await instantiateAuthorPersonalMaterialTemplate(selectedTemplateId);
      router.replace(
        `/author-dashboard/diagnostics/${material.id}?author=${encodeURIComponent(selectedAuthor.slug)}`,
      );
    } catch (error) {
      setSubmitError(getPersonalMaterialErrorMessage(error));
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (!selectedAuthor) {
    return (
      <div className="rounded-[24px] border border-[#eadff8] bg-white px-5 py-8 text-center">
        <p className="text-[18px] font-semibold">Авторское пространство недоступно</p>
      </div>
    );
  }

  const templatesHref = `/author-dashboard/diagnostics?author=${encodeURIComponent(selectedAuthor.slug)}&tab=templates`;

  if (mode === "loading") {
    return <p className="text-sm text-[#7d70a2]">Загрузка…</p>;
  }

  if (mode === "choose") {
    return (
      <div className="min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5">
        <h2 className="text-[20px] font-semibold">Как создать материал?</h2>
        <p className="mt-2 text-sm text-[#7d70a2]">
          Можно заполнить всё с нуля или взять общие тексты из шаблона.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setMode("blank")}
            className="min-h-11 rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white"
          >
            Создать с нуля
          </button>
          <button
            type="button"
            onClick={() => setMode("from-template")}
            className="min-h-11 rounded-full border border-[#e4d7f4] px-5 py-3 text-sm font-semibold text-[#7042c5]"
          >
            Создать из шаблона
          </button>
        </div>
      </div>
    );
  }

  if (mode === "from-template") {
    return (
      <div className="min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setMode("choose")}
          className="text-sm font-semibold text-[#7042c5]"
        >
          ← Назад
        </button>
        <h2 className="mt-4 text-[20px] font-semibold">Создать из шаблона</h2>
        <label className="mt-5 block min-w-0">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">Шаблон</span>
          <select
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            disabled={submitting || templates.length === 0}
            className="w-full min-w-0 rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#9a74d8]"
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.internalName}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-3 text-sm text-[#7d70a2]">
          Имя клиента и аудио нужно будет заполнить в редакторе перед активацией.
        </p>
        {submitError ? (
          <p className="mt-4 text-sm text-[#b42318]" role="alert">
            {submitError}
          </p>
        ) : null}
        <button
          type="button"
          disabled={submitting || !selectedTemplateId}
          onClick={() => void handleCreateFromTemplate()}
          className="mt-6 min-h-11 rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Создание…" : "Создать черновик"}
        </button>
      </div>
    );
  }

  return (
    <form className="min-w-0" onSubmit={(event) => void handleSubmit(event)} noValidate>
      {templates.length > 0 ? (
        <button
          type="button"
          onClick={() => setMode("choose")}
          className="mb-4 text-sm font-semibold text-[#7042c5]"
        >
          ← Назад
        </button>
      ) : (
        <p className="mb-4 text-sm text-[#7d70a2]">
          <Link href={templatesHref} className="font-semibold text-[#7042c5]">
            Создать первый шаблон
          </Link>
          , чтобы быстрее заполнять повторяющиеся тексты.
        </p>
      )}
      <AuthorDiagnosticsFormFields
        values={values}
        errors={errors}
        disabled={submitting}
        idPrefix="create-diagnostics"
        onChange={updateField}
      />

      <section
        className="mt-6 min-w-0 rounded-[24px] border border-dashed border-[#d8c7ef] bg-[#faf6ff] p-4 sm:p-5"
        aria-labelledby="create-audio-heading"
      >
        <h3 id="create-audio-heading" className="text-[18px] font-semibold">
          Аудиофайл
        </h3>
        <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
          Сначала сохраните основную информацию, после этого можно будет загрузить
          аудиофайл.
        </p>
        <p className="mt-3 text-sm text-[#5f5484]">
          Поддерживаемый формат: <span className="font-semibold">MP3</span>
        </p>
        <button
          type="button"
          disabled
          className="mt-4 min-h-11 w-full rounded-full border border-[#e4d7f4] bg-white px-5 py-3 text-sm font-semibold text-[#9a91b8] sm:w-auto"
        >
          Загрузить аудиофайл
        </button>
      </section>

      {submitError ? (
        <p className="mt-4 text-sm text-[#b42318]" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 w-full rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {submitting ? "Сохранение…" : "Сохранить и перейти к аудио"}
        </button>
      </div>
    </form>
  );
}
