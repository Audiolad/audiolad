"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatClientDisplayName } from "@/lib/personal-materials/display-name";
import AuthorDashboardNav from "@/components/author-dashboard/AuthorDashboardNav";
import AuthorDiagnosticsAudioUpload from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsAudioUpload";
import AuthorDiagnosticsConfirmModal from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsConfirmModal";
import AuthorDiagnosticsFormFields from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsFormFields";
import AuthorDiagnosticsOneTimeLinkPanel from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsOneTimeLinkPanel";
import AuthorDiagnosticsStatusBadge from "@/components/author-dashboard/personal-materials/AuthorDiagnosticsStatusBadge";
import PersonalMaterialAudioPlayer from "@/components/personal-materials/guest/PersonalMaterialAudioPlayer";
import {
  activateAuthorPersonalMaterial,
  deleteAuthorPersonalMaterial,
  deleteAuthorPersonalMaterialAudio,
  getAuthorPersonalMaterial,
  isPersonalMaterialClientError,
  revokeAuthorPersonalMaterial,
  rotateAuthorPersonalMaterial,
  updateAuthorPersonalMaterial,
  uploadAuthorPersonalMaterialAudio,
} from "@/lib/personal-materials/client/api";
import {
  getPersonalMaterialActivationErrorMessage,
  getPersonalMaterialErrorMessage,
  getPersonalMaterialUploadErrorMessage,
} from "@/lib/personal-materials/client/errors";
import {
  formatMaterialDateLabel,
  validatePersonalMaterialForm,
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [oneTimeAccessUrl, setOneTimeAccessUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const saveSubmitRef = useRef(false);

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
        clientFirstName: formValues.clientFirstName.trim(),
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
      if (confirmAction === "activate") {
        setActionError(getPersonalMaterialActivationErrorMessage());
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
          <div className="mt-5" id="personal-material-one-time-link">
            <AuthorDiagnosticsOneTimeLinkPanel
              key={oneTimeAccessUrl}
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
              materialId={material.id}
              audioApiPath={`/api/author/personal-materials/${encodeURIComponent(material.id)}/audio?v=${encodeURIComponent(
                `${material.audioOriginalFilename ?? ""}:${material.audioSizeBytes ?? 0}`,
              )}`}
              progressMode="none"
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#7d70a2]">Аудиофайл ещё не загружен</p>
        )}
      </section>

      {isEditable ? (
        <div className="mt-6">
          <AuthorDiagnosticsAudioUpload
            hasAudio={material.hasAudio}
            audioOriginalFilename={material.audioOriginalFilename}
            audioSizeBytes={material.audioSizeBytes}
            disabled={actionLoading}
            uploading={uploading}
            error={uploadError}
            onUpload={handleUpload}
            onDelete={handleDeleteAudio}
          />
        </div>
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
            disabled={!material.hasAudio || actionLoading || uploading}
            onClick={() => setConfirmAction("activate")}
            className="mt-4 min-h-11 w-full rounded-full bg-[#7042c5] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
          >
            Активировать и получить ссылку
          </button>
          {!material.hasAudio ? (
            <p className="mt-3 text-sm text-[#b67a1d]" role="status">
              Сначала загрузите аудиофайл
            </p>
          ) : null}
        </section>
      ) : (
        <section className="mt-6 min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5">
          <h3 className="text-[18px] font-semibold">Управление доступом</h3>
          <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
            {uiStatus === "revoked"
              ? "Доступ по ссылке отозван."
              : material.hasAudio
                ? "Аудиофайл загружен."
                : "Аудиофайл отсутствует."}
            {material.claimed
              ? " Клиент уже сохранил материал в личном кабинете."
              : null}
          </p>

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

            <button
              type="button"
              disabled={actionLoading}
              onClick={() => setConfirmAction("delete")}
              className="min-h-11 rounded-full border border-[#f0c7c7] px-5 py-3 text-sm font-semibold text-[#b42318] disabled:opacity-60"
            >
              Удалить
            </button>
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
