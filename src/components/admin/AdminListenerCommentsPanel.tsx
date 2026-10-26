"use client";

import { useEffect, useState } from "react";

import { ADMIN_LISTENER_COMMENTS_SUBTITLE, ADMIN_LISTENER_COMMENTS_TITLE, REPORT_REASON_LABELS } from "@/lib/practice-comments/copy";

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

export default function AdminListenerCommentsPanel() {
  const [queue, setQueue] = useState<Queue>("reports");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  function applyItems(nextItems: Item[]) {
    setItems(nextItems);
    setError(false);
    setLoading(false);
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/listener-comments?queue=${queue}&limit=20`, {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("load_failed");
        return (await response.json()) as { items: Item[] };
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        applyItems(payload.items);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setError(true);
        setLoading(false);
      });
    return () => controller.abort();
  }, [queue]);

  async function act(id: string, action: "hide" | "restore", reason: string) {
    setPendingId(id);
    try {
      const response = await fetch(`/api/admin/listener-comments/${id}/${action}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error("action_failed");
      const refreshed = await fetch(`/api/admin/listener-comments?queue=${queue}&limit=20`, {
        credentials: "same-origin",
      });
      if (!refreshed.ok) throw new Error("load_failed");
      const payload = (await refreshed.json()) as { items: Item[] };
      applyItems(payload.items);
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
        <button
          type="button"
          className={tab(queue === "reports")}
          onClick={() => {
            setLoading(true);
            setQueue("reports");
          }}
        >
          Жалобы
        </button>
        <button
          type="button"
          className={tab(queue === "hidden")}
          onClick={() => {
            setLoading(true);
            setQueue("hidden");
          }}
        >
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
              void fetch(`/api/admin/listener-comments?queue=${queue}&limit=20`, {
                credentials: "same-origin",
              })
                .then(async (response) => {
                  if (!response.ok) throw new Error("load_failed");
                  return (await response.json()) as { items: Item[] };
                })
                .then((payload) => applyItems(payload.items))
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
              {item.publicName} · {item.kind === "author_reply" ? "ответ автора" : "отзыв"} · {item.createdAt}
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
                    {event.action} · {event.reason ?? "без причины"} · {event.createdAt}
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
                  onClick={() => void act(item.id, "hide", "spam")}
                >
                  Скрыть как спам
                </button>
              ) : (
                <button
                  type="button"
                  className="min-h-11 rounded-full border border-[#e4d7f4] px-4 text-sm font-semibold text-[#7042c5] disabled:opacity-60"
                  disabled={pendingId === item.id}
                  onClick={() => void act(item.id, "restore", "restore")}
                >
                  Вернуть
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {loading ? <p className="mt-3 text-sm text-[#796ba0]">Загрузка…</p> : null}
    </section>
  );
}

function tab(active: boolean): string {
  return `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${
    active ? "bg-[#7042c5] text-white" : "border border-[#e4d7f4] bg-white text-[#7042c5]"
  }`;
}
