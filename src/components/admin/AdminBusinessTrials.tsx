import {
  BUSINESS_TRIAL_ACCOUNT_LABELS,
  BUSINESS_TRIAL_CHANNEL_LABELS,
  BUSINESS_TRIAL_DEVICE_LABELS,
  businessTrialConversion,
  BUSINESS_TRIAL_FIRST_PLAY_LABELS,
  BUSINESS_TRIAL_NO_DATA,
  BUSINESS_TRIAL_START_HOST_LABELS,
  BUSINESS_TRIAL_STATUS_LABELS,
  type BusinessTrialFunnel,
  type BusinessTrialOrigin,
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

const OS_LABELS: Record<string, string> = {
  android: "Android",
  ios: "iOS",
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  chromeos: "ChromeOS",
  other: "другая ОС",
};

const BROWSER_LABELS: Record<string, string> = {
  yandex: "Яндекс Браузер",
  chrome: "Chrome",
  safari: "Safari",
  firefox: "Firefox",
  edge: "Edge",
  opera: "Opera",
  samsung: "Samsung Internet",
  max: "браузер МАКС",
  telegram: "браузер Телеграма",
  other: "другой браузер",
};

export function businessTrialPlaceLabel(origin: BusinessTrialOrigin): string | null {
  const parts: string[] = [];
  if (origin.city) parts.push(origin.city);
  if (origin.region && origin.region !== origin.city) parts.push(origin.region);
  if (origin.country && origin.country !== "RU") parts.push(origin.country);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function businessTrialDeviceLabel(origin: BusinessTrialOrigin): string | null {
  const parts = [
    origin.deviceClass ? BUSINESS_TRIAL_DEVICE_LABELS[origin.deviceClass] : null,
    origin.osFamily ? OS_LABELS[origin.osFamily] ?? null : null,
    origin.browserFamily ? BROWSER_LABELS[origin.browserFamily] ?? null : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : null;
}

export function businessTrialSourceLabel(origin: BusinessTrialOrigin): string {
  const parts: string[] = [];
  if (origin.channel) parts.push(`бот ${BUSINESS_TRIAL_CHANNEL_LABELS[origin.channel]}`);
  const utm = [origin.utmSource, origin.utmMedium, origin.utmCampaign].filter(Boolean).join(" / ");
  if (utm) parts.push(`utm: ${utm}`);
  if (origin.referrerDomain) parts.push(`переход с ${origin.referrerDomain}`);
  return parts.length > 0 ? parts.join("; ") : "без метки";
}

function FunnelCell({ value, base }: { value: number | null; base?: number | null }) {
  if (value === null) return <NoData />;
  const rate = base === undefined ? null : businessTrialConversion(base, value);
  return (
    <span className="tabular-nums">
      {value.toLocaleString("ru-RU")}
      {rate !== null ? <span className="ml-1 text-xs text-[#9a8fb8]">({rate}%)</span> : null}
    </span>
  );
}

export function BusinessTrialFunnelBlock({ funnel }: { funnel: BusinessTrialFunnel }) {
  const stages: Array<{ key: string; label: string; value: (c: BusinessTrialFunnel["columns"][number]) => number | null; base?: (c: BusinessTrialFunnel["columns"][number]) => number | null }> = [
    { key: "bot", label: "Подписались на бота", value: (c) => c.botStarts },
    { key: "gift", label: "Нажали ссылку на подарок", value: (c) => c.giftClicks, base: (c) => c.botStarts },
    { key: "start", label: "Начали 7 дней в подарок", value: (c) => (funnel.enabled ? c.started : null), base: (c) => c.giftClicks },
    { key: "paid", label: "Оплатили", value: (c) => (funnel.enabled ? c.paid : null), base: (c) => (funnel.enabled ? c.started : null) },
  ];
  return (
    <div className="rounded-[22px] border border-[#e4d7f4] bg-white" data-trial-funnel>
      <div className="px-4 pt-4">
        <h3 className="text-base font-semibold text-[#2b2140]">Воронка по каналам</h3>
        <p className="mt-1 text-xs text-[#9a8fb8]">
          Бот: данные MAX Поток{funnel.maxPotok ? "" : ` – ${BUSINESS_TRIAL_NO_DATA}`}. Старты и оплаты: гостевые старты с меткой канала. В скобках – доля от предыдущего шага.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="mt-2 min-w-full text-left text-sm">
          <thead className="bg-[#faf7ff] text-xs uppercase tracking-wide text-[#796ba0]">
            <tr>
              <th className="px-4 py-2">Шаг</th>
              {funnel.columns.map((c) => (
                <th key={c.channel} className="px-4 py-2">{BUSINESS_TRIAL_CHANNEL_LABELS[c.channel]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => (
              <tr key={stage.key} className="border-t border-[#f0e9fa]" data-trial-funnel-stage={stage.key}>
                <td className="px-4 py-2 text-[#2b2140]">{stage.label}</td>
                {funnel.columns.map((c) => (
                  <td key={c.channel} className="px-4 py-2 whitespace-nowrap" data-trial-funnel-cell={`${stage.key}-${c.channel}`}>
                    <FunnelCell value={stage.value(c)} base={stage.base ? stage.base(c) : undefined} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminBusinessTrials({ data }: { data: BusinessTrialStats }) {
  const { totals, rows } = data;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Total label="Начали" value={totals.started} />
        <Total label="Сейчас в подарке" value={totals.trial} />
        <Total label="Льготный период" value={totals.grace} />
        <Total label="Сейчас оплачено" value={totals.paid} />
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
      {data.hiddenTests > 0 ? (
        <p className="text-xs text-[#9a8fb8]" data-trial-hidden-tests>
          Скрыто тестовых: {data.hiddenTests.toLocaleString("ru-RU")}
        </p>
      ) : null}
      <BusinessTrialFunnelBlock funnel={data.funnel} />
      {!data.attributionEnabled ? (
        <p className="text-xs text-[#9a8fb8]" data-trial-attribution-off>
          Канал, город и устройство начнут записываться после включения. До этого в колонках «{BUSINESS_TRIAL_NO_DATA}».
        </p>
      ) : null}
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
                <th className="px-4 py-3">Откуда</th>
                <th className="px-4 py-3">Город и устройство</th>
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
                  <td className="px-4 py-3 min-w-[160px]" data-trial-cell="source">
                    {row.origin ? businessTrialSourceLabel(row.origin) : <NoData />}
                  </td>
                  <td className="px-4 py-3 min-w-[160px]" data-trial-cell="place-device">
                    {row.origin ? (
                      <>
                        <span className="block">{businessTrialPlaceLabel(row.origin) ?? "город неизвестен"}</span>
                        <span className="block text-xs text-[#9a8fb8]">{businessTrialDeviceLabel(row.origin) ?? "устройство неизвестно"}</span>
                      </>
                    ) : (
                      <NoData />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* DB-IP Lite licence (CC BY 4.0) requires this link where the city data is shown. Admin page only. */}
      <p className="text-xs text-[#9a8fb8]" data-trial-dbip-attribution>
        Город определяется приблизительно, IP-адрес не сохраняется.{" "}
        <a href="https://db-ip.com" rel="nofollow noopener" target="_blank" className="underline">IP Geolocation by DB-IP</a>
      </p>
    </div>
  );
}
