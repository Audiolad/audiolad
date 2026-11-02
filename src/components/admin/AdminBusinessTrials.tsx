import {
  BUSINESS_TRIAL_ACCOUNT_LABELS,
  BUSINESS_TRIAL_FIRST_PLAY_LABELS,
  BUSINESS_TRIAL_NO_DATA,
  BUSINESS_TRIAL_START_HOST_LABELS,
  BUSINESS_TRIAL_STATUS_LABELS,
  type BusinessTrialStats,
  type BusinessTrialStatus,
} from "@/lib/admin/business-trials";
import { ruDaysWord } from "@/lib/access-grants/policy";

/** Pure view of «Подарочная неделя» so it can be rendered in unit tests. */

const EMPTY = "–";

export function formatBusinessTrialMoscow(value: string | null): string {
  if (!value) return EMPTY;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return EMPTY;
  return `${new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)} МСК`;
}

const STATUS_CLASS: Record<BusinessTrialStatus, string> = {
  trial: "bg-[#e7f6ec] text-[#1f7a3d]",
  grace: "bg-[#fff1d6] text-[#8a5a12]",
  paid: "bg-[#ede4fb] text-[#7042c5]",
  closed: "bg-[#f1eff5] text-[#6b6480]",
};

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#796ba0]">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#2b2140]" data-trial-total={label}>
        {value.toLocaleString("ru-RU")}
      </p>
    </div>
  );
}

function NoData() {
  return <span className="text-[#9a8fb8]">{BUSINESS_TRIAL_NO_DATA}</span>;
}

export default function AdminBusinessTrials({ data }: { data: BusinessTrialStats }) {
  const { totals, rows } = data;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Total label="Начали" value={totals.started} />
        <Total label="Сейчас в подарке" value={totals.trial} />
        <Total label="Льготный период" value={totals.grace} />
        <Total label="Оплатили" value={totals.paid} />
        <Total label="Закрыто" value={totals.closed} />
      </div>
      <p className="text-sm text-[#796ba0]">
        Гостей: {totals.guests.toLocaleString("ru-RU")}, зарегистрированных: {totals.registered.toLocaleString("ru-RU")}.
        {" "}Включали музыку (видно по данным): {totals.firstPlayYes.toLocaleString("ru-RU")}.
        {" "}
        {totals.activeEnough === null
          ? `Слушали не меньше ${data.activeMinutes} минут: ${BUSINESS_TRIAL_NO_DATA}.`
          : `Слушали не меньше ${data.activeMinutes} минут: ${totals.activeEnough.toLocaleString("ru-RU")}.`}
        {" "}Обновлено: {formatBusinessTrialMoscow(data.generatedAt)}.
      </p>
      {!data.activityEnabled ? (
        <p className="text-xs text-[#9a8fb8]" data-trial-activity-off>
          Минуты, дни с музыкой и заходы в кабинет начнут считаться после включения записи. До этого в колонках «{BUSINESS_TRIAL_NO_DATA}».
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-[22px] border border-[#e4d7f4] bg-white p-5 text-sm text-[#796ba0]">
          Пока никто не начинал подарочную неделю.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[22px] border border-[#e4d7f4] bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#faf7ff] text-xs uppercase tracking-wide text-[#796ba0]">
              <tr>
                <th className="px-4 py-3">Заведение</th>
                <th className="px-4 py-3">Аккаунт</th>
                <th className="px-4 py-3">Начало</th>
                <th className="px-4 py-3">Осталось</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Первое включение</th>
                <th className="px-4 py-3">Последняя активность плеера</th>
                <th className="px-4 py-3">Минуты музыки</th>
                <th className="px-4 py-3">Дни с музыкой</th>
                <th className="px-4 py-3">Заходы в кабинет</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId} className="border-t border-[#f0e9fa] align-top" data-trial-row={row.shortId}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#2b2140]">{row.title}</p>
                    <p className="text-xs text-[#9a8fb8]">id {row.shortId}</p>
                  </td>
                  <td className="px-4 py-3">
                    {BUSINESS_TRIAL_ACCOUNT_LABELS[row.account]}
                    {row.startHost ? (
                      <span className="block text-xs text-[#9a8fb8]">старт: {BUSINESS_TRIAL_START_HOST_LABELS[row.startHost]}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatBusinessTrialMoscow(row.startsAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums">
                    {row.status === "closed" ? EMPTY : `${row.daysLeft} ${ruDaysWord(row.daysLeft)}`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[row.status]}`}>
                      {BUSINESS_TRIAL_STATUS_LABELS[row.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">{BUSINESS_TRIAL_FIRST_PLAY_LABELS[row.firstPlay]}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{formatBusinessTrialMoscow(row.lastActivityAt)}</td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums" data-trial-cell="minutes">
                    {row.activity ? row.activity.listenedMinutes.toLocaleString("ru-RU") : <NoData />}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums" data-trial-cell="music-days">
                    {row.activity ? row.activity.musicDays.toLocaleString("ru-RU") : <NoData />}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums" data-trial-cell="visits">
                    {row.activity ? row.activity.cabinetVisits.toLocaleString("ru-RU") : <NoData />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
