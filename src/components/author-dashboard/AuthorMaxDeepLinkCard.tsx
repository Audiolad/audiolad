"use client";

import { useState } from "react";

import { copyTextToClipboard } from "@/lib/playlists/public-url";

export default function AuthorMaxDeepLinkCard({
  url,
  label = "Ссылка для MAX",
}: {
  url: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const ok = await copyTextToClipboard(url);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section
      className="rounded-[22px] border border-[#eadff8] bg-white px-4 py-4"
      data-author-max-deep-link=""
    >
      <p className="text-[16px] font-semibold">{label}</p>
      <p className="mt-1 text-sm leading-6 text-[#7d70a2]">
        Для постов, каналов и сообщений в MAX. При нажатии АудиоЛад откроется
        внутри Mini App сразу на нужной странице.
      </p>
      <p className="mt-3 break-all rounded-[14px] bg-[#faf8ff] px-3 py-2 text-xs text-[#5f5484]">
        {url}
      </p>
      <button
        type="button"
        onClick={() => void copy()}
        className="mt-3 rounded-full border border-[#ddcfef] px-4 py-2 text-xs font-semibold text-[#7042c5]"
      >
        {copied ? "MAX-ссылка скопирована" : "Скопировать MAX-ссылку"}
      </button>
    </section>
  );
}
