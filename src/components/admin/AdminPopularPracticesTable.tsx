import type { AdminPopularPracticeRow } from "@/lib/admin/analytics-queries";

export default function AdminPopularPracticesTable({
  rows,
}: {
  rows: AdminPopularPracticeRow[];
}) {
  return (
    <section
      aria-labelledby="admin-popular-practices-heading"
      className="rounded-[22px] border border-[#eadff8] bg-white p-5 shadow-sm"
    >
      <h3
        id="admin-popular-practices-heading"
        className="text-lg font-semibold text-[#25135c]"
      >
        Что слушают
      </h3>
      <p className="mt-1 text-sm text-[#796ba0]">
        Топ-10 практик по запускам за выбранный период.
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[#9485b4]">Пока нет данных о прослушиваниях.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#eadff8] text-[#796ba0]">
                <th className="px-2 py-2 font-medium">Практика</th>
                <th className="px-2 py-2 font-medium">Автор</th>
                <th className="px-2 py-2 font-medium">Просмотры</th>
                <th className="px-2 py-2 font-medium">Запуски</th>
                <th className="px-2 py-2 font-medium">Слушатели</th>
                <th className="px-2 py-2 font-medium">Дослушивания</th>
                <th className="px-2 py-2 font-medium">% дослуш.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.practiceId} className="border-b border-[#f3ecfb]">
                  <td className="px-2 py-3 font-medium text-[#25135c]">{row.title}</td>
                  <td className="px-2 py-3">{row.authorName}</td>
                  <td className="px-2 py-3">{row.views.toLocaleString("ru-RU")}</td>
                  <td className="px-2 py-3">{row.playStarts.toLocaleString("ru-RU")}</td>
                  <td className="px-2 py-3">{row.uniqueListeners.toLocaleString("ru-RU")}</td>
                  <td className="px-2 py-3">{row.completions.toLocaleString("ru-RU")}</td>
                  <td className="px-2 py-3">{row.completionRate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
