"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import AuthorDiagnosticsFormFields from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsFormFields";
import { createAuthorPersonalMaterial } from "@/lib/personal-materials/client/api";
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

export default function AuthorDiagnosticsCreateClient({
  authors,
}: AuthorDiagnosticsCreateClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
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
        clientFirstName: values.clientFirstName.trim(),
        clientLastName: values.clientLastName.trim(),
        materialDate: values.materialDate,
        title: values.title.trim() || null,
        description: values.description.trim() || null,
        personalRecommendation: values.personalRecommendation.trim() || null,
        returnUrl: values.returnUrl.trim() || null,
        returnButtonLabel: values.returnButtonLabel.trim() || null,
      });

      // Upload requires a material id — open editor and scroll to audio block.
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

  if (!selectedAuthor) {
    return (
      <div className="rounded-[24px] border border-[#eadff8] bg-white px-5 py-8 text-center">
        <p className="text-[18px] font-semibold">Авторское пространство недоступно</p>
      </div>
    );
  }

  return (
    <form className="min-w-0" onSubmit={(event) => void handleSubmit(event)} noValidate>
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
