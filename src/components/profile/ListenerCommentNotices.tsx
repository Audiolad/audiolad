"use client";

import { useEffect, useState } from "react";

type Notice = {
  id: string;
  practiceTitle: string;
  practiceHref: string;
  preview: string;
  createdAt: string;
  unread: boolean;
};

export default function ListenerCommentNotices() {
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/listener/comment-notices", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { notices?: Notice[] };
        if (!cancelled) setNotices((payload.notices ?? []).filter((notice) => notice.unread));
      })
      .catch(() => {
        if (!cancelled) setNotices([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (notices.length === 0) return null;

  return (
    <section className="mt-6 rounded-[22px] border border-[#eadff8] bg-white px-4 py-4" data-listener-comment-notices="true">
      <h2 className="text-base font-semibold text-[#2b2144]">Ответы авторов</h2>
      <ul className="mt-3 space-y-3">
        {notices.map((notice) => (
          <li key={notice.id} className="text-sm leading-6">
            <a className="font-semibold text-[#7042c5] underline" href={notice.practiceHref}>
              {notice.practiceTitle}
            </a>
            <p className="whitespace-pre-wrap break-words text-[#5c4d82]">{notice.preview}</p>
            <button
              type="button"
              className="mt-1 min-h-11 text-sm font-semibold text-[#7042c5]"
              onClick={() => {
                void fetch("/api/listener/comment-notices", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ noticeId: notice.id }),
                });
                setNotices((current) => current.filter((item) => item.id !== notice.id));
              }}
            >
              Прочитано
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
