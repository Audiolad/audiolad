"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

import { createPrivateAudioItemRequest } from "@/lib/private-audio/client/api";
import { getPrivateAudioErrorMessage } from "@/lib/private-audio/error-messages";
import { PRIVATE_AUDIO_LIMITS } from "@/lib/private-audio/limits";
import {
  isAllowedPrivateCoverFile,
  isAllowedPrivateMp3File,
} from "@/lib/private-audio/validation";

type FormPhase = "idle" | "uploading" | "processing" | "done" | "error";

export default function PrivateAudioForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [authorText, setAuthorText] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [rightsAccepted, setRightsAccepted] = useState(false);
  const [phase, setPhase] = useState<FormPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!audioFile) {
      setPhase("error");
      setErrorMessage("Выберите аудиофайл в формате MP3.");
      return;
    }

    if (!isAllowedPrivateMp3File(audioFile)) {
      setPhase("error");
      setErrorMessage(getPrivateAudioErrorMessage("invalid_file_type"));
      return;
    }

    if (audioFile.size > PRIVATE_AUDIO_LIMITS.maxAudioBytes) {
      setPhase("error");
      setErrorMessage(getPrivateAudioErrorMessage("file_too_large"));
      return;
    }

    if (coverFile && !isAllowedPrivateCoverFile(coverFile)) {
      setPhase("error");
      setErrorMessage(getPrivateAudioErrorMessage("invalid_cover_type"));
      return;
    }

    if (!rightsAccepted) {
      setPhase("error");
      setErrorMessage(getPrivateAudioErrorMessage("rights_required"));
      return;
    }

    setPhase("uploading");

    try {
      setPhase("processing");
      const item = await createPrivateAudioItemRequest({
        title,
        authorText,
        rightsAccepted,
        audioFile,
        coverFile,
      });
      setPhase("done");
      router.push(`/my-library/private-audio/${encodeURIComponent(item.id)}`);
      router.refresh();
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code: string }).code)
          : "internal_error";
      setPhase("error");
      setErrorMessage(getPrivateAudioErrorMessage(code));
    }
  }

  const busy = phase === "uploading" || phase === "processing";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="private-audio-file"
          className="block text-sm font-medium text-[#25135c]"
        >
          Аудиофайл (MP3)
        </label>
        <input
          id="private-audio-file"
          type="file"
          accept=".mp3,audio/mpeg"
          required
          disabled={busy}
          onChange={(event) => {
            setAudioFile(event.target.files?.[0] ?? null);
            setErrorMessage(null);
            setPhase("idle");
          }}
          className="mt-2 block w-full text-sm text-[#5f5484] file:mr-3 file:rounded-full file:border-0 file:bg-[#f4eefc] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#7042c5]"
        />
        {audioFile ? (
          <p className="mt-2 text-sm text-[#7d70a2]">
            Выбран файл:{" "}
            <span className="break-all font-medium text-[#25135c]">
              {audioFile.name}
            </span>
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="private-audio-title"
          className="block text-sm font-medium text-[#25135c]"
        >
          Название
        </label>
        <input
          id="private-audio-title"
          type="text"
          required
          maxLength={PRIVATE_AUDIO_LIMITS.titleMaxLength}
          value={title}
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Например: Утренняя практика"
          className="mt-2 w-full rounded-[16px] border border-[#e2d7f2] px-4 py-3 text-[16px] text-[#25135c] outline-none focus:border-[#7042c5]"
        />
      </div>

      <div>
        <label
          htmlFor="private-audio-author"
          className="block text-sm font-medium text-[#25135c]"
        >
          Автор или источник{" "}
          <span className="font-normal text-[#7d70a2]">(необязательно)</span>
        </label>
        <input
          id="private-audio-author"
          type="text"
          maxLength={PRIVATE_AUDIO_LIMITS.authorTextMaxLength}
          value={authorText}
          disabled={busy}
          onChange={(event) => setAuthorText(event.target.value)}
          placeholder="Имя автора или откуда файл"
          className="mt-2 w-full rounded-[16px] border border-[#e2d7f2] px-4 py-3 text-[16px] text-[#25135c] outline-none focus:border-[#7042c5]"
        />
      </div>

      <div>
        <label
          htmlFor="private-audio-cover"
          className="block text-sm font-medium text-[#25135c]"
        >
          Обложка{" "}
          <span className="font-normal text-[#7d70a2]">(необязательно)</span>
        </label>
        <input
          id="private-audio-cover"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(event) => {
            setCoverFile(event.target.files?.[0] ?? null);
          }}
          className="mt-2 block w-full text-sm text-[#5f5484] file:mr-3 file:rounded-full file:border-0 file:bg-[#f4eefc] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#7042c5]"
        />
      </div>

      <div className="rounded-[18px] border border-[#eadff8] bg-[#faf6ff] p-4">
        <label className="flex gap-3 text-sm leading-6 text-[#25135c]">
          <input
            type="checkbox"
            checked={rightsAccepted}
            disabled={busy}
            onChange={(event) => setRightsAccepted(event.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-[#7042c5]"
            required
          />
          <span>
            Я подтверждаю, что имею право хранить и использовать этот
            аудиоматериал для личного прослушивания.
          </span>
        </label>
        <p className="mt-3 text-sm leading-6 text-[#7d70a2]">
          Материал будет доступен только в вашем аккаунте. Его нельзя
          публиковать или передавать другим пользователям через АудиоЛад.{" "}
          <Link href="/offer#section-private-audio" className="text-[#7042c5] underline">
            Подробнее в условиях
          </Link>
          .
        </p>
      </div>

      {errorMessage ? (
        <p role="alert" className="text-sm text-[#d64545]">
          {errorMessage}
        </p>
      ) : null}

      {phase === "uploading" || phase === "processing" ? (
        <p className="text-sm text-[#7d70a2]" aria-live="polite">
          {phase === "uploading"
            ? "Загружаем файл…"
            : "Обрабатываем материал…"}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-[18px] bg-[#7042c5] px-5 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
      >
        {busy ? "Добавляем…" : "Добавить в аудиотеку"}
      </button>
    </form>
  );
}
