"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { publishAuthorUnreadCount } from "@/components/author-dashboard/AuthorUnreadCommentBadge";
import { parsePracticePublicPath } from "@/lib/products/paths";
import ListenerImpressionAvatar from "@/components/products/practice-page/ListenerImpressionAvatar";
import {
  AUTHOR_COMMENTS_ALL_PROJECTS,
  AUTHOR_COMMENTS_EMPTY,
  AUTHOR_COMMENTS_FILTER_ALL,
  AUTHOR_COMMENTS_FILTER_NEW,
  AUTHOR_COMMENTS_FILTER_UNANSWERED,
  AUTHOR_COMMENTS_MARK_ALL,
  AUTHOR_COMMENTS_NEW_LABEL,
  AUTHOR_COMMENTS_OPEN,
  AUTHOR_FEEDBACK_REPLY_PLACEHOLDER,
  LISTENER_IMPRESSION_AUTHOR_REPLY_LABEL,
  LISTENER_IMPRESSION_LOAD_MORE,
  LISTENER_IMPRESSION_SORT_NEW,
  LISTENER_IMPRESSION_SORT_OLD,
} from "@/lib/practice-comments/copy";
import type { AuthorImpressionFilter } from "@/lib/practice-comments/store";
import type { PublicReplyDto } from "@/lib/practice-comments/types";

type Item = {
  id: string;
  practiceId: string;
  authorName: string;
  authorSlug: string;
  productSlug: string;
  practiceTitle: string;
  practiceHref: string;
  publicName: string;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  reply: PublicReplyDto | null;
  noticeId: string | null;
  unread: boolean;
};

type AuthorOption = { id: string; name: string; slug: string };
type Filter = AuthorImpressionFilter;

export default function AuthorListenerFeedback({
  authors,
}: {
  authors: AuthorOption[];
}) {
  const [authorId, setAuthorId] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"new" | "old">("new");
  const [items, setItems] = useState<Item[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  function applyPage(
    payload: { comments: Item[]; nextCursor: string | null; unreadCount?: number },
    append: boolean,
  ) {
    setItems((current) => (append ? [...current, ...payload.comments] : payload.comments));
    setCursor(payload.nextCursor);
    setError(false);
    setLoading(false);
    if (typeof payload.unreadCount === "number" && !append) {
      publishAuthorUnreadCount(payload.unreadCount);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(listUrl(authorId, filter, sort, null), {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("load_failed");
        return (await response.json()) as { comments: Item[]; nextCursor: string | null; unreadCount?: number };
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
  }, [authorId, filter, sort]);

  const markViewed = useCallback((id: string, unreadCount: number | null) => {
    setItems((current) =>
      current.map((row) => (row.id === id ? { ...row, unread: false } : row)),
    );
    if (typeof unreadCount === "number") publishAuthorUnreadCount(unreadCount);
  }, []);

  async function markAll() {
    setMarkingAll(true);
    try {
      const response = await fetch("/api/author/listener-comments", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const payload = (await response.json()) as { unreadCount?: number };
      if (!response.ok) return;
      setItems((current) => current.map((item) => ({ ...item, unread: false })));
      publishAuthorUnreadCount(typeof payload.unreadCount === "number" ? payload.unreadCount : 0);
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <div data-author-listener-feedback="true" data-author-comments="true">
      <div className="flex flex-wrap items-center gap-2">
        {authors.length > 1 ? (
          <label className="text-sm text-[#5c4d82]">
            Проект
            <select
              className="ml-2 min-h-11 rounded-full border border-[#e4d7f4] bg-white px-3"
              value={authorId}
              data-author-comments-project="true"
              onChange={(event) => {
                setLoading(true);
                setAuthorId(event.target.value);
              }}
            >
              <option value="">{AUTHOR_COMMENTS_ALL_PROJECTS}</option>
              {authors.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <FilterButton active={filter === "all"} onClick={() => chooseFilter(setFilter, setLoading, "all")}>
          {AUTHOR_COMMENTS_FILTER_ALL}
        </FilterButton>
        <FilterButton active={filter === "new"} onClick={() => chooseFilter(setFilter, setLoading, "new")}>
          {AUTHOR_COMMENTS_FILTER_NEW}
        </FilterButton>
        <FilterButton
          active={filter === "unanswered"}
          onClick={() => chooseFilter(setFilter, setLoading, "unanswered")}
        >
          {AUTHOR_COMMENTS_FILTER_UNANSWERED}
        </FilterButton>
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
        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-full border border-[#e4d7f4] bg-white px-4 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
          data-author-comments-mark-all="true"
          disabled={markingAll}
          onClick={() => void markAll()}
        >
          {AUTHOR_COMMENTS_MARK_ALL}
        </button>
      </div>
      {error ? (
        <div className="mt-4" data-author-feedback-error="true">
          <p className="text-sm text-[#9a3d55]">Не удалось загрузить комментарии.</p>
          <button
            type="button"
            className="mt-2 min-h-11 text-sm font-semibold text-[#7042c5]"
            onClick={() => {
              setLoading(true);
              setError(false);
              void fetch(listUrl(authorId, filter, sort, null), { credentials: "same-origin" })
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
          {AUTHOR_COMMENTS_EMPTY}
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <FeedbackCard
            key={item.id}
            item={item}
            onUpdated={(next) => setItems((current) => current.map((row) => (row.id === next.id ? next : row)))}
            onViewed={markViewed}
          />
        ))}
      </ul>
      {cursor ? (
        <button
          type="button"
          className="mt-4 min-h-11 text-sm font-semibold text-[#7042c5]"
          data-author-comments-more="true"
          onClick={() => {
            setLoading(true);
            void fetch(listUrl(authorId, filter, sort, cursor), { credentials: "same-origin" })
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
          {LISTENER_IMPRESSION_LOAD_MORE}
        </button>
      ) : null}
      {loading ? <p className="mt-3 text-sm text-[#7d70a2]">Загрузка…</p> : null}
    </div>
  );
}

function listUrl(authorId: string, filter: Filter, sort: "new" | "old", cursor: string | null): string {
  const params = new URLSearchParams({ filter, sort, limit: "10" });
  if (authorId) params.set("authorId", authorId);
  if (cursor) params.set("cursor", cursor);
  return `/api/author/listener-comments?${params}`;
}

function chooseFilter(
  setFilter: (filter: Filter) => void,
  setLoading: (loading: boolean) => void,
  filter: Filter,
) {
  setLoading(true);
  setFilter(filter);
}

function FeedbackCard({
  item,
  onUpdated,
  onViewed,
}: {
  item: Item;
  onUpdated: (item: Item) => void;
  onViewed: (id: string, unreadCount: number | null) => void;
}) {
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const cardRef = useRef<HTMLLIElement>(null);
  const parsed = parsePracticePublicPath(item.practiceHref);
  const slug = item.authorSlug || parsed?.authorSlug || "";
  const product = item.productSlug || parsed?.productSlug || "";

  useEffect(() => {
    const node = cardRef.current;
    const noticeId = item.noticeId;
    if (!node || !item.unread || !noticeId) return;
    let sent = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (sent || !entries.some((entry) => entry.isIntersecting)) return;
        sent = true;
        void fetch("/api/author/listener-comments", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ noticeIds: [noticeId] }),
        })
          .then(async (response) => {
            if (!response.ok) {
              sent = false;
              return null;
            }
            return (await response.json()) as { unreadCount?: number };
          })
          .then((payload) => {
            if (!payload) return;
            observer.disconnect();
            onViewed(
              item.id,
              typeof payload.unreadCount === "number" ? payload.unreadCount : null,
            );
          })
          .catch(() => {
            sent = false;
          });
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [item.id, item.noticeId, item.unread, onViewed]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!slug || !product) return;
    setPending(true);
    setMessage(null);
    const clientRequestId = crypto.randomUUID();
    try {
      const response = await fetch(
        `/api/listen/product/${encodeURIComponent(slug)}/${encodeURIComponent(product)}/comments/${item.id}/reply`,
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

  return (
    <li
      ref={cardRef}
      className={`rounded-[22px] border px-4 py-4 ${
        item.unread ? "border-[#7042c5] bg-[#f7f3fc]" : "border-[#eadff8] bg-white"
      }`}
      data-author-comment-unread={item.unread ? "true" : "false"}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-[#7042c5]">
        {item.unread ? AUTHOR_COMMENTS_NEW_LABEL : "Комментарий"}
      </p>
      <p className="mt-1 text-sm font-semibold text-[#2b2144]">
        {item.authorName} – {item.practiceTitle}
      </p>
      <a className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-[#7042c5] underline" href={item.practiceHref}>
        {AUTHOR_COMMENTS_OPEN}
      </a>
      <div className="mt-2 flex items-center gap-3">
        <ListenerImpressionAvatar name={item.publicName} url={item.avatarUrl} />
        <p className="text-sm text-[#6d628c]">
          {item.publicName} · {formatWhen(item.createdAt)}
        </p>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p>
      {item.reply ? (
        <div className="mt-3 flex gap-3 rounded-[16px] bg-[#f7f3fc] px-3 py-3" data-author-comment-reply="true">
          <ListenerImpressionAvatar name={item.reply.publicName} url={item.reply.avatarUrl} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#7042c5]">{LISTENER_IMPRESSION_AUTHOR_REPLY_LABEL}</p>
            <p className="mt-1 text-sm font-semibold">{item.reply.publicName}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{item.reply.body}</p>
          </div>
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
      {message ? <p className="mt-2 text-sm text-[#9a3d55]">{message}</p> : null}
    </li>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button type="button" className={sortButton(active)} data-author-comments-filter={children} onClick={onClick}>
      {children}
    </button>
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
