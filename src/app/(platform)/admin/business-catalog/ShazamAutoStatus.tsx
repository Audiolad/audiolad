import type { Passport } from '@/lib/business-track-passports/model';
import { shazamCheckView, type ShazamCheckRow, type ShazamGateFacts } from '@/lib/business-track-passports/shazam';

// t1485u: state of the automatic Shazam check in a closed-catalog track row.
// Shows the operator what Shazam found (title, artist, skew). Never admits a track.
const badgeClassName: Record<string, string> = {
  pending: 'rounded-full bg-[#fff7e6] px-2.5 py-0.5 text-xs font-semibold text-[#8a5a00]',
  no_match: 'rounded-full bg-[#e8f6ee] px-2.5 py-0.5 text-xs font-semibold text-[#1f7a46]',
  match: 'rounded-full bg-[#fff1f2] px-2.5 py-0.5 text-xs font-semibold text-[#9b3d3d]',
  error: 'rounded-full bg-[#f4eefe] px-2.5 py-0.5 text-xs font-semibold text-[#5f5484]',
};

const shortLabel: Record<string, string> = {
  pending: 'Shazam: проверяется',
  no_match: 'Shazam: совпадений нет',
  match: 'Shazam: найдено совпадение',
  error: 'Shazam: проверьте вручную',
};

type ShazamAutoProps = { check?: ShazamCheckRow | null; finalCheck?: ShazamCheckRow | null; gate?: ShazamGateFacts; passport?: Passport };

export function ShazamAutoBadge({ check, finalCheck, gate, passport }: ShazamAutoProps) {
  const view = shazamCheckView(check, passport, finalCheck, gate);
  if (view.state === 'none') return null;
  return (
    <span className={badgeClassName[view.state]} data-shazam-auto={view.state}>
      {view.state === 'no_match' && view.date ? `${shortLabel.no_match} – ${view.date}` : shortLabel[view.state]}
    </span>
  );
}

export function ShazamAutoStatus({ check, finalCheck, gate, passport }: ShazamAutoProps) {
  const view = shazamCheckView(check, passport, finalCheck, gate);
  if (view.state === 'none') {
    return (
      <p className="text-sm leading-6 text-[#7d70a2]" data-shazam-auto="none">
        Shazam проверит трек автоматически после загрузки мастера или по кнопке «Заполнить автоматически».
      </p>
    );
  }
  return (
    <div
      className={view.state === 'match'
        ? 'space-y-2 rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3'
        : 'space-y-2 rounded-[18px] border border-[#eadff8] bg-[#fbf8ff] px-4 py-3'}
      data-shazam-auto-panel={view.state}
    >
      <p className={view.state === 'match' ? 'text-sm font-semibold text-[#9b3d3d]' : 'text-sm font-semibold text-[#25135c]'}>{view.label}</p>
      {view.state === 'match' && view.matches.length > 0 ? (
        <ul className="space-y-1 text-sm text-[#5f5484]">
          {view.matches.map((match, index) => (
            <li key={`${match.offset}-${index}`}>
              Отрывок с {match.offset}: «{match.title}» – {match.artist}, перекос {match.skew}
            </li>
          ))}
        </ul>
      ) : null}
      {view.state === 'match' ? (
        <p className="text-sm leading-6 text-[#5f5484]">Поля Shazam в паспорте не заполнены. Если это ложное срабатывание, укажите результат вручную ниже.</p>
      ) : null}
      {view.state === 'no_match' && check?.passport_written ? (
        <p className="text-sm leading-6 text-[#5f5484]">Записано в паспорт автоматически по трём отрывкам: 0:30, середина и конец трека.</p>
      ) : null}
      {view.state === 'pending' ? (
        <p className="text-sm leading-6 text-[#5f5484]">Три отрывка по 15 секунд проверяются в фоне, обычно это занимает несколько минут.</p>
      ) : null}
    </div>
  );
}
export default ShazamAutoStatus;
