"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  useGlobalAudioPlayer,
  useOptionalPlayerEngine,
} from "@/components/audio/GlobalAudioPlayerProvider";
import ListenerImpressionInvite from "@/components/products/practice-page/ListenerImpressionInvite";
import { buildAuthRouteHref } from "@/lib/auth/routes";
import { isCatalogGlobalPlayerSession } from "@/lib/listen/global-player-types";
import {
  LISTENER_IMPRESSION_AUTHOR_REPLY_LABEL,
  LISTENER_IMPRESSION_CANCEL,
  LISTENER_IMPRESSION_DELETE,
  LISTENER_IMPRESSION_EDIT,
  LISTENER_IMPRESSION_EMPTY,
  LISTENER_IMPRESSION_ERROR,
  LISTENER_IMPRESSION_HIDDEN,
  LISTENER_IMPRESSION_LOAD_MORE,
  LISTENER_IMPRESSION_NAME_LABEL,
  LISTENER_IMPRESSION_PLACEHOLDER,
  LISTENER_IMPRESSION_PRIVACY,
  LISTENER_IMPRESSION_REPLY_ACTION,
  LISTENER_IMPRESSION_REPORT,
  LISTENER_IMPRESSION_RETRY,
  LISTENER_IMPRESSION_SAVE,
  LISTENER_IMPRESSION_SAVING,
  LISTENER_IMPRESSION_SIGN_IN,
  LISTENER_IMPRESSION_SORT_NEW,
  LISTENER_IMPRESSION_SORT_OLD,
  LISTENER_IMPRESSION_SUBMIT,
  LISTENER_IMPRESSIONS_TITLE,
  REPORT_REASON_LABELS,
} from "@/lib/practice-comments/copy";
import type { PublicCommentDto } from "@/lib/practice-comments/types";

type Sort = "new" | "old";

type FeedResponse = {
  comments: PublicCommentDto[];
  nextCursor: string | null;
  viewer: {
    authenticated: boolean;
    canComment: boolean;
    canReply: boolean;
    publicNameSuggestion: string;
  };
};

const fieldClass =
  "mt-2 w-full rounded-[16px] border border-[#e4d7f4] bg-white px-3 py-3 text-base text-[#2b2144] outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]";

const buttonClass =
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold";

function commentsUrl(authorSlug: string, productSlug: string): string {
  return `/api/listen/product/${encodeURIComponent(authorSlug)}/${encodeURIComponent(productSlug)}/comments`;
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

export default function PracticeComments({
  authorSlug,
  productSlug,
  practiceId,
  isAuthenticated,
  signInReturnPath,
}: {
  authorSlug: string;
  productSlug: string;
  practiceId: string;
  isAuthenticated: boolean;
  signInReturnPath: string;
}) {
  const { session, activeQueue } = useGlobalAudioPlayer();
  const engine = useOptionalPlayerEngine();
  const [sort, setSort] = useState<Sort>("new");
  const [comments, setComments] = useState<PublicCommentDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [viewer, setViewer] = useState<FeedResponse["viewer"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [body, setBody] = useState("");
  const [publicName, setPublicName] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const suggestionApplied = useRef(false);

  const showInvite = Boolean(
    engine?.programCompleted &&
      !activeQueue &&
      session &&
      isCatalogGlobalPlayerSession(session) &&
      session.practiceId === practiceId,
  );

  function applyFeed(payload: FeedResponse, append: boolean) {
    setComments((current) => (append ? [...current, ...payload.comments] : payload.comments));
    setCursor(payload.nextCursor);
    setViewer(payload.viewer);
    setError(false);
    setLoading(false);
    if (!append && !suggestionApplied.current && payload.viewer.publicNameSuggestion) {
      suggestionApplied.current = true;
      setPublicName(payload.viewer.publicNameSuggestion);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ sort, limit: "10" });
    fetch(`${commentsUrl(authorSlug, productSlug)}?${params}`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("load_failed");
        return (await response.json()) as FeedResponse;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        applyFeed(payload, false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [authorSlug, productSlug, sort]);

  async function submitComment(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setFormError(null);
    const clientRequestId = crypto.randomUUID();
    try {
      const response = await fetch(commentsUrl(authorSlug, productSlug), {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "idempotency-key": clientRequestId,
        },
        body: JSON.stringify({ body, publicName, clientRequestId }),
      });
      const payload = (await response.json()) as { error?: string; comment?: PublicCommentDto };
      if (!response.ok || !payload.comment) {
        setFormError(payload.error ?? "internal_error");
        return;
      }
      setBody("");
      setComments((current) => [payload.comment!, ...current.filter((item) => item.id !== payload.comment!.id)]);
    } catch {
      setFormError("internal_error");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      id="listener-impressions"
      className="mt-8 scroll-mt-24"
      aria-labelledby="listener-impressions-title"
      data-listener-comments="true"
    >
      <h2 id="listener-impressions-title" className="text-[22px] font-semibold text-[#2b2144]">
        {LISTENER_IMPRESSIONS_TITLE}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[#6d628c]">{LISTENER_IMPRESSION_PRIVACY}</p>
      {showInvite ? (
        <div className="mt-4">
          <ListenerImpressionInvite
            href="#listener-impressions"
            practiceId={practiceId}
            tone="light"
          />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Порядок отзывов">
        <SortButton
          active={sort === "new"}
          onClick={() => {
            setLoading(true);
            setSort("new");
          }}
        >
          {LISTENER_IMPRESSION_SORT_NEW}
        </SortButton>
        <SortButton
          active={sort === "old"}
          onClick={() => {
            setLoading(true);
            setSort("old");
          }}
        >
          {LISTENER_IMPRESSION_SORT_OLD}
        </SortButton>
      </div>

      {viewer?.canComment ? (
        <form className="mt-4" onSubmit={(event) => void submitComment(event)}>
          <label className="block text-sm font-medium text-[#2b2144]" htmlFor="listener-impression-name">
            {LISTENER_IMPRESSION_NAME_LABEL}
            <input
              id="listener-impression-name"
              className={fieldClass}
              value={publicName}
              maxLength={40}
              onChange={(event) => setPublicName(event.target.value)}
              autoComplete="nickname"
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-[#2b2144]" htmlFor="listener-impression-body">
            Ваше впечатление
            <textarea
              id="listener-impression-body"
              className={`${fieldClass} min-h-28`}
              value={body}
              maxLength={2000}
              placeholder={LISTENER_IMPRESSION_PLACEHOLDER}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          {formError ? (
            <p className="mt-2 text-sm text-[#9a3d55]" role="alert">
              {formError === "unauthorized" ? (
                <>
                  Войдите, чтобы оставить отзыв.{" "}
                  <a
                    className="font-semibold underline"
                    href={buildAuthRouteHref("/auth/sign-in", signInReturnPath)}
                  >
                    Войти
                  </a>
                </>
              ) : (
                messageFor(formError)
              )}
            </p>
          ) : null}
          <button
            type="submit"
            className={`${buttonClass} mt-3 bg-[#7042c5] text-white disabled:opacity-60`}
            disabled={pending || body.trim().length < 2}
          >
            {pending ? LISTENER_IMPRESSION_SAVING : LISTENER_IMPRESSION_SUBMIT}
          </button>
        </form>
      ) : !isAuthenticated && !loading ? (
        <p className="mt-4 text-sm leading-6 text-[#6d628c]">
          {LISTENER_IMPRESSION_SIGN_IN}{" "}
          <a
            className="font-semibold text-[#7042c5] underline"
            href={buildAuthRouteHref("/auth/sign-in", signInReturnPath)}
          >
            Войти
          </a>
        </p>
      ) : null}

      {error ? (
        <div className="mt-4" data-listener-comments-error="true">
          <p className="text-sm text-[#9a3d55]">{LISTENER_IMPRESSION_ERROR}</p>
          <button
            type="button"
            className={`${buttonClass} mt-2 border border-[#e4d7f4] text-[#7042c5]`}
            onClick={() => {
              setLoading(true);
              setError(false);
              const params = new URLSearchParams({ sort, limit: "10" });
              void fetch(`${commentsUrl(authorSlug, productSlug)}?${params}`, {
                credentials: "same-origin",
              })
                .then(async (response) => {
                  if (!response.ok) throw new Error("load_failed");
                  return (await response.json()) as FeedResponse;
                })
                .then((payload) => applyFeed(payload, false))
                .catch(() => {
                  setError(true);
                  setLoading(false);
                });
            }}
          >
            {LISTENER_IMPRESSION_RETRY}
          </button>
        </div>
      ) : null}

      {!error && !loading && comments.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-[#6d628c]" data-listener-comments-empty="true">
          {LISTENER_IMPRESSION_EMPTY}
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {comments.map((comment) => (
          <li
            key={comment.id}
            className="rounded-[22px] border border-[#eadff8] bg-white px-4 py-4"
          >
            <CommentCard
              comment={comment}
              authorSlug={authorSlug}
              productSlug={productSlug}
              canReply={Boolean(viewer?.canReply)}
              editing={editingId === comment.id}
              reporting={reportId === comment.id}
              onEdit={() => setEditingId(comment.id)}
              onCancelEdit={() => setEditingId(null)}
              onReport={() => setReportId(reportId === comment.id ? null : comment.id)}
              onChanged={(next) => {
                setComments((current) =>
                  next
                    ? current.map((item) => (item.id === next.id ? next : item))
                    : current.filter((item) => item.id !== comment.id),
                );
                setEditingId(null);
              }}
            />
          </li>
        ))}
      </ul>

      {cursor ? (
        <button
          type="button"
          className={`${buttonClass} mt-4 border border-[#e4d7f4] text-[#7042c5]`}
          disabled={loading}
          onClick={() => {
            setLoading(true);
            const params = new URLSearchParams({ sort, limit: "10", cursor });
            void fetch(`${commentsUrl(authorSlug, productSlug)}?${params}`, {
              credentials: "same-origin",
            })
              .then(async (response) => {
                if (!response.ok) throw new Error("load_failed");
                return (await response.json()) as FeedResponse;
              })
              .then((payload) => applyFeed(payload, true))
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
    </section>
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`${buttonClass} ${active ? "bg-[#7042c5] text-white" : "border border-[#e4d7f4] bg-white text-[#7042c5]"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function CommentCard({
  comment,
  authorSlug,
  productSlug,
  canReply,
  editing,
  reporting,
  onEdit,
  onCancelEdit,
  onReport,
  onChanged,
}: {
  comment: PublicCommentDto;
  authorSlug: string;
  productSlug: string;
  canReply: boolean;
  editing: boolean;
  reporting: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onReport: () => void;
  onChanged: (next: PublicCommentDto | null) => void;
}) {
  const [draft, setDraft] = useState(comment.body);
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reason, setReason] = useState<keyof typeof REPORT_REASON_LABELS>("spam");
  const base = `${commentsUrl(authorSlug, productSlug)}/${comment.id}`;

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(base, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      const payload = (await response.json()) as { error?: string; comment?: PublicCommentDto };
      if (!response.ok || !payload.comment) {
        setMessage(messageFor(payload.error));
        return;
      }
      onChanged(payload.comment);
    } catch {
      setMessage(messageFor("internal_error"));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (pending || !window.confirm("Удалить отзыв?")) return;
    setPending(true);
    try {
      const response = await fetch(base, { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setMessage(messageFor(payload.error));
        return;
      }
      onChanged(null);
    } catch {
      setMessage(messageFor("internal_error"));
    } finally {
      setPending(false);
    }
  }

  async function sendReply(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const clientRequestId = crypto.randomUUID();
    try {
      const response = await fetch(`${base}/reply`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "idempotency-key": clientRequestId,
        },
        body: JSON.stringify({ body: reply, clientRequestId }),
      });
      const payload = (await response.json()) as { error?: string; comment?: PublicCommentDto };
      if (!response.ok || !payload.comment) {
        setMessage(messageFor(payload.error));
        return;
      }
      setReply("");
      onChanged(payload.comment);
    } catch {
      setMessage(messageFor("internal_error"));
    } finally {
      setPending(false);
    }
  }

  async function sendReport(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`${base}/report`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(messageFor(payload.error));
        return;
      }
      setMessage("Жалоба отправлена.");
      onReport();
    } catch {
      setMessage(messageFor("internal_error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <article>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-[#2b2144]">{comment.publicName}</p>
        <time className="text-xs text-[#7d70a2]" dateTime={comment.createdAt}>
          {formatWhen(comment.createdAt)}
          {comment.editedAt ? " · изменён" : ""}
        </time>
      </header>
      {comment.status === "hidden" ? (
        <p className="mt-2 text-sm text-[#9a3d55]">{LISTENER_IMPRESSION_HIDDEN}</p>
      ) : null}
      {editing ? (
        <form className="mt-2" onSubmit={(event) => void saveEdit(event)}>
          <textarea className={`${fieldClass} min-h-24`} value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} />
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="submit" className={`${buttonClass} bg-[#7042c5] text-white`} disabled={pending}>
              {LISTENER_IMPRESSION_SAVE}
            </button>
            <button type="button" className={`${buttonClass} border border-[#e4d7f4] text-[#7042c5]`} onClick={onCancelEdit}>
              {LISTENER_IMPRESSION_CANCEL}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#2b2144]">{comment.body}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {comment.mine && comment.status === "published" ? (
          <button type="button" className={`${buttonClass} border border-[#e4d7f4] text-[#7042c5]`} onClick={onEdit}>
            {LISTENER_IMPRESSION_EDIT}
          </button>
        ) : null}
        {comment.mine ? (
          <button type="button" className={`${buttonClass} border border-[#e4d7f4] text-[#7042c5]`} disabled={pending} onClick={() => void remove()}>
            {LISTENER_IMPRESSION_DELETE}
          </button>
        ) : null}
        {!comment.mine && comment.status === "published" ? (
          <button type="button" className={`${buttonClass} border border-[#e4d7f4] text-[#7042c5]`} onClick={onReport}>
            {LISTENER_IMPRESSION_REPORT}
          </button>
        ) : null}
      </div>
      {reporting ? (
        <form className="mt-3" onSubmit={(event) => void sendReport(event)}>
          <label className="block text-sm text-[#2b2144]">
            Причина
            <select className={fieldClass} value={reason} onChange={(event) => setReason(event.target.value as keyof typeof REPORT_REASON_LABELS)}>
              {Object.entries(REPORT_REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={`${buttonClass} mt-2 bg-[#7042c5] text-white`} disabled={pending}>
            Отправить жалобу
          </button>
        </form>
      ) : null}
      {comment.reply ? (
        <div className="mt-3 rounded-[16px] bg-[#f7f3fc] px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#7042c5]">
            {LISTENER_IMPRESSION_AUTHOR_REPLY_LABEL}
          </p>
          <p className="mt-1 text-sm font-semibold">{comment.reply.publicName}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{comment.reply.body}</p>
        </div>
      ) : null}
      {canReply && !comment.reply && comment.status === "published" ? (
        <form className="mt-3" onSubmit={(event) => void sendReply(event)}>
          <label className="block text-sm font-medium text-[#2b2144]">
            {LISTENER_IMPRESSION_REPLY_ACTION}
            <textarea className={`${fieldClass} min-h-20`} value={reply} maxLength={2000} onChange={(event) => setReply(event.target.value)} />
          </label>
          <button type="submit" className={`${buttonClass} mt-2 bg-[#7042c5] text-white`} disabled={pending || reply.trim().length < 2}>
            {LISTENER_IMPRESSION_REPLY_ACTION}
          </button>
        </form>
      ) : null}
      {message ? <p className="mt-2 text-sm text-[#6d628c]">{message}</p> : null}
    </article>
  );
}

function messageFor(error: string | undefined): string {
  switch (error) {
    case "invalid_body":
      return "Напишите отзыв своими словами, без HTML. От 2 до 2000 символов.";
    case "invalid_public_name":
      return "Укажите имя буквами, без почты и цифр. Не больше двух слов.";
    case "duplicate_comment":
      return "Такой отзыв уже есть. Можно изменить его или написать другое.";
    case "rate_limited":
      return "Слишком много отправок подряд. Попробуйте чуть позже.";
    case "unauthorized":
      return "Войдите, чтобы оставить отзыв.";
    case "comments_unavailable":
      return "Отзывы временно недоступны.";
    default:
      return "Не удалось сохранить. Попробуйте ещё раз.";
  }
}
