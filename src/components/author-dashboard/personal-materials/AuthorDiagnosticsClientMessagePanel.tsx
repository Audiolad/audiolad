"use client";

import { useMemo, useState } from "react";

import { copyTextToClipboard } from "@/lib/personal-materials/client/clipboard";
import {
  renderClientMessageTemplate,
  resolveClientNameForMessage,
} from "@/lib/personal-materials/client-message-template";

type AuthorDiagnosticsClientMessagePanelProps = {
  clientFirstName: string;
  clientLastName: string | null;
  publicUrl: string;
  messageTemplate: string | null;
};

export default function AuthorDiagnosticsClientMessagePanel({
  clientFirstName,
  clientLastName,
  publicUrl,
  messageTemplate,
}: AuthorDiagnosticsClientMessagePanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const messageText = useMemo(
    () =>
      renderClientMessageTemplate(messageTemplate, {
        clientName: resolveClientNameForMessage(clientFirstName, clientLastName),
        publicUrl,
      }),
    [clientFirstName, clientLastName, messageTemplate, publicUrl],
  );

  async function handleCopyMessage() {
    const copied = await copyTextToClipboard(messageText);
    setCopyState(copied ? "copied" : "failed");
  }

  return (
    <section
      aria-live="polite"
      className="mt-4 min-w-0 rounded-[24px] border border-[#eadff8] bg-white p-4 sm:p-5"
    >
      <h3 className="text-[18px] font-semibold text-[#2f2448]">Сообщение клиенту</h3>
      <p className="mt-2 text-sm leading-6 text-[#7d70a2]">
        Текст уже заполнен. Скопируйте его и отправьте клиенту в MAX, Telegram или другом
        мессенджере.
      </p>

      <div className="mt-4 min-w-0 rounded-[18px] border border-[#e4d7f4] bg-[#faf7ff] px-3 py-3">
        <textarea
          readOnly
          value={messageText}
          rows={7}
          aria-label="Сообщение клиенту"
          className="min-h-[160px] w-full min-w-0 resize-y border-0 bg-transparent text-sm leading-6 text-[#2f2448] outline-none"
        />
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => void handleCopyMessage()}
          className="min-h-11 rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
        >
          Скопировать сообщение
        </button>
      </div>

      {copyState === "copied" ? (
        <p className="mt-3 text-sm font-medium text-[#3d8d65]" role="status">
          Сообщение скопировано
        </p>
      ) : null}
      {copyState === "failed" ? (
        <p className="mt-3 text-sm text-[#b67a1d]" role="status">
          Не удалось скопировать автоматически. Выделите текст и скопируйте вручную.
        </p>
      ) : null}
    </section>
  );
}
