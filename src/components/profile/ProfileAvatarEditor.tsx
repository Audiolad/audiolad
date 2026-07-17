"use client";

import Image from "next/image";
import { useRef, useState } from "react";

type ProfileAvatarEditorProps = {
  initialAvatarUrl: string | null;
  initial: string;
};

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none">
      <path
        d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.2-1.8h4.6L15.5 6h2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12.5"
        r="3"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  );
}

export default function ProfileAvatarEditor({
  initialAvatarUrl,
  initial,
}: ProfileAvatarEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setIsUploading(true);
    setMessage("");
    setIsError(false);

    const formData = new FormData();
    formData.set("file", file);

    try {
      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => null)) as
        | { avatarUrl?: string; message?: string }
        | null;

      if (!response.ok) {
        setIsError(true);
        setMessage(
          payload?.message ?? "Не удалось загрузить аватар. Попробуйте ещё раз.",
        );
        return;
      }

      if (payload?.avatarUrl) {
        setAvatarUrl(payload.avatarUrl);
        setMessage("Фотография обновлена.");
      }
    } catch {
      setIsError(true);
      setMessage("Не удалось загрузить аватар. Попробуйте ещё раз.");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setMessage("");
    setIsError(false);

    try {
      const response = await fetch("/api/profile/avatar", {
        method: "DELETE",
      });

      if (!response.ok && response.status !== 204) {
        setIsError(true);
        setMessage("Не удалось удалить аватар. Попробуйте ещё раз.");
        return;
      }

      setAvatarUrl(null);
      setMessage("Фотография удалена.");
    } catch {
      setIsError(true);
      setMessage("Не удалось удалить аватар. Попробуйте ещё раз.");
    } finally {
      setIsDeleting(false);
    }
  }

  const isBusy = isUploading || isDeleting;

  return (
    <section className="mt-7">
      <div className="flex flex-col items-center">
        <div className="relative">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
            aria-label="Изменить фотографию"
            className="relative flex h-[130px] w-[130px] items-center justify-center overflow-hidden rounded-[34px] bg-gradient-to-br from-[#eadcf7] to-[#c4a4e5] text-[46px] font-semibold text-[#7042c5] shadow-[0_14px_34px_rgba(96,59,168,0.14)] disabled:cursor-wait"
          >
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt=""
                fill
                unoptimized
                className="object-cover"
                sizes="130px"
              />
            ) : (
              initial
            )}
          </button>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isBusy}
            aria-label="Выбрать фотографию"
            className="absolute -bottom-2 -right-2 flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-[#7042c5] text-white shadow-lg disabled:cursor-wait"
          >
            <CameraIcon />
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={handleFileChange}
          />
        </div>

        <p className="mt-5 text-sm font-medium text-[#8a7ca9]">
          {isUploading
            ? "Загружаем фотографию…"
            : isDeleting
              ? "Удаляем фотографию…"
              : "Изменить фотографию"}
        </p>

        {avatarUrl ? (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={isBusy}
            className="mt-3 text-sm font-medium text-[#b34f63] disabled:opacity-60"
          >
            Удалить фотографию
          </button>
        ) : null}

        {message ? (
          <p
            role="status"
            className={`mt-3 text-center text-sm leading-6 ${
              isError ? "text-[#b34f63]" : "text-[#3d8d65]"
            }`}
          >
            {message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
