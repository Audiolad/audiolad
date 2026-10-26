"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  AUTHOR_FEEDBACK_EMPTY,
  AUTHOR_FEEDBACK_MARK_READ,
  AUTHOR_FEEDBACK_REPLY_PLACEHOLDER,
  LISTENER_IMPRESSION_AUTHOR_REPLY_LABEL,
  LISTENER_IMPRESSION_SORT_NEW,
  LISTENER_IMPRESSION_SORT_OLD,
} from "@/lib/practice-comments/copy";
import type { PublicReplyDto } from "@/lib/practice-comments/types";

type Item = {
  id: string;
  practiceId: string;
  practiceTitle: string;
  practiceHref: string;
  publicName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  reply: PublicReplyDto | null;
  noticeId: string | null;
  unread: boolean;
};

type AuthorOption = { id: string; name: string; slug: string };

export default function AuthorListenerFeedback({
  authors,
}: {
  authors: AuthorOption[];
}) {
  const [authorId, setAuthorId] = useState(authors[0]?.id ?? "");
  const [sort, setSort] = useState<"new" | "old">("new");
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  function applyPage(
    payload: { comments: Item[]; nextCursor: string | null },
    append: boolean,
  ) {
    setItems((current) => (append ? [...current, ...payload.comments] : payload.comments));
    setCursor(payload.nextCursor);
    setError(false);
    setLoading(false);
  }

  useEffect(() => {
    if (!authorId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ authorId, sort, limit: "10" });
    fetch(`/api/author/listener-comments?${params}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("load_failed");
        return (await response.json()) as { comments: Item[]; nextCursor: string | null };
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        applyPage(payload, false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [authorId, sort]);

  return (
    <div data-author-listener-feedback="true">
      <div className="flex flex-wrap gap-2">
        {authors.length > 1 ? (
          <label className="text-sm text-[#5c4d82]">
            Проект
            <select
              className="ml-2 min-h-11 rounded-full border border-[#e4d7f4] bg-white px-3"
              value={authorId}
              onChange={(event) => setAuthorId(event.target.value)}
            >
              {authors.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className={sortButton(sort === "new")}
          onClick={() => {
            setLoading(true);
            setSort("new");
          }}
        >
          {LISTENER_IMPRESSION_SORT_NEW}
        </button>
        <button
          type="button"
          className={sortButton(sort === "old")}
          onClick={() => {
            setLoading(true);
            setSort("old");
          }}
        >
          {LISTENER_IMPRESSION_SORT_OLD}
        </button>
      </div>
      {error ? (
        <div className="mt-4" data-author-feedback-error="true">
          <p className="text-sm text-[#9a3d55]">Не удалось загрузить отзывы.</p>
          <button
            type="button"
            className="mt-2 min-h-11 text-sm font-semibold text-[#7042c5]"
            onClick={() => {
              setLoading(true);
              setError(false);
              const params = new URLSearchParams({ authorId, sort, limit: "10" });
              void fetch(`/api/author/listener-comments?${params}`, { credentials: "same-origin" })
                .then(async (response) => {
                  if (!response.ok) throw new Error("load_failed");
                  return (await response.json()) as { comments: Item[]; nextCursor: string | null };
                })
                .then((payload) => applyPage(payload, false))
                .catch(() => {
                  setError(true);
                  setLoading(false);
                });
            }}
          >
            Повторить
          </button>
        </div>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <p className="mt-4 text-sm text-[#6d628c]" data-author-feedback-empty="true">
          {AUTHOR_FEEDBACK_EMPTY}
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <FeedbackCard
            key={item.id}
            item={item}
            authorSlug={authors.find((author) => author.id === authorId)?.slug ?? ""}
            productSlug={item.practiceHref.split("/")[3]?.split("#")[0] ?? ""}
            onUpdated={(next) => setItems((current) => current.map((row) => (row.id === next.id ? next : row)))}
          />
        ))}
      </ul>
      {cursor ? (
        <button
          type="button"
          className="mt-4 min-h-11 text-sm font-semibold text-[#7042c5]"
          onClick={() => {
            setLoading(true);
            const params = new URLSearchParams({ authorId, sort, limit: "10", cursor });
            void fetch(`/api/author/listener-comments?${params}`, { credentials: "same-origin" })
              .then(async (response) => {
                if (!response.ok) throw new Error("load_failed");
                return (await response.json()) as { comments: Item[]; nextCursor: string | null };
              })
              .then((payload) => applyPage(payload, true))
              .catch(() => {
                setError(true);
                setLoading(false);
              });
          }}
        >
          Показать ещё
        </button>
      ) : null}
      {loading ? <p className="mt-3 text-sm text-[#7d70a2]">Загрузка…</p> : null}
    </div>
  );
}

function FeedbackCard({
  item,
  authorSlug,
  productSlug,
  onUpdated,
}: {
  item: Item;
  authorSlug: string;
  productSlug: string;
  onUpdated: (item: Item) => void;
}) {
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!authorSlug || !productSlug) return;
    setPending(true);
    setMessage(null);
    const clientRequestId = crypto.randomUUID();
    try {
      const response = await fetch(
        `/api/listen/product/${encodeURIComponent(authorSlug)}/${encodeURIComponent(productSlug)}/comments/${item.id}/reply`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", "idempotency-key": clientRequestId },
          body: JSON.stringify({ body: reply, clientRequestId }),
        },
      );
      const payload = (await response.json()) as { error?: string; comment?: { reply: PublicReplyDto | null } };
      if (!response.ok || !payload.comment) {
        setMessage("Не удалось отправить ответ.");
        return;
      }
      setReply("");
      onUpdated({ ...item, reply: payload.comment.reply, unread: false });
      if (item.noticeId) {
        await fetch("/api/author/listener-comments", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ noticeId: item.noticeId }),
        });
      }
    } catch {
      setMessage("Не удалось отправить ответ.");
    } finally {
      setPending(false);
    }
  }

  async function markRead() {
    if (!item.noticeId) return;
    await fetch("/api/author/listener-comments", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ noticeId: item.noticeId }),
    });
    onUpdated({ ...item, unread: false });
  }

  return (
    <li className="rounded-[22px] border border-[#eadff8] bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#7042c5]">
        {item.unread ? "Новый отзыв" : "Отзыв"}
      </p>
      <a className="mt-1 block font-semibold text-[#2b2144] underline" href={item.practiceHref}>
        {item.practiceTitle}
      </a>
      <p className="mt-2 text-sm text-[#6d628c]">
        {item.publicName} · {formatWhen(item.createdAt)}
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p>
      {item.reply ? (
        <div className="mt-3 rounded-[16px] bg-[#f7f3fc] px-3 py-3">
          <p className="text-xs font-semibold text-[#7042c5]">{LISTENER_IMPRESSION_AUTHOR_REPLY_LABEL}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{item.reply.body}</p>
        </div>
      ) : (
        <form className="mt-3" onSubmit={(event) => void send(event)}>
          <textarea
            className="min-h-20 w-full rounded-[16px] border border-[#e4d7f4] px-3 py-3 text-base"
            placeholder={AUTHOR_FEEDBACK_REPLY_PLACEHOLDER}
            value={reply}
            maxLength={2000}
            onChange={(event) => setReply(event.target.value)}
          />
          <button
            type="submit"
            className="mt-2 inline-flex min-h-11 items-center rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-60"
            disabled={pending || reply.trim().length < 2}
          >
            Ответить
          </button>
        </form>
      )}
      {item.unread && item.noticeId ? (
        <button type="button" className="mt-2 min-h-11 text-sm font-semibold text-[#7042c5]" onClick={() => void markRead()}>
          {AUTHOR_FEEDBACK_MARK_READ}
        </button>
      ) : null}
      {message ? <p className="mt-2 text-sm text-[#9a3d55]">{message}</p> : null}
    </li>
  );
}

function sortButton(active: boolean): string {
  return `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${
    active ? "bg-[#7042c5] text-white" : "border border-[#e4d7f4] bg-white text-[#7042c5]"
  }`;
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
