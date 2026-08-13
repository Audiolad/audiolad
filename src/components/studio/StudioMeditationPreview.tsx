const voiceWaveform = [
  12, 20, 34, 18, 42, 28, 16, 32, 22, 46, 30, 14, 36, 24, 44, 20, 30, 16,
  38, 26, 48, 22, 34, 18, 40, 28, 14, 32, 20, 42,
];

const musicWaveform = [
  28, 42, 36, 52, 34, 44, 58, 40, 48, 32, 54, 38, 46, 60, 42, 34, 50, 44,
  56, 36, 48, 64, 40, 52, 34, 58, 46, 38, 54, 44,
];

function Waveform({
  bars,
  colorClassName,
}: {
  bars: number[];
  colorClassName: string;
}) {
  return (
    <div className="flex h-14 items-center gap-[2px] overflow-hidden px-3">
      {bars.map((height, index) => (
        <span
          key={`${height}-${index}`}
          aria-hidden="true"
          className={`min-w-[2px] flex-1 rounded-full ${colorClassName}`}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

function Track({
  number,
  title,
  subtitle,
  accentClassName,
  waveform,
  waveformClassName,
}: {
  number: string;
  title: string;
  subtitle: string;
  accentClassName: string;
  waveform: number[];
  waveformClassName: string;
}) {
  return (
    <div className="grid min-h-[88px] grid-cols-[88px_minmax(0,1fr)] border-b border-[#293446] last:border-b-0 sm:grid-cols-[128px_minmax(0,1fr)]">
      <div className="border-r border-[#293446] p-2.5 sm:p-3">
        <div className="flex items-center gap-2">
          <span
            className={`grid h-6 w-6 place-items-center rounded text-[11px] font-semibold ${accentClassName}`}
          >
            {number}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-semibold text-[#edf0f7] sm:text-xs">
              {title}
            </p>
            <p className="mt-0.5 hidden text-[10px] text-[#8794ab] sm:block">
              {subtitle}
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-1.5 text-[#b9c5d7]">
          <span className="grid h-5 w-5 place-items-center rounded border border-[#364154] text-[10px]">
            ♫
          </span>
          <span className="hidden h-5 w-5 place-items-center rounded border border-[#364154] text-[10px] sm:grid">
            ⌁
          </span>
          <span className="hidden h-5 w-5 place-items-center rounded border border-[#364154] text-[10px] sm:grid">
            ✂
          </span>
        </div>
      </div>
      <div className="relative overflow-hidden bg-[#101722]">
        <div className="absolute inset-x-0 top-1/2 h-px bg-[#334055]" />
        <Waveform bars={waveform} colorClassName={waveformClassName} />
      </div>
    </div>
  );
}

export default function StudioMeditationPreview() {
  return (
    <div
      role="img"
      aria-label="Пример интерфейса Студии АудиоЛад: голосовая и музыкальная дорожки на таймлайне"
      className="overflow-hidden rounded-[18px] border border-[#344056] bg-[#0b1019] shadow-[0_28px_70px_rgba(28,14,61,0.28)] sm:rounded-[24px]"
    >
      <div className="flex min-h-12 items-center justify-between gap-2 border-b border-[#293446] bg-[#0f1520] px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2 text-[10px] text-[#c9d8ff] sm:text-xs">
          <span className="hidden font-medium text-[#edf0f7] sm:inline">
            Новая медитация
          </span>
          <span className="hidden text-[#71809b] sm:inline">/</span>
          <span>00:07 / 11:28</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="grid h-7 w-7 place-items-center rounded border border-[#39465b] text-xs text-[#e1e8f5]">
            ▮◀
          </span>
          <span className="grid h-7 w-7 place-items-center rounded bg-[#4fb887] text-xs text-[#0c1b17]">
            ▶
          </span>
          <span className="hidden h-7 items-center rounded border border-[#39465b] px-2 text-[10px] text-[#d8c8fb] sm:flex">
            +15
          </span>
        </div>
      </div>

      <div className="flex h-7 items-center border-b border-[#293446] bg-[#131b28] pl-[88px] text-[9px] text-[#72809a] sm:pl-32 sm:text-[10px]">
        <div className="flex w-full justify-around">
          <span>0:04</span>
          <span>0:08</span>
          <span>0:12</span>
          <span>0:16</span>
          <span>0:20</span>
          <span className="hidden sm:inline">0:24</span>
        </div>
      </div>

      <div className="relative">
        <Track
          number="1"
          title="Голос"
          subtitle="Запись голоса"
          accentClassName="bg-[#302b58] text-[#c9b8ff]"
          waveform={voiceWaveform}
          waveformClassName="bg-[#ae8cff]"
        />
        <Track
          number="2"
          title="Музыка"
          subtitle="Музыкальная дорожка"
          accentClassName="bg-[#13364d] text-[#75c9ff]"
          waveform={musicWaveform}
          waveformClassName="bg-[#46b3f2]"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-0 top-0 left-[43%] z-10 w-px bg-[#f06d9c] shadow-[0_0_8px_rgba(240,109,156,0.8)]"
        >
          <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-[#f06d9c]" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#293446] bg-[#0f1520] px-3 py-2.5 text-[10px] text-[#94a2ba] sm:px-4">
        <span>Громкость голоса</span>
        <div className="h-1.5 w-20 rounded-full bg-[#384359] sm:w-28">
          <div className="h-full w-[68%] rounded-full bg-[#a78bfa]" />
        </div>
        <span className="hidden sm:inline">Плавное появление</span>
      </div>
    </div>
  );
}
