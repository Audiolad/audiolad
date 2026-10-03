import { formatDisplayedBpm } from "@/lib/music-analyzer-runs/passport-display";
import type { AlbumBpmDisplay, AlbumPassportDisplay } from "@/lib/music-passport/album-passport-display";

const CARD = "rounded-[22px] border border-[#e4d7f4] bg-white p-4";
const TITLE = "text-sm font-medium text-[#796ba0]";
const TAG = "inline-flex max-w-full rounded-full bg-[#f6f3fb] px-3 py-1 text-sm font-medium text-[#5c4a78]";

function bpmHeadline(bpm: AlbumBpmDisplay | null): string | null {
  if (!bpm) return null;
  if (bpm.kind === "single") return formatDisplayedBpm(String(bpm.value));
  const min = formatDisplayedBpm(String(bpm.min));
  const max = formatDisplayedBpm(String(bpm.max));
  if (!min || !max) return null;
  return min === max ? min : `${min}–${max}`;
}

function LabelCard({ title, labels }: { title: string; labels: string[] }) {
  return (
    <section className={CARD}>
      <h3 className={TITLE}>{title}</h3>
      {labels.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {labels.map((label) => (
            <li key={`${title}-${label}`} className={TAG}>{label}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-[#796ba0]">не указано</p>
      )}
    </section>
  );
}

function ambiguityText(field: string, value: string): string {
  if (field !== "Темп") return value;
  return formatDisplayedBpm(value) ?? "не указано";
}

export function AlbumMusicPassport({ album }: { album: AlbumPassportDisplay }) {
  const tempo = bpmHeadline(album.bpm);
  return (
    <section
      className="space-y-4"
      aria-labelledby="album-music-passport-heading"
      data-album-music-passport="true"
      data-album-status={album.status}
      data-analyzed-track-count={album.analyzedTrackCount}
    >
      <header>
        <p className="text-xs font-medium text-[#796ba0]">Статус: {album.statusLabel}</p>
        <h2 id="album-music-passport-heading" className="mt-2 text-[22px] font-semibold text-[#25135c]">
          Музыкальный паспорт альбома
        </h2>
        <p className="mt-1 text-sm text-[#25135c]">
          Проанализировано треков: {album.analyzedTrackCount}
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <section className={CARD} data-album-bpm="true">
          <h3 className={TITLE}>Темп</h3>
          <p className="mt-3 text-[2rem] font-semibold leading-none tracking-tight text-[#25135c]">
            {tempo ?? "—"}
          </p>
          {tempo ? <p className="mt-2 text-sm font-medium text-[#796ba0]">BPM</p> : null}
          {!tempo ? <p className="mt-2 text-sm text-[#796ba0]">не указано</p> : null}
        </section>
        <LabelCard title="Жанр" labels={album.genres} />
        <LabelCard title="Стиль" labels={album.styles} />
      </div>
      <LabelCard title="Характер и настроение" labels={album.moods} />
      <LabelCard title="Инструменты" labels={album.instruments} />
      {album.ambiguity.length > 0 ? (
        <section className={CARD} data-album-ambiguity="true">
          <h3 className={TITLE}>Расхождения между треками</h3>
          <ul className="mt-3 space-y-2 text-sm text-[#25135c]">
            {album.ambiguity.map((item) => (
              <li key={item.field}>
                {item.field}: {item.values.map((value) => ambiguityText(item.field, value)).join(", ")}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
