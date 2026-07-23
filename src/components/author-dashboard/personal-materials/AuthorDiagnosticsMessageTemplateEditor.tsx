"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_CLIENT_MESSAGE_TEMPLATE,
  validateClientMessageTemplate,
} from "@/lib/personal-materials/client-message-template";
import {
  getAuthorPersonalMaterialSettings,
  isPersonalMaterialClientError,
  updateAuthorPersonalMaterialSettings,
} from "@/lib/personal-materials/client/api";
import { getPersonalMaterialErrorMessage } from "@/lib/personal-materials/client/errors";

type AuthorDiagnosticsMessageTemplateEditorProps = {
  authorId: string;
  disabled?: boolean;
  onTemplateChange?: (template: string | null) => void;
};

export default function AuthorDiagnosticsMessageTemplateEditor({
  authorId,
  disabled = false,
  onTemplateChange,
}: AuthorDiagnosticsMessageTemplateEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draftTemplate, setDraftTemplate] = useState("");
  const [savedTemplate, setSavedTemplate] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadSettings() {
      setLoading(true);
      setLoadError(null);

      try {
        const settings = await getAuthorPersonalMaterialSettings(authorId, controller.signal);
        if (cancelled) {
          return;
        }

        setSavedTemplate(settings.clientMessageTemplate);
        setDraftTemplate(settings.clientMessageTemplate ?? DEFAULT_CLIENT_MESSAGE_TEMPLATE);
        onTemplateChange?.(settings.clientMessageTemplate);
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (isPersonalMaterialClientError(error) && error.status === 403) {
          setLoadError("У вас нет доступа к настройкам этого пространства.");
        } else {
          setLoadError("Не удалось загрузить шаблон сообщения.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [authorId, onTemplateChange]);

  function handleDraftChange(value: string) {
    setDraftTemplate(value);
    setValidationError(validateClientMessageTemplate(value));
    setSavedNotice(null);
  }

  async function handleSave() {
    const nextValidationError = validateClientMessageTemplate(draftTemplate);
    setValidationError(nextValidationError);

    if (nextValidationError) {
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSavedNotice(null);

    try {
      const trimmed = draftTemplate.trim();
      const nextTemplate = trimmed === DEFAULT_CLIENT_MESSAGE_TEMPLATE ? null : trimmed || null;
      const settings = await updateAuthorPersonalMaterialSettings(authorId, {
        clientMessageTemplate: nextTemplate,
      });

      setSavedTemplate(settings.clientMessageTemplate);
      setDraftTemplate(settings.clientMessageTemplate ?? DEFAULT_CLIENT_MESSAGE_TEMPLATE);
      onTemplateChange?.(settings.clientMessageTemplate);
      setSavedNotice("Шаблон сохранён");
    } catch (error) {
      setSaveError(getPersonalMaterialErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleRestoreDefault() {
    setSaving(true);
    setSaveError(null);
    setSavedNotice(null);
    setValidationError(null);

    try {
      const settings = await updateAuthorPersonalMaterialSettings(authorId, {
        clientMessageTemplate: null,
      });

      setSavedTemplate(settings.clientMessageTemplate);
      setDraftTemplate(settings.clientMessageTemplate ?? DEFAULT_CLIENT_MESSAGE_TEMPLATE);
      onTemplateChange?.(settings.clientMessageTemplate);
      setSavedNotice("Стандартный шаблон восстановлен");
    } catch (error) {
      setSaveError(getPersonalMaterialErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  const isDirty =
    draftTemplate.trim() !== (savedTemplate ?? DEFAULT_CLIENT_MESSAGE_TEMPLATE).trim();

  return (
    <section className="mt-6 min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
        aria-expanded={expanded}
      >
        <span className="text-sm font-semibold text-[#7042c5]">Настроить шаблон сообщения</span>
        <span className="text-sm text-[#7d70a2]">{expanded ? "Свернуть" : "Развернуть"}</span>
      </button>

      {expanded ? (
        <div className="mt-4 min-w-0">
          {loading ? <p className="text-sm text-[#7d70a2]">Загрузка шаблона…</p> : null}
          {loadError ? (
            <p className="text-sm text-[#b42318]" role="alert">
              {loadError}
            </p>
          ) : null}

          {!loading && !loadError ? (
            <>
              <label htmlFor="client-message-template" className="block text-sm font-medium text-[#2f2448]">
                Шаблон сообщения клиенту
              </label>
              <p className="mt-1 text-sm text-[#7d70a2]">
                Доступные переменные: {"{clientName}"}, {"{publicUrl}"}, {"{contentAction}"}
              </p>
              <textarea
                id="client-message-template"
                value={draftTemplate}
                disabled={disabled || saving}
                onChange={(event) => handleDraftChange(event.target.value)}
                rows={8}
                className="mt-3 min-h-[180px] w-full min-w-0 rounded-[18px] border border-[#e4d7f4] bg-[#faf7ff] px-3 py-3 text-sm leading-6 text-[#2f2448] outline-none focus:border-[#7042c5]"
              />

              {validationError ? (
                <p className="mt-2 text-sm text-[#b42318]" role="alert">
                  {validationError}
                </p>
              ) : null}
              {saveError ? (
                <p className="mt-2 text-sm text-[#b42318]" role="alert">
                  {saveError}
                </p>
              ) : null}
              {savedNotice ? (
                <p className="mt-2 text-sm font-medium text-[#3d8d65]" role="status">
                  {savedNotice}
                </p>
              ) : null}

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  disabled={disabled || saving || !isDirty || Boolean(validationError)}
                  onClick={() => void handleSave()}
                  className="min-h-11 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Сохранение…" : "Сохранить шаблон"}
                </button>
                <button
                  type="button"
                  disabled={disabled || saving}
                  onClick={() => void handleRestoreDefault()}
                  className="min-h-11 rounded-full border border-[#e4d7f4] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
                >
                  Вернуть стандартный шаблон
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
