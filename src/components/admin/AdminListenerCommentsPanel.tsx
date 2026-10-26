"use client";

import { useEffect, useState } from "react";

import {
  ADMIN_LISTENER_COMMENTS_SUBTITLE,
  ADMIN_LISTENER_COMMENTS_TITLE,
  LISTENER_IMPRESSION_LOAD_MORE,
  MODERATION_ACTION_LABELS,
  REPORT_REASON_LABELS,
} from "@/lib/practice-comments/copy";

type Queue = "reports" | "hidden";

type Item = {
  id: string;
  practiceTitle: string;
  publicName: string;
  body: string;
  status: "published" | "hidden";
  kind: "impression" | "author_reply";
  createdAt: string;
  reports: Array<{ reason: keyof typeof REPORT_REASON_LABELS; createdAt: string }>;
  journal: Array<{ action: string; reason: string | null; createdAt: string }>;
};

type Page = {
  items: Item[];
  nextCursor: string | null;
};

function queueUrl(queue: Queue, cursor: string | null): string {
  const params = new URLSearchParams({ queue, limit: "20" });
  if (cursor) params.set("cursor", cursor);
  return `/api/admin/listener-comments?${params}`;
}

function journalText(value: string | null): string {
  if (!value) return "без причины";
  if (value in REPORT_REASON_LABELS) {
    return REPORT_REASON_LABELS[value as keyof typeof REPORT_REASON_LABELS];
  }
  if (value in MODERATION_ACTION_LABELS) {
    return MODERATION_ACTION_LABELS[value as keyof typeof MODERATION_ACTION_LABELS];
  }
  return value;
}

export default function AdminListenerCommentsPanel() {
  const [queue, setQueue] = useState<Queue>("reports");
  const [items, setItems] = useState<Item[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function applyPage(payload: Page, append: boolean) {
    setItems((current) => (append ? [...current, ...payload.items] : payload.items));
    setNextCursor(payload.nextCursor);
    setError(false);
    setLoading(false);
  }

  function selectQueue(next: Queue) {
    if (next === queue) return;
    setLoading(true);
    setItems([]);
    setNextCursor(null);
    setError(false);
    setQueue(next);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(queueUrl(queue, null), {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("load_failed");
        return (await response.json()) as Page;
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
  }, [queue]);

  async function hide(id: string) {
    setPendingId(id);
    try {
      const response = await fetch(`/api/admin/listener-comments/${id}/hide`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "spam" }),
      });
      if (!response.ok) throw new Error("action_failed");
      const refreshed = await fetch(queueUrl(queue, null), { credentials: "same-origin" });
      if (!refreshed.ok) throw new Error("load_failed");
      applyPage((await refreshed.json()) as Page, false);
    } catch {
      setError(true);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section aria-labelledby="admin-listener-comments-heading" data-admin-listener-comments="true">
      <h2 id="admin-listener-comments-heading" className="text-[21px] font-semibold">
        {ADMIN_LISTENER_COMMENTS_TITLE}
      </h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#796ba0]">{ADMIN_LISTENER_COMMENTS_SUBTITLE}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={tab(queue === "reports")} onClick={() => selectQueue("reports")}>
          Жалобы
        </button>
        <button type="button" className={tab(queue === "hidden")} onClick={() => selectQueue("hidden")}>
          Скрытые
        </button>
      </div>
      {error ? (
        <p className="mt-4 text-sm text-[#9a3d55]" data-admin-listener-comments-error="true">
          Не удалось загрузить очередь.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => {
              setLoading(true);
              setError(false);
              void fetch(queueUrl(queue, null), { credentials: "same-origin" })
                .then(async (response) => {
                  if (!response.ok) throw new Error("load_failed");
                  return (await response.json()) as Page;
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
        </p>
      ) : null}
      {!loading && !error && items.length === 0 ? (
        <p className="mt-4 text-sm text-[#796ba0]" data-admin-listener-comments-empty="true">
          В этой очереди пусто.
        </p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.id} className="rounded-[22px] border border-[#eadff8] bg-white px-4 py-4">
            <p className="text-sm font-semibold">{item.practiceTitle}</p>
            <p className="mt-1 text-xs text-[#796ba0]">
              {item.publicName} – {item.kind === "author_reply" ? "ответ автора" : "отзыв"} – {item.createdAt}
            </p>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p>
            {item.reports.length > 0 ? (
              <p className="mt-2 text-sm text-[#6d628c]">
                Жалобы: {item.reports.map((report) => REPORT_REASON_LABELS[report.reason] ?? report.reason).join(", ")}
              </p>
            ) : null}
            {item.journal.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-[#6d628c]">
                {item.journal.map((event, index) => (
                  <li key={`${item.id}-${index}`}>
                    {journalText(event.action)} – {journalText(event.reason)} – {event.createdAt}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {item.status === "published" ? (
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-[#7042c5] px-4 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={pendingId === item.id}
                  onClick={() => void hide(item.id)}
                >
                  Скрыть как спам
                </button>
              ) : (
                <p className="text-sm text-[#6d628c]">Скрыто</p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {nextCursor ? (
        <button
          type="button"
          className="mt-4 min-h-11 text-sm font-semibold text-[#7042c5]"
          data-admin-listener-comments-more="true"
          onClick={() => {
            const cursor = nextCursor;
            setLoading(true);
            void fetch(queueUrl(queue, cursor), { credentials: "same-origin" })
              .then(async (response) => {
                if (!response.ok) throw new Error("load_failed");
                return (await response.json()) as Page;
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
      {loading ? <p className="mt-3 text-sm text-[#796ba0]">Загрузка…</p> : null}
    </section>
  );
}

function tab(active: boolean): string {
  return `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${
    active ? "bg-[#7042c5] text-white" : "border border-[#e4d7f4] bg-white text-[#7042c5]"
  }`;
}
