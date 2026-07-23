"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatClientDisplayName } from "@/lib/personal-materials/display-name";
import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import AuthorDiagnosticsAudioUpload from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsAudioUpload";
import AuthorDiagnosticsPdfUpload from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsPdfUpload";
import PersonalMaterialPdfDocument from "@/components/personal-materials/PersonalMaterialPdfDocument";
import AuthorDiagnosticsClientMessagePanel from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsClientMessagePanel";
import AuthorDiagnosticsConfirmModal from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsConfirmModal";
import AuthorDiagnosticsFormFields from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsFormFields";
import AuthorDiagnosticsMessageTemplateEditor from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsMessageTemplateEditor";
import AuthorDiagnosticsOneTimeLinkPanel from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsOneTimeLinkPanel";
import AuthorDiagnosticsStatusBadge from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsStatusBadge";
import PersonalMaterialAudioPlayer from "@/components/personal-materials/guest/PersonalMaterialAudioPlayer";
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
  requireClientFirstName,
  type PersonalMaterialFormValues,
} from "@/lib/personal-materials/client/validation";
import {
  getPersonalMaterialDeleteButtonLabel,
  getPersonalMaterialDeleteConfirmDescription,
  getPersonalMaterialDeleteConfirmTitle,
  getPersonalMaterialDisplayTitle,
  getPersonalMaterialTypeLabel,
  isPersonalMaterialDiagnostic,
  resolvePersonalMaterialUiStatus,
} from "@/lib/personal-materials/client/status-labels";
import { scrollElementIntoView } from "@/lib/personal-materials/client-message-template";
import type { AuthorPersonalMaterial } from "@/lib/personal-materials/client/types";
import type { AuthorWorkspace } from "@/lib/author-products/types";

type AuthorDiagnosticsEditorClientProps = {
  materialId: string;
  authors: AuthorWorkspace[];
};

type ConfirmAction = "activate" | "rotate" | "revoke" | "delete" | null;

function materialToFormValues(material: AuthorPersonalMaterial): PersonalMaterialFormValues {
  return {
    materialType: material.materialType,
    clientFirstName: material.clientFirstName,
    clientLastName: material.clientLastName ?? "",
    materialDate: material.materialDate,
    title: material.title ?? "",
    description: material.description ?? "",
    personalRecommendation: material.personalRecommendation ?? "",
    returnUrl: material.returnUrl ?? "",
    returnButtonLabel: material.returnButtonLabel ?? "",
  };
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
  const [clientMessageTemplate, setClientMessageTemplate] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<"success" | "error">("success");
  const [reloadKey, setReloadKey] = useState(0);
  const saveSubmitRef = useRef(false);
  const linkResultRef = useRef<HTMLDivElement | null>(null);

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
    if (!oneTimeAccessUrl) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollElementIntoView(linkResultRef.current);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [oneTimeAccessUrl]);

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

  async function handleSave() {
    if (
      !material ||
      !formValues ||
      (material.status !== "draft" &&
        material.status !== "active" &&
        material.status !== "revoked") ||
      saveSubmitRef.current
    ) {
      return;
    }

    const nextErrors = validatePersonalMaterialForm(formValues);

    if (material.status !== "draft") {
      const nameError = requireClientFirstName(formValues);
      if (nameError) {
        nextErrors.clientFirstName = nameError;
      }
    }

    setFormErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    saveSubmitRef.current = true;
    setSaving(true);
    setSaveError(null);

    try {
      const updated = await updateAuthorPersonalMaterial(material.id, {
        materialType: formValues.materialType as AuthorPersonalMaterial["materialType"],
        clientFirstName: formValues.clientFirstName.trim() || null,
        clientLastName: formValues.clientLastName.trim() || null,
        materialDate: formValues.materialDate,
        title: formValues.title.trim() || null,
        description: formValues.description.trim() || null,
        personalRecommendation: formValues.personalRecommendation.trim() || null,
        returnUrl: formValues.returnUrl.trim() || null,
        returnButtonLabel: formValues.returnButtonLabel.trim() || null,
      });

      const nextValues = materialToFormValues(updated);
      setMaterial(updated);
      setFormValues(nextValues);
      setInitialValues(nextValues);
      setToastTone("success");
      setToast("Изменения сохранены");
    } catch (error) {
      setSaveError(getPersonalMaterialErrorMessage(error));
    } finally {
      saveSubmitRef.current = false;
      setSaving(false);
    }
  }

  async function handleUpload(file: File): Promise<boolean> {
    if (!material) {
      return false;
    }

    setUploading(true);
    setUploadError(null);

    try {
      const updated = await uploadAuthorPersonalMaterialAudio(material.id, file);
      setMaterial(updated);
      return true;
    } catch (error) {
      const code = isPersonalMaterialClientError(error) ? error.code : undefined;
      setUploadError(getPersonalMaterialUploadErrorMessage(code));
      return false;
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
    if (!material || !confirmAction) {
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      if (confirmAction === "activate") {
        const result = await activateAuthorPersonalMaterial(material.id);
        setMaterial(result.material);
        setOneTimeAccessUrl(result.accessUrl);
        setFormValues(materialToFormValues(result.material));
        setInitialValues(materialToFormValues(result.material));
      }

      if (confirmAction === "rotate") {
        const result = await rotateAuthorPersonalMaterial(material.id);
        setMaterial(result.material);
        setOneTimeAccessUrl(result.accessUrl);
        window.requestAnimationFrame(() => {
          document.getElementById("personal-material-one-time-link")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        });
      }

      if (confirmAction === "revoke") {
        const updated = await revokeAuthorPersonalMaterial(material.id);
        setMaterial(updated);
        setOneTimeAccessUrl(null);
        setToastTone("success");
        setToast("Доступ по ссылке отозван");
      }

      if (confirmAction === "delete") {
        await deleteAuthorPersonalMaterial(material.id);
        const deletedParam = isPersonalMaterialDiagnostic(material.materialType)
          ? "diagnostic"
          : "material";
        router.replace(
          `/author-dashboard/diagnostics?author=${encodeURIComponent(selectedAuthor?.slug ?? "")}&deleted=${deletedParam}`,
        );
        return;
      }

      setConfirmAction(null);
    } catch (error) {
      if (confirmAction === "activate") {
        if (
          isPersonalMaterialClientError(error) &&
          error.code === "client_name_required"
        ) {
          setFormErrors((current) => ({
            ...current,
            clientFirstName: "Укажите имя клиента.",
          }));
          setActionError("Укажите имя клиента.");
        } else {
          setActionError(getPersonalMaterialActivationErrorMessage(error));
        }
      } else if (confirmAction === "delete") {
        setConfirmAction(null);
        setToastTone("error");
        setToast(getPersonalMaterialErrorMessage(error));
      } else {
        setActionError(getPersonalMaterialErrorMessage(error));
      }
    } finally {
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
  const isEditable =
    material.status === "draft" ||
    material.status === "active" ||
    material.status === "revoked";
  const isReadOnly = !isEditable;
  const linkInactive =
    !material.claimed &&
    (material.status === "revoked" || !material.guestAccessEnabled);
  const canRotateLink = linkInactive;
  const canRevokeLink =
    !material.claimed &&
    material.status === "active" &&
    material.guestAccessEnabled;
  const listHref = `/author-dashboard/diagnostics?author=${encodeURIComponent(selectedAuthor?.slug ?? "")}`;
  const clientName = formatClientDisplayName(
    material.clientFirstName,
    material.clientLastName,
  );
  const materialDisplayTitle = getPersonalMaterialDisplayTitle(material);
  const deleteButtonLabel = getPersonalMaterialDeleteButtonLabel(material.materialType);
  const deleteConfirmTitle = getPersonalMaterialDeleteConfirmTitle(material.materialType);
  const deleteConfirmDescription =
    getPersonalMaterialDeleteConfirmDescription(materialDisplayTitle);

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
          <p
            className={`mt-4 text-sm font-medium ${
              toastTone === "error" ? "text-[#b42318]" : "text-[#3d8d65]"
            }`}
            role={toastTone === "error" ? "alert" : "status"}
          >
            {toast}
          </p>
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
            idPrefix="edit-diagnostics"
            onChange={updateField}
          />
        </div>

        {saveError ? (
          <p className="mt-3 text-sm text-[#b42318]" role="alert">
            {saveError}
          </p>
        ) : null}

        {isEditable ? (
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

      <section className="mt-6 min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5">
        <h3 className="text-[18px] font-semibold">Прослушивание</h3>
        {material.hasAudio ? (
          <div className="mt-4 min-w-0 overflow-x-hidden">
            <PersonalMaterialAudioPlayer
              key={`${material.id}:${material.audioOriginalFilename ?? ""}:${material.audioSizeBytes ?? 0}`}
              materialId={material.id}
              audioApiPath={`/api/author/personal-materials/${encodeURIComponent(material.id)}/audio`}
              progressMode="none"
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#7d70a2]">Аудиофайл ещё не загружен</p>
        )}
      </section>

      {isEditable ? (
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
        </>
      ) : null}

      {isDraft ? (
        <section className="mt-6 min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5">
          <h3 className="text-[18px] font-semibold">Активация</h3>
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            После активации вы получите персональную ссылку для клиента. Материал можно будет
            редактировать и после активации.
          </p>
          <button
            type="button"
            disabled={!hasAttachment || actionLoading || uploading || uploadingPdf}
            onClick={() => {
              if (!formValues) {
                return;
              }

              const nameError = requireClientFirstName(formValues);
              if (nameError) {
                setFormErrors((current) => ({
                  ...current,
                  clientFirstName: nameError,
                }));
                setActionError(nameError);
                document
                  .getElementById("edit-diagnostics-client-first-name")
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
              }

              setConfirmAction("activate");
            }}
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
      ) : (
        <section className="mt-6 min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5">
          <h3 className="text-[18px] font-semibold">Управление доступом</h3>
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            {uiStatus === "revoked"
              ? "Доступ по ссылке отозван."
              : null}
            {uiStatus !== "revoked" ? (
              <>
                {material.hasAudio ? "Аудиофайл загружен." : "Аудиофайл отсутствует."}{" "}
                {material.hasPdf ? "PDF-документ загружен." : "PDF-документ отсутствует."}
              </>
            ) : null}
            {material.claimed
              ? " Клиент уже сохранил материал в личном кабинете."
              : null}
          </p>

          {material.hasPdf ? (
            <div className="mt-4">
              <PersonalMaterialPdfDocument
                pdfOpenPath={`/api/author/personal-materials/${encodeURIComponent(material.id)}/pdf/open`}
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
            {canRotateLink ? (
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setConfirmAction("rotate")}
                className="min-h-11 rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                Создать новую ссылку
              </button>
            ) : null}

          </div>

          {canRevokeLink ? (
            <details className="mt-5 rounded-[18px] border border-[#eadff8] bg-[#faf6ff] px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-[#5f5484]">
                Дополнительные действия
              </summary>
              <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
                Отзыв доступа — аварийное действие. Обычное редактирование материала его не
                требует.
              </p>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setConfirmAction("revoke")}
                className="mt-3 min-h-11 rounded-full border border-[#e4d7f4] bg-white px-5 py-3 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
              >
                Отозвать доступ
              </button>
            </details>
          ) : null}
        </section>
      )}

      {selectedAuthor ? (
        <AuthorDiagnosticsMessageTemplateEditor
          authorId={selectedAuthor.id}
          disabled={actionLoading || saving || uploading || uploadingPdf}
          onTemplateChange={setClientMessageTemplate}
        />
      ) : null}

      {oneTimeAccessUrl ? (
        <div ref={linkResultRef} className="mt-6 min-w-0">
          <AuthorDiagnosticsOneTimeLinkPanel
            accessUrl={oneTimeAccessUrl}
            onDismiss={() => setOneTimeAccessUrl(null)}
          />
          <AuthorDiagnosticsClientMessagePanel
            key={oneTimeAccessUrl}
            clientFirstName={material.clientFirstName}
            clientLastName={material.clientLastName}
            publicUrl={oneTimeAccessUrl}
            messageTemplate={clientMessageTemplate}
            hasAudio={material.hasAudio}
            hasPdf={material.hasPdf}
          />
        </div>
      ) : null}

      <AuthorDiagnosticsConfirmModal
        open={confirmAction === "activate"}
        title="Активировать материал?"
        description="После активации вы получите персональную ссылку для клиента. Материал можно будет редактировать и после активации."
        confirmLabel="Активировать"
        loading={actionLoading}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmAction(null)}
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
        title="Отозвать доступ по ссылке?"
        description="Клиент больше не сможет открыть материал по этой ссылке. Материал, уже добавленный в его личный кабинет, останется доступен."
        confirmLabel="Отозвать доступ"
        confirmTone="danger"
        loading={actionLoading}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmAction(null)}
      />

      <AuthorDiagnosticsConfirmModal
        open={confirmAction === "delete"}
        title={deleteConfirmTitle}
        description={deleteConfirmDescription}
        confirmLabel={deleteButtonLabel}
        confirmTone="danger"
        loading={actionLoading}
        onConfirm={() => void handleConfirmAction()}
        onCancel={() => setConfirmAction(null)}
      />

      <section
        aria-labelledby="personal-material-delete-heading"
        className="mt-8 rounded-[24px] border border-[#f3d9d9] bg-[#fff7f7] p-4 sm:p-5"
      >
        <h3 id="personal-material-delete-heading" className="text-[18px] font-semibold text-[#8b2f2f]">
          Удаление
        </h3>
        <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
          Материал будет удалён без возможности восстановления. Аккаунт клиента не затрагивается.
        </p>
        <button
          type="button"
          disabled={actionLoading}
          onClick={() => setConfirmAction("delete")}
          className="mt-4 min-h-11 rounded-full bg-[#d64545] px-5 py-3 text-sm font-semibold text-white hover:bg-[#bf3a3a] disabled:opacity-60"
        >
          {deleteButtonLabel}
        </button>
      </section>

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
