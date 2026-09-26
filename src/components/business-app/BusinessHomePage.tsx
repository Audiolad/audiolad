"use client";

import { useMemo, useState } from "react";

import {
  BizNextIcon,
  BizPauseIcon,
  BizPlayIcon,
  BizPrevIcon,
} from "@/components/business-app/BusinessIcons";
import {
  buildBusinessGreeting,
  buildBusinessGreetingSubtitle,
} from "@/lib/business-app/greeting";
import {
  BUSINESS_HOME_MOCK,
  formatTrackTime,
} from "@/lib/business-app/mock-data";
import type { BusinessPointState } from "@/lib/business-app/point-state";

type BusinessHomePageProps = {
  initialState: BusinessPointState;
};

function StatusBanner({ state }: { state: BusinessPointState }) {
  const location = BUSINESS_HOME_MOCK.location.name;
  const reserve = BUSINESS_HOME_MOCK.musicReserveHours[state];
  const stoppedMinutes = BUSINESS_HOME_MOCK.stoppedMinutes;

  if (state === "healthy") {
    return (
      <section
        className="business-app-status-banner is-healthy business-app-span-full"
        aria-live="polite"
      >
        <p className="text-sm font-semibold uppercase tracking-wide opacity-80">
          Статус точки
        </p>
        <h2 className="mt-1 text-[1.45rem] font-bold leading-tight sm:text-[1.65rem]">
          <span aria-hidden="true">🟢 </span>
          Всё работает
        </h2>
        <p className="mt-1 text-lg font-semibold">{location}</p>
        <p className="mt-1 text-[1.02rem]">Музыка играет как запланировано.</p>
      </section>
    );
  }

  if (state === "autonomous") {
    return (
      <section
        className="business-app-status-banner is-autonomous business-app-span-full"
        aria-live="polite"
      >
        <p className="text-sm font-semibold uppercase tracking-wide opacity-80">
          Статус точки
        </p>
        <h2 className="mt-1 text-[1.45rem] font-bold leading-tight sm:text-[1.65rem]">
          <span aria-hidden="true">🟡 </span>
          Музыка продолжает играть
        </h2>
        <p className="mt-1 text-[1.02rem]">
          Интернет временно недоступен. Точка работает автономно.
        </p>
        <p className="mt-2 text-[1.02rem] font-medium">
          Запаса музыки хватит ещё на {reserve} часа.
        </p>
        <p className="mt-3 text-[1.08rem] font-bold">Ничего делать не нужно.</p>
      </section>
    );
  }

  return (
    <section
      className="business-app-status-banner is-stopped business-app-span-full"
      aria-live="assertive"
    >
      <p className="text-sm font-semibold uppercase tracking-wide opacity-80">
        Статус точки
      </p>
      <h2 className="mt-1 text-[1.45rem] font-bold leading-tight sm:text-[1.65rem]">
        <span aria-hidden="true">🔴 </span>
        Музыка остановилась
      </h2>
      <p className="mt-1 text-[1.02rem]">
        Плеер в {location} не отвечает {stoppedMinutes} минут.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="business-app-btn business-app-btn-primary business-app-focus-ring"
          onClick={() => {
            window.alert("В этом прототипе действие «Исправить» пока локальное.");
          }}
        >
          Исправить
        </button>
        <button
          type="button"
          className="business-app-btn business-app-btn-secondary business-app-focus-ring"
          onClick={() => {
            window.alert(
              "В этом прототипе «Связаться с поддержкой» пока локальное.",
            );
          }}
        >
          Связаться с поддержкой
        </button>
      </div>
    </section>
  );
}

function ControlCard({
  title,
  detail,
  tone,
}: {
  title: string;
  detail: string;
  tone: "ok" | "warn";
}) {
  return (
    <div
      className={`rounded-2xl border px-3.5 py-3 ${
        tone === "ok"
          ? "border-[#c9ebd6] bg-[var(--biz-green-bg)]"
          : "border-[#f0e0a8] bg-[var(--biz-yellow-bg)]"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-base" aria-hidden="true">
          {tone === "ok" ? "✓" : "!"}
        </span>
        <div>
          <p className="font-semibold text-[var(--biz-text)]">{title}</p>
          <p className="mt-0.5 text-sm text-[var(--biz-text-muted)]">{detail}</p>
        </div>
      </div>
    </div>
  );
}

export default function BusinessHomePage({
  initialState,
}: BusinessHomePageProps) {
  const mock = BUSINESS_HOME_MOCK;
  const [state] = useState<BusinessPointState>(initialState);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [paused, setPaused] = useState(state === "stopped");
  const [trackIndex, setTrackIndex] = useState(0);
  const [atmosphere, setAtmosphere] = useState(50);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const greeting = useMemo(
    () => buildBusinessGreeting(mock.owner.firstName),
    [mock.owner.firstName],
  );
  const subtitle = buildBusinessGreetingSubtitle(state);

  const trackTitles = [
    mock.currentTrack.title,
    "Мягкий воздух",
    "Светлая пауза",
  ];
  const currentTitle = trackTitles[trackIndex % trackTitles.length]!;
  const progress =
    mock.currentTrack.durationSeconds > 0
      ? (mock.currentTrack.currentSeconds / mock.currentTrack.durationSeconds) *
        100
      : 0;

  const playing = state !== "stopped" && !paused;

  function onAtmosphereChange(value: number) {
    setAtmosphere(value);
    if (value < 40) {
      setFeedback("Будем постепенно делать эфир спокойнее.");
    } else if (value > 60) {
      setFeedback("Будем постепенно делать эфир энергичнее.");
    } else {
      setFeedback("Оставим текущую атмосферу.");
    }
  }

  const reserveHours = mock.musicReserveHours[state];

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-5">
        <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)] sm:text-[2rem]">
          {greeting}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--biz-text-muted)]">
          {subtitle}
        </p>
      </header>

      <div className="business-app-home-grid">
        <StatusBanner state={state} />

        <div className="business-app-home-stack">
          <section className="business-app-card" aria-labelledby="now-playing-title">
            <h2
              id="now-playing-title"
              className="text-sm font-semibold uppercase tracking-wide text-[var(--biz-text-muted)]"
            >
              Сейчас играет
            </h2>

            {state === "stopped" ? (
              <div className="mt-4 rounded-2xl border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-4 py-5">
                <p className="text-lg font-semibold text-[var(--biz-text)]">
                  Музыка не играет
                </p>
                <p className="mt-1 text-[var(--biz-text-muted)]">
                  Плеер остановлен. Можно запустить восстановление выше.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-4 flex gap-3.5">
                  <div className="business-app-cover" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-[1.25rem] font-bold text-[var(--biz-text)]">
                      {currentTitle}
                    </p>
                    <p className="mt-0.5 text-[0.98rem] font-medium text-[var(--biz-accent)]">
                      {mock.currentTrack.program}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--biz-text-muted)]">
                      {mock.currentTrack.description}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <div
                    className="business-app-progress"
                    role="progressbar"
                    aria-label="Прогресс трека"
                    aria-valuemin={0}
                    aria-valuemax={mock.currentTrack.durationSeconds}
                    aria-valuenow={mock.currentTrack.currentSeconds}
                  >
                    <span style={{ width: `${progress}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs text-[var(--biz-text-muted)]">
                    <span>{formatTrackTime(mock.currentTrack.currentSeconds)}</span>
                    <span>
                      {formatTrackTime(mock.currentTrack.durationSeconds)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="business-app-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--biz-border)] text-[var(--biz-text)]"
                    aria-label="Предыдущий трек"
                    onClick={() => {
                      setTrackIndex((i) => (i + trackTitles.length - 1) % trackTitles.length);
                      setActionNote("Показан предыдущий mock-трек.");
                    }}
                  >
                    <BizPrevIcon />
                  </button>
                  <button
                    type="button"
                    className="business-app-focus-ring inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--biz-accent)] text-white"
                    aria-label={playing ? "Пауза" : "Продолжить"}
                    onClick={() => {
                      setPaused((value) => !value);
                      setActionNote(
                        playing
                          ? "Пауза (только интерфейс, без реального плеера)."
                          : "Продолжение (только интерфейс).",
                      );
                    }}
                  >
                    {playing ? <BizPauseIcon /> : <BizPlayIcon />}
                  </button>
                  <button
                    type="button"
                    className="business-app-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--biz-border)] text-[var(--biz-text)]"
                    aria-label="Следующий трек"
                    onClick={() => {
                      setTrackIndex((i) => (i + 1) % trackTitles.length);
                      setActionNote("Показан следующий mock-трек.");
                    }}
                  >
                    <BizNextIcon />
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`business-app-chip business-app-focus-ring ${liked ? "is-active" : ""}`}
                    aria-pressed={liked}
                    onClick={() => {
                      setLiked((v) => !v);
                      if (!liked) setDisliked(false);
                      setActionNote(
                        !liked
                          ? "Отметили: больше такого."
                          : "Сняли отметку «Больше такого».",
                      );
                    }}
                  >
                    Больше такого
                  </button>
                  <button
                    type="button"
                    className={`business-app-chip business-app-focus-ring ${disliked ? "is-active" : ""}`}
                    aria-pressed={disliked}
                    onClick={() => {
                      setDisliked((v) => !v);
                      if (!disliked) setLiked(false);
                      setActionNote(
                        !disliked
                          ? "Отметили: меньше такого."
                          : "Сняли отметку «Меньше такого».",
                      );
                    }}
                  >
                    Меньше такого
                  </button>
                  <button
                    type="button"
                    className="business-app-chip business-app-focus-ring"
                    onClick={() => {
                      setTrackIndex((i) => (i + 1) % trackTitles.length);
                      setActionNote("Трек пропущен в интерфейсе.");
                    }}
                  >
                    Пропустить
                  </button>
                </div>
                {actionNote ? (
                  <p className="mt-3 text-sm text-[var(--biz-text-muted)]" aria-live="polite">
                    {actionNote}
                  </p>
                ) : null}
              </>
            )}
          </section>

          <section className="business-app-card" aria-labelledby="atmosphere-title">
            <h2
              id="atmosphere-title"
              className="text-[1.15rem] font-bold text-[var(--biz-text)]"
            >
              Как должно звучать сейчас?
            </h2>
            <label className="mt-4 block" htmlFor="biz-atmosphere-slider">
              <span className="sr-only">
                Атмосфера эфира: спокойнее или энергичнее
              </span>
              <div className="mb-2 flex justify-between text-sm font-medium text-[var(--biz-text-muted)]">
                <span>Спокойнее</span>
                <span>Энергичнее</span>
              </div>
              <input
                id="biz-atmosphere-slider"
                className="business-app-slider business-app-focus-ring"
                type="range"
                min={0}
                max={100}
                value={atmosphere}
                onChange={(event) =>
                  onAtmosphereChange(Number(event.target.value))
                }
                aria-valuetext={
                  atmosphere < 40
                    ? "Спокойнее"
                    : atmosphere > 60
                      ? "Энергичнее"
                      : "Сбалансировано"
                }
              />
            </label>
            {feedback ? (
              <p className="mt-3 text-[0.98rem] text-[var(--biz-text-muted)]" aria-live="polite">
                {feedback}
              </p>
            ) : (
              <p className="mt-3 text-[0.98rem] text-[var(--biz-text-muted)]">
                Двигайте ползунок — эфир будет меняться постепенно.
              </p>
            )}
          </section>
        </div>

        <div className="business-app-home-stack">
          <section className="business-app-card" aria-labelledby="today-title">
            <h2
              id="today-title"
              className="text-[1.15rem] font-bold text-[var(--biz-text)]"
            >
              Сегодня
            </h2>
            <ul className="mt-4 space-y-2.5">
              {mock.schedule.map((block) => (
                <li
                  key={`${block.start}-${block.name}`}
                  className={`rounded-2xl border px-3.5 py-3 ${
                    block.current
                      ? "border-[#c9b3ef] bg-[var(--biz-accent-soft)]"
                      : "border-[var(--biz-border)] bg-white"
                  }`}
                >
                  <p className="text-sm text-[var(--biz-text-muted)]">
                    {block.start}–{block.end}
                  </p>
                  <p className="mt-0.5 text-[1.02rem] font-semibold text-[var(--biz-text)]">
                    {block.name}
                    {block.current ? " · сейчас" : ""}
                  </p>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="business-app-btn business-app-btn-secondary business-app-focus-ring mt-4 w-full sm:w-auto"
              onClick={() => {
                window.alert(
                  "Полный музыкальный день появится в следующем этапе.",
                );
              }}
            >
              Посмотреть музыкальный день
            </button>
          </section>

          <section
            className="business-app-card"
            aria-labelledby="control-title"
          >
            <h2
              id="control-title"
              className="text-[1.15rem] font-bold text-[var(--biz-text)]"
            >
              Всё под контролем
            </h2>
            <div className="mt-4 grid gap-2.5">
              <ControlCard
                title="Музыка играет"
                detail={
                  state === "stopped"
                    ? "Сейчас музыка остановлена"
                    : "Сейчас всё в порядке"
                }
                tone={state === "stopped" ? "warn" : "ok"}
              />
              <ControlCard
                title={
                  state === "autonomous"
                    ? "Интернет недоступен"
                    : "Интернет работает"
                }
                detail={
                  state === "autonomous"
                    ? "Точка продолжает работу автономно"
                    : "Соединение стабильно"
                }
                tone={state === "autonomous" ? "warn" : "ok"}
              />
              <ControlCard
                title={`Запас музыки — ${reserveHours} ${reserveHours % 10 === 1 && reserveHours % 100 !== 11 ? "час" : reserveHours % 10 >= 2 && reserveHours % 10 <= 4 && (reserveHours % 100 < 10 || reserveHours % 100 >= 20) ? "часа" : "часов"}`}
                detail="Даже при отсутствии интернета"
                tone={state === "autonomous" ? "warn" : "ok"}
              />
              <ControlCard
                title="Документы в порядке"
                detail="Лицензия активна"
                tone="ok"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
