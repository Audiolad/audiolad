"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import AuthorDiagnosticsAudioUpload from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsAudioUpload";
import AuthorDiagnosticsPdfUpload from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsPdfUpload";
import PersonalMaterialPdfDocument from "@/components/personal-materials/PersonalMaterialPdfDocument";
import AuthorDiagnosticsConfirmModal from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsConfirmModal";
import AuthorDiagnosticsFormFields from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsFormFields";
import AuthorDiagnosticsOneTimeLinkPanel from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsOneTimeLinkPanel";
import AuthorDiagnosticsStatusBadge from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsStatusBadge";
import {
  activateAuthorPersonalMaterial,
  deleteAuthorPersonalMaterial,
  deleteAuthorPersonalMaterialAudio,
  deleteAuthorPersonalMaterialPdf,
  getAuthorPersonalMaterial,
  isPersonalMaterialClientError,
  revokeAuthorPersonalMaterial,
  rotateAuthorPersonalMaterial,
  updateAuthorPersonalMaterial,
  uploadAuthorPersonalMaterialAudio,
  uploadAuthorPersonalMaterialPdf,
} from "@/lib/personal-materials/client/api";
import {
  getPersonalMaterialActivationErrorMessage,
  getPersonalMaterialErrorMessage,
  getPersonalMaterialPdfUploadErrorMessage,
  getPersonalMaterialUploadErrorMessage,
} from "@/lib/personal-materials/client/errors";
import {
  formatMaterialDateLabel,
  validatePersonalMaterialForm,
  type PersonalMaterialFormErrors,
  type PersonalMaterialFormValues,
} from "@/lib/personal-materials/client/validation";
import {
  getPersonalMaterialDisplayTitle,
  getPersonalMaterialTypeLabel,
  resolvePersonalMaterialUiStatus,
} from "@/lib/personal-materials/client/status-labels";
import type { AuthorPersonalMaterial } from "@/lib/personal-materials/client/types";
import type { AuthorWorkspace } from "@/lib/author-products/types";

type AuthorDiagnosticsEditorClientProps = {
  materialId: string;
  authors: AuthorWorkspace[];
};

type ConfirmAction = "activate" | "rotate" | "revoke" | "delete" | null;

const EDIT_FORM_ID_PREFIX = "edit-diagnostics";

const FORM_FIELD_FOCUS_ORDER: (keyof PersonalMaterialFormValues)[] = [
  "materialType",
  "clientFirstName",
  "clientLastName",
  "materialDate",
  "title",
  "description",
  "personalRecommendation",
  "returnUrl",
  "returnButtonLabel",
];

const FORM_FIELD_ID_SUFFIX: Record<keyof PersonalMaterialFormValues, string> = {
  materialType: "material-type",
  clientFirstName: "client-first-name",
  clientLastName: "client-last-name",
  materialDate: "material-date",
  title: "title",
  description: "description",
  personalRecommendation: "recommendation",
  returnUrl: "return-url",
  returnButtonLabel: "return-button-label",
};

function materialToFormValues(material: AuthorPersonalMaterial): PersonalMaterialFormValues {
  return {
    materialType: material.materialType,
    clientFirstName: material.clientFirstName,
    clientLastName: material.clientLastName,
    materialDate: material.materialDate,
    title: material.title ?? "",
    description: material.description ?? "",
    personalRecommendation: material.personalRecommendation ?? "",
    returnUrl: material.returnUrl ?? "",
    returnButtonLabel: material.returnButtonLabel ?? "",
  };
}

function buildPersonalMaterialUpdatePayload(values: PersonalMaterialFormValues) {
  return {
    materialType: values.materialType as AuthorPersonalMaterial["materialType"],
    clientFirstName: values.clientFirstName.trim(),
    clientLastName: values.clientLastName.trim(),
    materialDate: values.materialDate,
    title: values.title.trim() || null,
    description: values.description.trim() || null,
    personalRecommendation: values.personalRecommendation.trim() || null,
    returnUrl: values.returnUrl.trim() || null,
    returnButtonLabel: values.returnButtonLabel.trim() || null,
  };
}

function focusFirstFormError(errors: PersonalMaterialFormErrors) {
  if (typeof document === "undefined") {
    return;
  }

  for (const field of FORM_FIELD_FOCUS_ORDER) {
    if (!errors[field]) {
      continue;
    }

    const element = document.getElementById(
      `${EDIT_FORM_ID_PREFIX}-${FORM_FIELD_ID_SUFFIX[field]}`,
    );

    if (!(element instanceof HTMLElement)) {
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.focus({ preventScroll: true });
    return;
  }
}

export default function AuthorDiagnosticsEditorClient({
  materialId,
  authors,
}: AuthorDiagnosticsEditorClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [material, setMaterial] = useState<AuthorPersonalMaterial | null>(null);
  const [formValues, setFormValues] = useState<PersonalMaterialFormValues | null>(null);
  const [initialValues, setInitialValues] = useState<PersonalMaterialFormValues | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pdfUploadError, setPdfUploadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [oneTimeAccessUrl, setOneTimeAccessUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const saveSubmitRef = useRef(false);
  const actionSubmitRef = useRef(false);

  const selectedAuthor = useMemo(() => {
    const slug = searchParams.get("author");
    return authors.find((author) => author.slug === slug) ?? authors[0] ?? null;
  }, [authors, searchParams]);

  const isDirty = useMemo(() => {
    if (!formValues || !initialValues) {
      return false;
    }

    return JSON.stringify(formValues) !== JSON.stringify(initialValues);
  }, [formValues, initialValues]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadMaterialEffect() {
      setLoading(true);
      setLoadError(null);

      try {
        const nextMaterial = await getAuthorPersonalMaterial(materialId, controller.signal);
        const nextValues = materialToFormValues(nextMaterial);

        if (!cancelled) {
          setMaterial(nextMaterial);
          setFormValues(nextValues);
          setInitialValues(nextValues);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (isPersonalMaterialClientError(error) && error.status === 403) {
          setLoadError("У вас нет доступа к этому материалу.");
        } else if (isPersonalMaterialClientError(error) && error.status === 404) {
          setLoadError("Материал не найден.");
        } else {
          setLoadError("Не удалось загрузить материал. Попробуйте ещё раз.");
        }

        setMaterial(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMaterialEffect();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [materialId, reloadKey]);

  useEffect(() => {
    if (loading || !material) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    if (window.location.hash !== "#audio") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document.getElementById("personal-material-audio")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [loading, material]);

  useEffect(() => {
    if (!material || !selectedAuthor) {
      return;
    }

    if (material.authorId !== selectedAuthor.id) {
      router.replace(
        `/author-dashboard/diagnostics?author=${encodeURIComponent(selectedAuthor.slug)}`,
      );
    }
  }, [material, selectedAuthor, router]);

  function updateField(field: keyof PersonalMaterialFormValues, value: string) {
    setFormValues((current) => (current ? { ...current, [field]: value } : current));
  }

  function showFormValidationErrors(errors: PersonalMaterialFormErrors) {
    setFormErrors(errors);
    focusFirstFormError(errors);
  }

  function syncSavedMaterial(updated: AuthorPersonalMaterial) {
    const nextValues = materialToFormValues(updated);
    setMaterial(updated);
    setFormValues(nextValues);
    setInitialValues(nextValues);
    return nextValues;
  }

  async function persistDraft(values: PersonalMaterialFormValues) {
    if (!material) {
      throw new Error("material_missing");
    }

    const updated = await updateAuthorPersonalMaterial(
      material.id,
      buildPersonalMaterialUpdatePayload(values),
    );
    return syncSavedMaterial(updated);
  }

  function handleActivateClick() {
    if (!formValues || actionLoading || actionSubmitRef.current || saving || saveSubmitRef.current) {
      return;
    }

    const nextErrors = validatePersonalMaterialForm(formValues);

    if (Object.keys(nextErrors).length > 0) {
      showFormValidationErrors(nextErrors);
      return;
    }

    setFormErrors({});
    setActionError(null);
    setSaveError(null);
    setConfirmAction("activate");
  }

  async function handleSave() {
    if (
      !material ||
      !formValues ||
      material.status !== "draft" ||
      saveSubmitRef.current ||
      actionSubmitRef.current
    ) {
      return;
    }

    const nextErrors = validatePersonalMaterialForm(formValues);

    if (Object.keys(nextErrors).length > 0) {
      showFormValidationErrors(nextErrors);
      return;
    }

    saveSubmitRef.current = true;
    setSaving(true);
    setSaveError(null);

    try {
      await persistDraft(formValues);
      setToast("Изменения сохранены");
    } catch (error) {
      setSaveError(getPersonalMaterialErrorMessage(error));
    } finally {
      saveSubmitRef.current = false;
      setSaving(false);
    }
  }

  async function handleUpload(file: File) {
    if (!material) {
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const updated = await uploadAuthorPersonalMaterialAudio(material.id, file);
      setMaterial(updated);
    } catch (error) {
      const code = isPersonalMaterialClientError(error) ? error.code : undefined;
      setUploadError(getPersonalMaterialUploadErrorMessage(code));
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteAudio() {
    if (!material) {
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const updated = await deleteAuthorPersonalMaterialAudio(material.id);
      setMaterial(updated);
    } catch (error) {
      setUploadError(getPersonalMaterialErrorMessage(error));
    } finally {
      setUploading(false);
    }
  }

  async function handleUploadPdf(file: File) {
    if (!material) {
      return;
    }

    setUploadingPdf(true);
    setPdfUploadError(null);

    try {
      const updated = await uploadAuthorPersonalMaterialPdf(material.id, file);
      setMaterial(updated);
    } catch (error) {
      const code = isPersonalMaterialClientError(error) ? error.code : undefined;
      setPdfUploadError(getPersonalMaterialPdfUploadErrorMessage(code));
    } finally {
      setUploadingPdf(false);
    }
  }

  async function handleDeletePdf() {
    if (!material) {
      return;
    }

    setUploadingPdf(true);
    setPdfUploadError(null);

    try {
      const updated = await deleteAuthorPersonalMaterialPdf(material.id);
      setMaterial(updated);
    } catch (error) {
      setPdfUploadError(getPersonalMaterialErrorMessage(error));
    } finally {
      setUploadingPdf(false);
    }
  }

  const hasAttachment = Boolean(material?.hasAudio || material?.hasPdf);

  async function handleConfirmAction() {
    if (!material || !confirmAction || actionSubmitRef.current || saveSubmitRef.current) {
      return;
    }

    if (confirmAction === "activate") {
      if (!formValues) {
        return;
      }

      const nextErrors = validatePersonalMaterialForm(formValues);

      if (Object.keys(nextErrors).length > 0) {
        setConfirmAction(null);
        showFormValidationErrors(nextErrors);
        return;
      }

      actionSubmitRef.current = true;
      setActionLoading(true);
      setActionError(null);
      setSaveError(null);

      let activatePhase: "save" | "activate" = "activate";

      try {
        const needsSave =
          !initialValues || JSON.stringify(formValues) !== JSON.stringify(initialValues);

        if (needsSave) {
          activatePhase = "save";
          await persistDraft(formValues);
          activatePhase = "activate";
        }

        const result = await activateAuthorPersonalMaterial(material.id);
        setOneTimeAccessUrl(result.accessUrl);
        syncSavedMaterial(result.material);
        setFormErrors({});
        setConfirmAction(null);
      } catch (error) {
        setConfirmAction(null);

        if (activatePhase === "save") {
          setSaveError(getPersonalMaterialErrorMessage(error));
          setActionError("Не удалось сохранить изменения перед активацией. Попробуйте ещё раз.");
        } else {
          setActionError(
            "Не удалось активировать материал. Изменения формы сохранены — попробуйте активировать ещё раз.",
          );
        }
      } finally {
        actionSubmitRef.current = false;
        setActionLoading(false);
      }

      return;
    }

    actionSubmitRef.current = true;
    setActionLoading(true);
    setActionError(null);

    try {
      if (confirmAction === "rotate") {
        const result = await rotateAuthorPersonalMaterial(material.id);
        setMaterial(result.material);
        setOneTimeAccessUrl(result.accessUrl);
      }

      if (confirmAction === "revoke") {
        const updated = await revokeAuthorPersonalMaterial(material.id);
        setMaterial(updated);
        setOneTimeAccessUrl(null);
        setToast("Доступ по ссылке отозван");
      }

      if (confirmAction === "delete") {
        await deleteAuthorPersonalMaterial(material.id);
        router.replace(
          `/author-dashboard/diagnostics?author=${encodeURIComponent(selectedAuthor?.slug ?? "")}&deleted=1`,
        );
        return;
      }

      setConfirmAction(null);
    } catch (error) {
      setActionError(getPersonalMaterialErrorMessage(error));
    } finally {
      actionSubmitRef.current = false;
      setActionLoading(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[#7d70a2]">Загрузка материала…</p>;
  }

  if (loadError || !material || !formValues) {
    return (
      <div className="rounded-[24px] border border-[#f3d9d9] bg-[#fff7f7] px-5 py-6">
        <p className="text-sm text-[#8b2f2f]">{loadError ?? "Материал недоступен."}</p>
        <button
          type="button"
          onClick={() => setReloadKey((value) => value + 1)}
          className="mt-4 min-h-11 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
        >
          Повторить
        </button>
      </div>
    );
  }

  const uiStatus = resolvePersonalMaterialUiStatus(material);
  const isDraft = uiStatus === "draft";
  const isReadOnly = !isDraft;
  const listHref = `/author-dashboard/diagnostics?author=${encodeURIComponent(selectedAuthor?.slug ?? "")}`;
  const clientName = `${material.clientFirstName} ${material.clientLastName}`.trim();

  return (
    <div className="min-w-0">
      <AuthorDashboardNav authorSlug={selectedAuthor?.slug} />

      <div className="mt-6 min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="min-w-0 break-words text-[20px] font-semibold leading-6">
                {getPersonalMaterialDisplayTitle(material)}
              </h2>
              <AuthorDiagnosticsStatusBadge material={material} />
            </div>
            <p className="mt-2 break-words text-sm text-[#7d70a2]">
              {clientName} · {getPersonalMaterialTypeLabel(material.materialType)} ·{" "}
              {formatMaterialDateLabel(material.materialDate)}
            </p>
          </div>
        </div>

        {toast ? (
          <p className="mt-4 text-sm font-medium text-[#3d8d65]" role="status">
            {toast}
          </p>
        ) : null}

        {oneTimeAccessUrl ? (
          <div className="mt-5">
            <AuthorDiagnosticsOneTimeLinkPanel
              accessUrl={oneTimeAccessUrl}
              onDismiss={() => setOneTimeAccessUrl(null)}
            />
          </div>
        ) : null}

        {actionError ? (
          <p className="mt-4 text-sm text-[#b42318]" role="alert">
            {actionError}
          </p>
        ) : null}
      </div>

      <section className="mt-6 min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <h3 className="text-[18px] font-semibold">Данные материала</h3>
          {isDirty ? <span className="text-xs text-[#b67a1d]">Есть несохранённые изменения</span> : null}
        </div>

        <div className="mt-4">
          <AuthorDiagnosticsFormFields
            values={formValues}
            errors={formErrors}
            disabled={saving || uploading || actionLoading}
            readOnly={isReadOnly}
            idPrefix={EDIT_FORM_ID_PREFIX}
            onChange={updateField}
          />
        </div>

        {saveError ? (
          <p className="mt-3 text-sm text-[#b42318]" role="alert">
            {saveError}
          </p>
        ) : null}

        {isDraft ? (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || uploading || actionLoading}
            className="mt-4 min-h-11 rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Сохранение…" : "Сохранить изменения"}
          </button>
        ) : null}
      </section>

      {isDraft ? (
        <>
          <div className="mt-6">
            <AuthorDiagnosticsAudioUpload
              hasAudio={material.hasAudio}
              audioOriginalFilename={material.audioOriginalFilename}
              audioSizeBytes={material.audioSizeBytes}
              disabled={actionLoading || uploadingPdf}
              uploading={uploading}
              error={uploadError}
              onUpload={handleUpload}
              onDelete={handleDeleteAudio}
            />
          </div>

          <div className="mt-6">
            <AuthorDiagnosticsPdfUpload
              hasPdf={material.hasPdf}
              pdfOriginalFilename={material.pdfOriginalFilename}
              pdfSizeBytes={material.pdfSizeBytes}
              disabled={actionLoading || uploading}
              uploading={uploadingPdf}
              error={pdfUploadError}
              onUpload={handleUploadPdf}
              onDelete={handleDeletePdf}
            />
          </div>

          <section className="mt-6 min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5">
            <h3 className="text-[18px] font-semibold">Активация</h3>
            <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
              После активации вы получите персональную ссылку для клиента. Содержимое черновика
              больше нельзя будет редактировать.
            </p>
            <button
              type="button"
              disabled={!hasAttachment || actionLoading || uploading || uploadingPdf || saving}
              onClick={handleActivateClick}
              className="mt-4 min-h-11 w-full rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
            >
              Активировать и получить ссылку
            </button>
            {!hasAttachment ? (
              <p className="mt-3 text-sm text-[#b67a1d]" role="status">
                {getPersonalMaterialActivationErrorMessage()}
              </p>
            ) : null}
          </section>
        </>
      ) : (
        <section className="mt-6 min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5">
          <h3 className="text-[18px] font-semibold">Управление доступом</h3>
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            {material.hasAudio ? "Аудиофайл загружен." : "Аудиофайл отсутствует."}{" "}
            {material.hasPdf ? "PDF-документ загружен." : "PDF-документ отсутствует."}
            {material.claimed
              ? " Клиент уже сохранил материал в личном кабинете."
              : null}
          </p>

          {material.hasPdf ? (
            <div className="mt-4">
              <PersonalMaterialPdfDocument
                pdfApiPath={`/api/author/personal-materials/${encodeURIComponent(material.id)}/pdf`}
                filename={material.pdfOriginalFilename}
              />
            </div>
          ) : null}

          {!oneTimeAccessUrl ? (
            <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
              Персональная ссылка показывается только один раз сразу после активации или создания
              новой ссылки.
            </p>
          ) : null}

          <div className="mt-4 flex flex-col gap-3">
            {uiStatus === "active" || uiStatus === "claimed" || uiStatus === "revoked" ? (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setConfirmAction("rotate")}
                className="min-h-11 rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                Создать новую ссылку
              </button>
            ) : null}

            {uiStatus === "active" || uiStatus === "claimed" ? (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setConfirmAction("revoke")}
                className="min-h-11 rounded-full border border-[#e4d7f4] px-5 py-3 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
              >
                Отозвать доступ
              </button>
            ) : null}

            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setConfirmAction("delete")}
              className="min-h-11 rounded-full border border-[#f0c7c7] px-5 py-3 text-sm font-semibold text-[#b42318] disabled:opacity-60"
            >
              Удалить
            </button>
          </div>
        </section>
      )}

      <AuthorDiagnosticsConfirmModal
        open={confirmAction === "activate"}
        title="Активировать материал?"
        description="После активации черновик нельзя будет редактировать. Вы получите персональную ссылку для клиента."
        confirmLabel="Активировать"
        loading={actionLoading}
        loadingLabel="Сохраняем и активируем…"
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => {
          if (!actionLoading) {
            setConfirmAction(null);
          }
        }}
      />

      <AuthorDiagnosticsConfirmModal
        open={confirmAction === "rotate"}
        title="Создать новую ссылку?"
        description="Старая ссылка сразу перестанет работать. Создать новую?"
        confirmLabel="Создать новую ссылку"
        loading={actionLoading}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmAction(null)}
      />

      <AuthorDiagnosticsConfirmModal
        open={confirmAction === "revoke"}
        title="Отозвать доступ?"
        description={
          material.claimed
            ? "Клиент больше не сможет открыть материал по персональной ссылке. Ссылка будет отключена, но сохранённый доступ клиента останется."
            : "Клиент больше не сможет открыть материал по персональной ссылке."
        }
        confirmLabel="Отозвать доступ"
        confirmTone="danger"
        loading={actionLoading}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmAction(null)}
      />

      <AuthorDiagnosticsConfirmModal
        open={confirmAction === "delete"}
        title="Удалить материал?"
        description={`Материал для ${clientName} будет удалён. Доступ по ссылке будет отключён.`}
        confirmLabel="Удалить"
        confirmTone="danger"
        loading={actionLoading}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmAction(null)}
      />

      <div className="mt-6">
        <button
          type="button"
          onClick={() => router.push(listHref)}
          className="min-h-11 text-sm font-medium text-[#7042c5]"
        >
          ← К списку
        </button>
      </div>
    </div>
  );
}
