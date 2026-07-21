"use client";

import { useState } from "react";

import {
  copyTextToClipboard,
  openExternalUrl,
} from "@/lib/personal-materials/client/clipboard";

type AuthorDiagnosticsOneTimeLinkPanelProps = {
  accessUrl: string;
  onDismiss?: () => void;
};

export default function AuthorDiagnosticsOneTimeLinkPanel({
  accessUrl,
  onDismiss,
}: AuthorDiagnosticsOneTimeLinkPanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  async function handleCopy() {
    const copied = await copyTextToClipboard(accessUrl);
    setCopyState(copied ? "copied" : "failed");
  }

  return (
    <section
      aria-live="polite"
      className="rounded-[24px] border border-[#cfead9] bg-[#f4fbf7] p-4 sm:p-5"
    >
      <h3 className="text-[18px] font-semibold text-[#24553a]">Ссылка создана</h3>
      <p className="mt-2 text-sm leading-6 text-[#3d6650]">
        Скопируйте её сейчас и отправьте клиенту. В целях безопасности АудиоЛад не
        хранит исходный секретный токен и не сможет показать эту же ссылку повторно.
      </p>
      <p className="mt-2 text-sm leading-6 text-[#3d6650]">
        Если ссылка будет потеряна, можно создать новую. Старая ссылка перестанет
        работать.
      </p>

      <div className="mt-4 rounded-[18px] border border-[#b9dcc8] bg-white px-3 py-3">
        <p className="break-all text-sm text-[#24553a]">{accessUrl}</p>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="min-h-11 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
        >
          Скопировать ссылку
        </button>
        <button
          type="button"
          onClick={() => openExternalUrl(accessUrl)}
          className="min-h-11 rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
        >
          Открыть ссылку
        </button>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="min-h-11 rounded-full px-4 py-2 text-sm font-semibold text-[#5f5484]"
          >
            Скрыть
          </button>
        ) : null}
      </div>

      {copyState === "copied" ? (
        <p className="mt-3 text-sm font-medium text-[#24553a]" role="status">
          Ссылка скопирована
        </p>
      ) : null}
      {copyState === "failed" ? (
        <p className="mt-3 text-sm text-[#b67a1d]" role="status">
          Не удалось скопировать автоматически. Выделите ссылку и скопируйте вручную.
        </p>
      ) : null}
    </section>
  );
}
