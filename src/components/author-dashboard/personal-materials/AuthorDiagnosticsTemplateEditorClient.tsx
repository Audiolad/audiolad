"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createAuthorPersonalMaterialTemplate,
  instantiateAuthorPersonalMaterialTemplate,
  updateAuthorPersonalMaterialTemplate,
  type AuthorPersonalMaterialTemplate,
} from "@/lib/personal-materials/client/api";
import { getPersonalMaterialErrorMessage } from "@/lib/personal-materials/client/errors";
import {
  validateReturnButtonLabel,
  validateReturnUrl,
} from "@/lib/personal-materials/return-url";
import { PERSONAL_MATERIAL_LIMITS } from "@/lib/personal-materials/types";

type Props = {
  authorId: string;
  authorSlug: string;
  initialTemplate?: AuthorPersonalMaterialTemplate | null;
};

type FormState = {
  internalName: string;
  title: string;
  description: string;
  personalRecommendation: string;
  returnUrl: string;
  returnButtonLabel: string;
};

const fieldClassName =
  "w-full min-w-0 rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 text-[15px] outline-none focus:border-[#9a74d8]";

function toForm(template?: AuthorPersonalMaterialTemplate | null): FormState {
  return {
    internalName: template?.internalName ?? "",
    title: template?.title ?? "",
    description: template?.description ?? "",
    personalRecommendation: template?.personalRecommendation ?? "",
    returnUrl: template?.returnUrl ?? "",
    returnButtonLabel: template?.returnButtonLabel ?? "",
  };
}

export default function AuthorDiagnosticsTemplateEditorClient({
  authorId,
  authorSlug,
  initialTemplate = null,
}: Props) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? null);
  const [values, setValues] = useState<FormState>(() => toForm(initialTemplate));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function updateField(field: keyof FormState, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function validate(): string | null {
    if (!values.internalName.trim()) {
      return "Укажите название шаблона.";
    }
    if (values.title.trim().length > PERSONAL_MATERIAL_LIMITS.titleMaxLength) {
      return "Название материала слишком длинное.";
    }
    if (!validateReturnUrl(values.returnUrl.trim() || null).valid) {
      return "Укажите корректную HTTPS-ссылку на чат.";
    }
    if (!validateReturnButtonLabel(values.returnButtonLabel.trim() || null).valid) {
      return "Текст кнопки слишком длинный.";
    }
    return null;
  }

  async function saveTemplate(): Promise<string> {
    const validationError = validate();
    if (validationError) {
      throw new Error(validationError);
    }

    const payload = {
      authorId,
      internalName: values.internalName.trim(),
      title: values.title.trim() || null,
      description: values.description.trim() || null,
      personalRecommendation: values.personalRecommendation.trim() || null,
      returnUrl: values.returnUrl.trim() || null,
      returnButtonLabel: values.returnButtonLabel.trim() || null,
    };

    if (templateId) {
      const updated = await updateAuthorPersonalMaterialTemplate(templateId, payload);
      return updated.id;
    }

    const created = await createAuthorPersonalMaterialTemplate(payload);
    setTemplateId(created.id);
    return created.id;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const id = await saveTemplate();
      router.replace(
        `/author-dashboard/diagnostics/templates/${id}?author=${encodeURIComponent(authorSlug)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : getPersonalMaterialErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateMaterial() {
    setSaving(true);
    setError(null);
    try {
      const id = await saveTemplate();
      const material = await instantiateAuthorPersonalMaterialTemplate(id);
      router.push(
        `/author-dashboard/diagnostics/${material.id}?author=${encodeURIComponent(authorSlug)}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : getPersonalMaterialErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5">
      <h2 className="text-[20px] font-semibold">
        {templateId ? "Редактирование шаблона" : "Новый шаблон"}
      </h2>
      <p className="mt-2 text-sm text-[#7d70a2]">
        Название шаблона видно только вам. Клиентские имя, фамилия и аудио сюда не входят.
      </p>

      <div className="mt-5 grid gap-4">
        <label className="block min-w-0">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">Название шаблона</span>
          <input
            className={fieldClassName}
            value={values.internalName}
            onChange={(event) => updateField("internalName", event.target.value)}
            placeholder="Например: Диагностика — MAX"
            disabled={saving}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">Название материала</span>
          <input
            className={fieldClassName}
            value={values.title}
            onChange={(event) => updateField("title", event.target.value)}
            disabled={saving}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">
            Описание для клиента
          </span>
          <textarea
            className={`${fieldClassName} resize-y`}
            rows={4}
            value={values.description}
            onChange={(event) => updateField("description", event.target.value)}
            disabled={saving}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">
            Персональная рекомендация
          </span>
          <textarea
            className={`${fieldClassName} resize-y`}
            rows={4}
            value={values.personalRecommendation}
            onChange={(event) => updateField("personalRecommendation", event.target.value)}
            disabled={saving}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">Ссылка на чат</span>
          <input
            className={fieldClassName}
            type="url"
            value={values.returnUrl}
            onChange={(event) => updateField("returnUrl", event.target.value)}
            disabled={saving}
          />
        </label>
        <label className="block min-w-0">
          <span className="mb-2 block text-sm font-medium text-[#5f5484]">Текст кнопки</span>
          <input
            className={fieldClassName}
            value={values.returnButtonLabel}
            onChange={(event) => updateField("returnButtonLabel", event.target.value)}
            disabled={saving}
          />
        </label>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-[#b42318]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="min-h-11 rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Сохранение…" : "Сохранить шаблон"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleCreateMaterial()}
          className="min-h-11 rounded-full border border-[#e4d7f4] px-5 py-3 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
        >
          Создать материал из шаблона
        </button>
      </div>
    </div>
  );
}

