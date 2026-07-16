import type { AdminAnalyticsSourceRow } from "@/lib/admin/analytics-queries";

export default function AdminAnalyticsSourcesTable({
  rows,
}: {
  rows: AdminAnalyticsSourceRow[];
}) {
  return (
    <section
      aria-labelledby="admin-analytics-sources-heading"
      className="rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-sm"
    >
      <h3
        id="admin-analytics-sources-heading"
        className="text-lg font-semibold text-[#25135c]"
      >
        Источники
      </h3>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#eadff8] text-[#796ba0]">
              <th className="px-2 py-2 font-medium">Источник</th>
              <th className="px-2 py-2 font-medium">Уникальные посетители</th>
              <th className="px-2 py-2 font-medium">Регистрации</th>
              <th className="px-2 py-2 font-medium">Запуски</th>
              <th className="px-2 py-2 font-medium">Дослушивания</th>
              <th className="px-2 py-2 font-medium">Заявки</th>
              <th className="px-2 py-2 font-medium">Посетитель → рег.</th>
              <th className="px-2 py-2 font-medium">Посетитель → запуск</th>
              <th className="px-2 py-2 font-medium">Запуск → дослуш.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.source} className="border-b border-[#f3ecfb]">
                <td className="px-2 py-3 font-medium text-[#25135c]">{row.label}</td>
                <td className="px-2 py-3">{row.visitors.toLocaleString("ru-RU")}</td>
                <td className="px-2 py-3">{row.registrations.toLocaleString("ru-RU")}</td>
                <td className="px-2 py-3">{row.playStarts.toLocaleString("ru-RU")}</td>
                <td className="px-2 py-3">{row.completions.toLocaleString("ru-RU")}</td>
                <td className="px-2 py-3">{row.applications.toLocaleString("ru-RU")}</td>
                <td className="px-2 py-3">{row.registrationRate}</td>
                <td className="px-2 py-3">{row.playRate}</td>
                <td className="px-2 py-3">{row.completionRate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
