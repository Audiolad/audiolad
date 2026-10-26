"use client";

import { useState } from "react";

import { listenerAvatarPresentation } from "@/lib/practice-comments/avatar";

export default function ListenerImpressionAvatar({
  name,
  url,
}: {
  name: string;
  url: string | null;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const presentation = listenerAvatarPresentation({ name, url, imageFailed });

  if (presentation.kind === "image") {
    return (
      <span className="inline-flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#f3eefe]">
        {/* eslint-disable-next-line @next/next/no-img-element -- onError falls back to the letter */}
        <img
          src={presentation.url}
          alt={presentation.alt}
          className="h-10 w-10 rounded-full object-cover"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={presentation.label}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
      style={{ backgroundColor: presentation.color }}
    >
      {presentation.letter}
    </span>
  );
}
