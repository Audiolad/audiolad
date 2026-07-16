import type { AdminRecentActivityItem } from "@/lib/admin/analytics-queries";

function formatActivityLabel(item: AdminRecentActivityItem): string {
  switch (item.kind) {
    case "registration":
      return "Новый пользователь зарегистрировался";
    case "author_application":
      return "Отправлена заявка автора";
    case "audio_play":
      return item.practiceTitle
        ? `Практика получила запуск: ${item.practiceTitle}`
        : "Практика получила запуск";
    case "audio_completed":
      return item.practiceTitle
        ? `Практика была дослушана: ${item.practiceTitle}`
        : "Практика была дослушана";
    default:
      return "Событие";
  }
}

export default function AdminRecentActivityList({
  items,
}: {
  items: AdminRecentActivityItem[];
}) {
  return (
    <section
      aria-labelledby="admin-recent-activity-heading"
      className="rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-sm"
    >
      <h3
        id="admin-recent-activity-heading"
        className="text-lg font-semibold text-[#25135c]"
      >
        Недавняя активность
      </h3>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-[#9485b4]">Событий за период пока нет.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-[#f3ecfb] px-4 py-3 text-sm"
            >
              <p className="font-medium text-[#25135c]">{formatActivityLabel(item)}</p>
              <p className="mt-1 text-xs text-[#9485b4]">
                {new Intl.DateTimeFormat("ru-RU", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/Moscow",
                }).format(new Date(item.occurredAt))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
