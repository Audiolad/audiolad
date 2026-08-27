"use client";

import { useRef, useState } from "react";

import {
  AUTHOR_CONTACT_PLATFORM_LABELS,
  MAX_AUTHOR_CONTACTS,
  MAX_AUTHOR_CONTACT_DESCRIPTION_LENGTH,
  MAX_AUTHOR_CONTACT_TITLE_LENGTH,
  type AuthorContactPlatform,
} from "@/lib/authors/constants";
import {
  resolveAuthorContactIconUrl,
  type AuthorContactDraft,
} from "@/lib/authors/contacts";
import { listAuthorContactPlatforms } from "@/lib/authors/contacts-validation";

export type { AuthorContactDraft };

type AuthorContactsEditorProps = {
  authorId: string;
  contacts: AuthorContactDraft[];
  disabled?: boolean;
  dirty?: boolean;
  saving?: boolean;
  saved?: boolean;
  saveError?: string | null;
  onChange: (contacts: AuthorContactDraft[]) => void;
  onSave?: () => void;
};

const TITLE_EXAMPLES: Record<AuthorContactPlatform, string> = {
  telegram: "Например: Telegram-канал или Написать мне в Telegram",
  max: "Например: MAX-канал или Написать Сергею",
  custom: "Например: Мой RuTube или Личные сообщения",
};

function createContactDraft(platform: AuthorContactPlatform): AuthorContactDraft {
  return {
    id: crypto.randomUUID(),
    platform,
    title: "",
    description: "",
    url: "",
    iconUrl: null,
    iconPath: null,
    iconImage: null,
    isVisible: true,
  };
}

export default function AuthorContactsEditor({
  authorId,
  contacts,
  disabled = false,
  dirty = false,
  saving = false,
  saved = false,
  saveError = null,
  onChange,
  onSave,
}: AuthorContactsEditorProps) {
  const [adding, setAdding] = useState(false);

  function updateContact(index: number, patch: Partial<AuthorContactDraft>) {
    onChange(
      contacts.map((contact, currentIndex) =>
        currentIndex === index ? { ...contact, ...patch } : contact,
      ),
    );
  }

  function moveContact(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;

    if (nextIndex < 0 || nextIndex >= contacts.length) {
      return;
    }

    const next = [...contacts];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    onChange(next);
  }

  function removeContact(index: number) {
    onChange(contacts.filter((_, currentIndex) => currentIndex !== index));
  }

  function addContact(platform: AuthorContactPlatform) {
    if (contacts.length >= MAX_AUTHOR_CONTACTS) {
      return;
    }

    onChange([...contacts, createContactDraft(platform)]);
    setAdding(false);
  }

  return (
    <section className="rounded-[24px] border border-[#eadff8] bg-white p-5">
      <h2 className="text-lg font-semibold">Контакты</h2>
      <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
        Добавьте Telegram, MAX или другую ссылку. На публичной странице
        появятся только видимые контакты.
      </p>

      {contacts.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {contacts.map((contact, index) => (
            <AuthorContactEditorRow
              key={contact.id}
              authorId={authorId}
              contact={contact}
              index={index}
              total={contacts.length}
              disabled={disabled}
              onChange={(patch) => updateContact(index, patch)}
              onMove={(direction) => moveContact(index, direction)}
              onRemove={() => removeContact(index)}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[#7d70a2]">Пока контакты не добавлены.</p>
      )}

      {contacts.length < MAX_AUTHOR_CONTACTS ? (
        <div className="mt-4">
          {adding ? (
            <div>
              <p className="mb-2 text-sm font-medium">Тип</p>
              <div className="flex flex-wrap gap-2">
                {listAuthorContactPlatforms().map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    disabled={disabled}
                    onClick={() => addContact(platform)}
                    className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
                  >
                    {AUTHOR_CONTACT_PLATFORM_LABELS[platform]}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setAdding(false)}
                  className="rounded-full border border-[#e4d7f4] px-4 py-2 text-sm text-[#7d70a2]"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setAdding(true)}
              className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
            >
              + Добавить контакт
            </button>
          )}
        </div>
      ) : (
        <p className="mt-4 text-xs text-[#7d70a2]">
          Можно добавить не больше {MAX_AUTHOR_CONTACTS} контактов.
        </p>
      )}

      <div className="mt-5 min-w-0 max-w-full">
        <button
          type="button"
          disabled={disabled || saving || !dirty}
          onClick={() => onSave?.()}
          className="inline-flex min-h-11 w-full max-w-full items-center justify-center rounded-full bg-[#7042c5] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {saving ? "Сохраняем…" : "Сохранить изменения"}
        </button>
        {saveError ? (
          <p className="mt-3 break-words text-sm text-[#9b3d3d]">{saveError}</p>
        ) : saved ? (
          <p className="mt-3 text-sm text-[#2f7a55]">Сохранено</p>
        ) : null}
      </div>
    </section>
  );
}

type AuthorContactEditorRowProps = {
  authorId: string;
  contact: AuthorContactDraft;
  index: number;
  total: number;
  disabled: boolean;
  onChange: (patch: Partial<AuthorContactDraft>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};

function AuthorContactEditorRow({
  authorId,
  contact,
  index,
  total,
  disabled,
  onChange,
  onMove,
  onRemove,
}: AuthorContactEditorRowProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);
  const iconSrc = resolveAuthorContactIconUrl(contact.platform, contact.iconUrl);
  const descriptionLength = contact.description.trim().length;
  const busy = disabled || uploading;

  async function uploadIcon(file: File) {
    setUploading(true);
    setIconError(null);

    const formData = new FormData();
    formData.set("author_id", authorId);
    formData.set("contact_id", contact.id);
    formData.set("file", file);

    try {
      const response = await fetch("/api/author/profile/contact-icon", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as {
        url?: string | null;
        path?: string | null;
        image?: unknown;
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.message ?? "Не удалось загрузить иконку.");
      }

      onChange({
        iconUrl: payload?.url ?? null,
        iconPath: payload?.path ?? null,
        iconImage: payload?.image ?? null,
      });
    } catch (error) {
      setIconError(
        error instanceof Error ? error.message : "Не удалось загрузить иконку.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function resetIcon() {
    if (!contact.iconUrl) {
      return;
    }

    setUploading(true);
    setIconError(null);

    try {
      const response = await fetch(
        `/api/author/profile/contact-icon?author_id=${encodeURIComponent(authorId)}&contact_id=${encodeURIComponent(contact.id)}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        throw new Error("Не удалось вернуть стандартную иконку.");
      }

      onChange({
        iconUrl: null,
        iconPath: null,
        iconImage: null,
      });
    } catch (error) {
      setIconError(
        error instanceof Error
          ? error.message
          : "Не удалось вернуть стандартную иконку.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <li className="rounded-[18px] border border-[#eadff8] bg-[#faf6ff] p-3 sm:p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-[#eadff8] bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} alt="" className="h-full w-full object-cover" />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <label className="block">
            <span className="mb-2 block text-sm font-medium">Тип</span>
            <select
              value={contact.platform}
              disabled={busy}
              onChange={(event) =>
                onChange({
                  platform: event.target.value as AuthorContactPlatform,
                })
              }
              className="w-full rounded-[18px] border border-[#ddcfef] bg-white px-4 py-3 text-sm"
            >
              {listAuthorContactPlatforms().map((platform) => (
                <option key={platform} value={platform}>
                  {AUTHOR_CONTACT_PLATFORM_LABELS[platform]}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Название</span>
            <input
              type="text"
              value={contact.title}
              onChange={(event) => onChange({ title: event.target.value })}
              maxLength={MAX_AUTHOR_CONTACT_TITLE_LENGTH}
              placeholder={TITLE_EXAMPLES[contact.platform]}
              className="w-full rounded-[18px] border border-[#ddcfef] bg-white px-4 py-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">Ссылка</span>
            <input
              type="text"
              value={contact.url}
              onChange={(event) => onChange({ url: event.target.value })}
              placeholder="https://t.me/username"
              className="w-full rounded-[18px] border border-[#ddcfef] bg-white px-4 py-3 text-sm"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium">
              Короткий текст
            </span>
            <input
              type="text"
              value={contact.description}
              onChange={(event) => onChange({ description: event.target.value })}
              maxLength={MAX_AUTHOR_CONTACT_DESCRIPTION_LENGTH}
              placeholder="Необязательно"
              className="w-full rounded-[18px] border border-[#ddcfef] bg-white px-4 py-3 text-sm"
            />
            <span className="mt-1 block text-xs text-[#7d70a2]">
              {descriptionLength}/{MAX_AUTHOR_CONTACT_DESCRIPTION_LENGTH}
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={contact.isVisible}
              disabled={busy}
              onChange={(event) => onChange({ isVisible: event.target.checked })}
            />
            Показывать на странице автора
          </label>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  void uploadIcon(file);
                }
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full border border-[#c6afe6] px-3 py-1.5 text-xs font-semibold text-[#7042c5] disabled:opacity-60"
            >
              {uploading
                ? "Загрузка…"
                : contact.iconUrl
                  ? "Заменить иконку"
                  : "Загрузить иконку"}
            </button>
            {contact.iconUrl ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void resetIcon()}
                className="rounded-full border border-[#e4d7f4] px-3 py-1.5 text-xs text-[#7d70a2]"
              >
                {contact.platform === "custom"
                  ? "Удалить иконку"
                  : "Вернуть стандартную"}
              </button>
            ) : null}
          </div>
          {iconError ? (
            <p className="text-xs text-[#9b3d3d]">{iconError}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0 || busy}
            aria-label="Поднять выше"
            className="rounded-full border border-[#ddcfef] px-2 py-1 text-xs"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1 || busy}
            aria-label="Опустить ниже"
            className="rounded-full border border-[#ddcfef] px-2 py-1 text-xs"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className="rounded-full border border-[#e4d7f4] px-2 py-1 text-xs text-[#7d70a2]"
          >
            ✕
          </button>
        </div>
      </div>
    </li>
  );
}
