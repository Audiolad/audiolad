import type { ShazamMatchView } from '@/lib/business-track-passports/shazam';

// t1522u: album-level list of tracks where Shazam found a match. Always visible (no expand),
// so the operator can check each fragment by hand in Shazam. Plain text, no links, never admits.
export type AlbumShazamMatchTrack = { id: string; title: string; matches: ShazamMatchView[]; date?: string | null };

export function AlbumShazamMatches({ tracks }: { tracks: AlbumShazamMatchTrack[] }) {
  if (tracks.length === 0) return null;
  return (
    <div className="space-y-3 rounded-[18px] border border-[#f2c7c7] bg-[#fff5f5] px-4 py-3" data-album-shazam-matches="">
      <p className="text-sm font-semibold text-[#9b3d3d]">Shazam нашёл совпадение – проверьте вручную</p>
      <ul className="space-y-3">
        {tracks.map((track) => (
          <li key={track.id} className="space-y-1 text-sm leading-6 text-[#5f5484]" data-shazam-match-track={track.id}>
            <p>
              Наш трек: <span className="font-semibold text-[#25135c]">«{track.title}»</span>
            </p>
            {track.matches.length > 0 ? (
              track.matches.map((match, index) => (
                <p key={`${match.range}-${index}`}>
                  Совпадение: «{match.title}» – {match.artist}, отрывок {match.range}
                </p>
              ))
            ) : (
              <p>Название найденного трека не сохранилось – проверьте трек вручную.</p>
            )}
            {track.date ? <p>Проверка Shazam: {track.date}</p> : null}
          </li>
        ))}
      </ul>
      <p className="text-sm leading-6 text-[#5f5484]">
        Включите этот отрывок нашего трека и проверьте его в Shazam. Если совпадение ложное, укажите результат Shazam вручную в паспорте трека (раздел «Треки» ниже). Допуск по-прежнему только вручную.
      </p>
    </div>
  );
}

export default AlbumShazamMatches;
