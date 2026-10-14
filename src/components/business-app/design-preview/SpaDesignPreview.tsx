"use client";

import { useState } from "react";
import styles from "./design-preview.module.css";

// DESIGN MOCKUP ONLY (c02fe282 mock-v2). Every name, track, time and status
// below is invented sample data. Nothing here reads a player, a heartbeat or
// playback events; buttons only switch the mockup.

const screens = [
  ["home", "Главная"],
  ["day", "Музыкальный день"],
  ["atmosphere", "Атмосфера"],
  ["license", "Лицензия и документы"],
  ["alerts", "Уведомления"],
  ["locations", "Мои точки"],
] as const;
type Screen = (typeof screens)[number][0];

// Connectivity (technical heartbeat) and actual playback are separate signals.
// A long track (20–60 min) never turns anything red: freshness is judged by the
// player heartbeat, not by how recently a new track started.
const states = {
  playing: { label: "Играет", tone: "ok", icon: "♪", title: "Музыка играет", detail: "Плеер на связи, музыка звучит.", action: null },
  paused: { label: "Пауза", tone: "calm", icon: "Ⅱ", title: "Воспроизведение остановлено", detail: "Плеер на связи. Музыку поставили на паузу на устройстве точки.", action: "Продолжить можно на устройстве, к которому подключены колонки." },
  offline: { label: "Нет связи (рабочее время)", tone: "warn", icon: "!", title: "Нет связи с плеером", detail: "Плеер не выходил на связь 5 минут. Сейчас рабочие часы точки.", action: "Проверьте, включено ли устройство точки и есть ли интернет." },
  closed: { label: "Нет связи (точка закрыта)", tone: "closed", icon: "☾", title: "Точка закрыта", detail: "Сейчас нерабочие часы. Плеер может быть выключен — это нормально.", action: null },
  failed: { label: "Сбой воспроизведения", tone: "bad", icon: "×", title: "Музыка не играет", detail: "Плеер на связи, но подтверждено, что звук не воспроизводится.", action: "Откройте плеер на устройстве точки или напишите в поддержку." },
} as const;
type PreviewState = keyof typeof states;

const track = { title: "Тёплый туман", artist: "Аудиолад · пример", program: "Утро в SPA", length: 42 * 60, position: 17 * 60 + 35 };
const history = [
  ["10:12", "Тёплый туман", "42 мин"],
  ["09:31", "Медленная вода", "38 мин"],
  ["09:02", "Лёгкий бриз", "27 мин"],
  ["08:30", "Открытие дня", "31 мин"],
] as const;
const dayArc = [
  ["08:30", "Открытие", "Мягко и светло", "past"],
  ["10:00", "Утро", "Спокойно", "now"],
  ["13:00", "День", "Ровно, чуть живее", "next"],
  ["18:00", "Вечер", "Глубже и тише", "later"],
  ["21:00", "Закрытие", "Тихое завершение", "later"],
] as const;
const venues = [
  ["SPA «Тихий сад» · Тверская", "Музыка играет", "ok"],
  ["SPA «Тихий сад» · Арбат", "Музыка играет", "ok"],
  ["SPA «Тихий сад» · Химки", "Точка закрыта", "closed"],
] as const;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function SpaDesignPreview() {
  const [screen, setScreen] = useState<Screen>("home");
  const [state, setState] = useState<PreviewState>("playing");
  const [frame, setFrame] = useState<"desktop" | "phone">("desktop");
  const [energy, setEnergy] = useState(2);
  const status = states[state];
  const hasTrack = state === "playing" || state === "paused";
  const progress = Math.round((track.position / track.length) * 100);

  const statusCard = (
    <section className={`${styles.status} ${styles[status.tone]}`} aria-live="polite" data-testid="status">
      <span className={styles.statusIcon} aria-hidden="true">{status.icon}</span>
      <div>
        <h3>{status.title}</h3>
        <p>{status.detail}</p>
        {status.action && <p className={styles.action}>{status.action}</p>}
      </div>
    </section>
  );

  const nowPlaying = (
    <section className={`${styles.card} ${styles.nowPlaying}`} aria-labelledby="np">
      <p className={styles.eyebrow} id="np">Что сейчас играет</p>
      {hasTrack ? (
        <>
          <div className={styles.trackRow}>
            <div className={styles.cover} aria-hidden="true" />
            <div>
              <h3 className={styles.trackTitle}>{track.title}</h3>
              <p className={styles.muted}>{track.artist} · программа «{track.program}»</p>
            </div>
          </div>
          <div className={styles.progress} role="progressbar" aria-label="Прогресс трека" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <p className={styles.time}><span>{fmt(track.position)}</span><span>{fmt(track.length)}</span></p>
          <p className={styles.note}>Длинный трек — 42 минуты. Это нормально: связь с плеером проверяется отдельно.</p>
          <button type="button" className={styles.secondary} disabled={!hasTrack}>Открыть плеер точки</button>
        </>
      ) : (
        <p className={styles.muted}>{state === "closed" ? "Точка закрыта. Музыка начнётся с открытием в 08:30." : "Сейчас нельзя подтвердить, что звучит. Ниже — последнее, что звучало."}</p>
      )}
    </section>
  );

  const historyCard = (
    <section className={styles.card} aria-labelledby="hist">
      <p className={styles.eyebrow} id="hist">Что звучало</p>
      <ol className={styles.history}>
        {history.map(([t, name, len]) => <li key={t}><span className={styles.muted}>{t}</span><span>{name}</span><span className={styles.muted}>{len}</span></li>)}
      </ol>
    </section>
  );

  const dayCard = (full: boolean) => (
    <section className={styles.card} aria-labelledby="day">
      <p className={styles.eyebrow} id="day">Музыкальный день</p>
      {!full && <h3>Сейчас «Утро» · в 13:00 — «День»</h3>}
      <ol className={full ? styles.arcFull : styles.arc}>
        {dayArc.map(([t, name, mood, when]) => (
          <li key={t} className={styles[when]} aria-current={when === "now" ? "step" : undefined}>
            <strong>{name}</strong><span className={styles.muted}>{t}{full ? ` · ${mood}` : ""}</span>
          </li>
        ))}
      </ol>
      {full && <p className={styles.note}>Аудиолад сам ведёт музыку через день. Вы можете поправить атмосферу — день подстроится.</p>}
    </section>
  );

  const atmosphereCard = (
    <section className={styles.card} aria-labelledby="atm">
      <p className={styles.eyebrow} id="atm">Атмосфера</p>
      <div className={styles.slider} role="group" aria-label="Энергия музыки">
        <span>Спокойнее</span>
        {[0, 1, 2, 3, 4].map((i) => (
          <button type="button" key={i} aria-label={`Уровень ${i + 1}`} aria-pressed={energy === i} onClick={() => setEnergy(i)} />
        ))}
        <span>Энергичнее</span>
      </div>
      <div className={styles.row}>
        <button type="button" className={styles.secondary}>Больше такого</button>
        <button type="button" className={styles.secondary}>Меньше такого</button>
      </div>
      <p className={styles.note}>В макете кнопки ничего не меняют в музыке.</p>
    </section>
  );

  const licenseCard = (
    <section className={styles.card} aria-labelledby="lic">
      <p className={styles.eyebrow} id="lic">Лицензия и документы</p>
      <h3>Музыка точки лицензирована · пример</h3>
      <dl className={styles.facts}>
        <div><dt>Точка</dt><dd>SPA «Тихий сад» · Тверская</dd></div>
        <div><dt>Период</dt><dd>01.10.2026 — 30.09.2027</dd></div>
        <div><dt>Покрывает</dt><dd>Фоновая музыка в зале и кабинетах</dd></div>
      </dl>
      <div className={styles.row}>
        <button type="button" className={styles.secondary}>Скачать паспорт лицензии</button>
        <button type="button" className={styles.secondary}>QR для проверки</button>
      </div>
    </section>
  );

  const alertsCard = (
    <section className={styles.card} aria-labelledby="al">
      <p className={styles.eyebrow} id="al">Уведомления</p>
      {state === "offline" || state === "failed" ? (
        <div className={`${styles.alert} ${styles[status.tone]}`}><strong>{status.title}</strong><p>{status.action}</p></div>
      ) : (
        <p className={styles.muted}>Ничего делать не нужно. Мы напишем, только если потребуется ваше действие.</p>
      )}
      <p className={styles.note}>Канал: MAX · почта. Без рекламы и «отчётов ради отчётов».</p>
    </section>
  );

  const locationsCard = (
    <section className={styles.card} aria-labelledby="loc">
      <p className={styles.eyebrow} id="loc">Мои точки</p>
      <h3>2 играют · 1 закрыта · 0 требуют действий</h3>
      <ul className={styles.venues}>
        {venues.map(([name, st, tone]) => <li key={name}><span className={`${styles.dot} ${styles[tone]}`} aria-hidden="true" /><span>{name}</span><span className={styles.muted}>{st}</span></li>)}
      </ul>
    </section>
  );

  return (
    <section className={styles.preview} aria-label="Согласование дизайна кабинета владельца">
      <header className={styles.reviewHeader}>
        <p className={styles.eyebrow}>Аудиолад Бизнес · макеты v2</p>
        <h1>Спокойствие начинается с ясности</h1>
      </header>
      <div className={styles.banner}>
        <strong>Макет — не реальные данные</strong>
        <p>Все точки, треки, время и статусы вымышлены. Кнопки меняют только макет. Звука и сохранения нет.</p>
      </div>
      <div className={styles.controls}>
        <label>Экран
          <select value={screen} onChange={(e) => setScreen(e.target.value as Screen)} data-testid="screen">
            {screens.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>Состояние
          <select value={state} onChange={(e) => setState(e.target.value as PreviewState)} data-testid="state">
            {Object.entries(states).map(([id, value]) => <option key={id} value={id}>{value.label}</option>)}
          </select>
        </label>
        <label>Рамка
          <select value={frame} onChange={(e) => setFrame(e.target.value as "desktop" | "phone")} data-testid="frame">
            <option value="desktop">Десктоп</option>
            <option value="phone">Телефон · 390px</option>
          </select>
        </label>
      </div>
      <div className={`${styles.frame} ${frame === "phone" ? styles.phone : styles.desktop}`} data-testid="mock">
        <div className={styles.mockHeader}>
          <span className={styles.monogram} aria-hidden="true">а</span>
          <div><strong>SPA «Тихий сад»</strong><p>Тверская · пример точки</p></div>
          <span className={styles.badge}>Макет</span>
        </div>
        <nav className={styles.screenNav} aria-label="Экраны макета">
          {screens.map(([id, label]) => (
            <button type="button" key={id} aria-pressed={screen === id} onClick={() => setScreen(id)}>{label}</button>
          ))}
        </nav>
        <div className={styles.content}>
          {screen === "home" && (
            <div className={styles.grid}>
              <div className={styles.main}>{statusCard}{nowPlaying}{historyCard}</div>
              <div className={styles.side}>{dayCard(false)}{atmosphereCard}{alertsCard}</div>
            </div>
          )}
          {screen === "day" && <div className={styles.stack}>{statusCard}{dayCard(true)}</div>}
          {screen === "atmosphere" && <div className={styles.stack}>{nowPlaying}{atmosphereCard}</div>}
          {screen === "license" && <div className={styles.stack}>{licenseCard}</div>}
          {screen === "alerts" && <div className={styles.stack}>{statusCard}{alertsCard}</div>}
          {screen === "locations" && <div className={styles.stack}>{locationsCard}</div>}
        </div>
      </div>
    </section>
  );
}
