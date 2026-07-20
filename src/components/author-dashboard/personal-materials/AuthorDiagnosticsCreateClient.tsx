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
      });

      router.replace(
        `/author-dashboard/diagnostics/${material.id}?author=${encodeURIComponent(selectedAuthor.slug)}`,
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

      {submitError ? (
        <p className="mt-4 text-sm text-[#b42318]" role="alert">
          {submitError}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Создание…" : "Создать черновик"}
        </button>
      </div>
    </form>
  );
}
