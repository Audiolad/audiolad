"use client";

import { useState } from "react";
import styles from "./design-preview.module.css";

// DESIGN MOCKUP ONLY (c02fe282 mock-v3). Every point, time and status below is
// sample data. Track titles and covers are real Audiolad catalog items used as
// illustration only. Nothing here reads a player, a heartbeat or playback
// events; controls only switch the mockup.

const screens = [
  ["home", "Главная"],
  ["music", "Музыка"],
  ["locations", "Точки"],
  ["more", "Ещё"],
  ["license", "Лицензия и документы"],
  ["alerts", "Уведомления"],
  ["company", "Компания и оплата"],
  ["support", "Поддержка"],
] as const;
type Screen = (typeof screens)[number][0];
type Tab = "home" | "music" | "locations" | "more";
const tabOf = (s: Screen): Tab => (s === "license" || s === "alerts" || s === "company" || s === "support" ? "more" : s);

const POINT = "SPA «Тихий сад»";
const PLAYER = "Ресепшн";

// Two distinct signals: connectivity (player heartbeat) and sound confirmation.
// Only a confirmed playback failure is red. A long track never turns anything red.
const states = {
  playing: { label: "Играет", tone: "ok", icon: "♪", title: `В ${POINT} музыка играет`, checked: "Проверено минуту назад", link: ["ok", "Плеер на связи"], sound: ["ok", "Воспроизведение подтверждено"], action: null },
  paused: { label: "Пауза", tone: "calm", icon: "Ⅱ", title: `В ${POINT} музыка на паузе`, checked: "Проверено минуту назад", link: ["ok", "Плеер на связи"], sound: ["calm", "Воспроизведение на паузе"], action: "Продолжить можно в плеере точки на ресепшн." },
  offline: { label: "Нет связи более 5 минут", tone: "closed", icon: "!", title: `${POINT}: нет связи с плеером`, checked: "Последняя связь 6 минут назад", link: ["closed", "Нет связи с плеером"], sound: ["closed", "Нет свежего подтверждения звука"], action: "Музыка на точке может продолжать играть." },
  closed: { label: "Точка закрыта", tone: "closed", icon: "☾", title: `${POINT} сейчас закрыт`, checked: "Последняя связь вчера в 21:05 · откроется в 08:30", link: ["closed", "Точка закрыта"], sound: ["closed", "Воспроизведение не подтверждено"], action: null },
  failed: { label: "Сбой воспроизведения", tone: "bad", icon: "×", title: `В ${POINT} музыка не играет`, checked: "Проверено минуту назад", link: ["ok", "Плеер на связи"], sound: ["bad", "Сбой воспроизведения подтверждён"], action: "Откройте плеер точки на ресепшн или напишите в поддержку." },
} as const;
type PreviewState = keyof typeof states;

const COVER = "/business/design-preview/now-playing-cover.webp";
const track = { title: "Музыка для релакса пианино", author: "Тихий час", program: "Утро в SPA", length: 42 * 60, position: 17 * 60 + 35 };
const history = [
  ["10:12", "Музыка для релакса пианино", "Тихий час", COVER],
  ["09:31", "Музыка для медитации в стиле дзен", "Еленба", "/business/design-preview/history-cover-zen.webp"],
] as const;
const dayArc = [
  ["08:30", "Открытие дня", "Мягко и светло", "past"],
  ["10:00", "Утро в SPA", "Спокойно", "now"],
  ["13:00", "Дневное спокойствие", "Ровно, чуть живее", "next"],
  ["18:00", "Вечер", "Глубже и тише", "later"],
  ["21:00", "Закрытие", "Тихое завершение", "later"],
] as const;
const venues = [
  ["SPA «Тихий сад» · Тверская", "Музыка играет", "ok"],
  ["SPA «Тихий сад» · Арбат", "Музыка играет", "ok"],
  ["SPA «Тихий сад» · Химки", "Точка закрыта", "closed"],
] as const;

const AUTO_ENERGY = 25;
const moodText = (v: number) =>
  v < 20 ? "Очень спокойная, тихая музыка" : v < 45 ? "Спокойная, мягкая музыка для отдыха" : v < 70 ? "Ровная музыка, чуть живее" : "Бодрая, энергичная музыка";
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const Icon = ({ name }: { name: Tab }) => {
  const d = {
    home: "M4 11 12 4l8 7v9h-5v-6H9v6H4z",
    music: "M9 18a3 3 0 1 1-2-2.8V5l11-2v12a3 3 0 1 1-2-2.8V6.4L9 7.7z",
    locations: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    more: "M4 7h16M4 12h16M4 17h10",
  }[name];
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
};

export default function SpaDesignPreview() {
  const [screen, setScreen] = useState<Screen>("home");
  const [state, setState] = useState<PreviewState>("playing");
  const [frame, setFrame] = useState<"desktop" | "phone">("desktop");
  const [energy, setEnergy] = useState(AUTO_ENERGY);
  const [auto, setAuto] = useState(true);
  const status = states[state];
  const hasTrack = state === "playing" || state === "paused";
  // Notifications only when the owner must act (Bible: notification = action needed).
  const needsAction = state === "offline" || state === "failed";
  const progress = Math.round((track.position / track.length) * 100);
  const tab = tabOf(screen);

  const statusCard = (
    <section className={`${styles.status} ${styles[status.tone]}`} aria-live="polite" data-testid="status">
      <span className={styles.statusIcon} aria-hidden="true">{status.icon}</span>
      <div>
        <h3>{status.title}</h3>
        <p className={styles.checked}>{status.checked}</p>
        <ul className={styles.signals} aria-label="Сигналы точки">
          <li><span className={`${styles.dot} ${styles[status.link[0]]}`} aria-hidden="true" />{status.link[1]}</li>
          <li><span className={`${styles.dot} ${styles[status.sound[0]]}`} aria-hidden="true" />{status.sound[1]}</li>
        </ul>
        {status.action && <p className={styles.action}>{status.action}</p>}
      </div>
    </section>
  );

  const nowPlaying = (
    <section className={`${styles.card} ${styles.nowPlaying}`} aria-labelledby="np">
      <p className={styles.eyebrow} id="np">{state === "playing" ? "Сейчас звучит" : state === "paused" ? "На паузе" : "Последним звучало"}</p>
      <div className={styles.trackRow}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static mockup asset */}
        <img className={styles.cover} src={COVER} alt={`Обложка «${track.title}»`} width={88} height={88} />
        <div>
          <h3 className={styles.trackTitle}>{track.title}</h3>
          <p className={styles.muted}>{track.author} · программа «{track.program}»</p>
          <p className={styles.muted}>Аудиолад</p>
        </div>
      </div>
      {hasTrack ? (
        <>
          <div className={styles.progress} role="progressbar" aria-label="Прогресс трека" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
          <p className={styles.time}><span>{fmt(track.position)}</span><span>{fmt(track.length)}</span></p>
        </>
      ) : (
        <p className={styles.note}>{state === "closed" ? "Точка закрыта. Музыка начнётся с открытием в 08:30." : "Сейчас нельзя подтвердить, что звучит."}</p>
      )}
      <p className={styles.where} data-testid="where">
        <span className={`${styles.dot} ${styles[state === "playing" ? "ok" : state === "paused" ? "calm" : "closed"]}`} aria-hidden="true" />
        {state === "playing" ? `Играет на плеере точки · ${PLAYER}` : state === "paused" ? `На паузе на плеере точки · ${PLAYER}` : `Плеер точки · ${PLAYER}`}
      </p>
      <button type="button" className={styles.primaryWide}>Управление музыкой ↗</button>
      <p className={styles.note}>Откроется отдельный плеер точки – его использует персонал.</p>
    </section>
  );

  const reaction = (
    <div className={styles.reaction}>
      <p className={styles.muted}>К треку «{track.title}»:</p>
      <div className={styles.row}>
        <button type="button" className={styles.secondary} disabled={!hasTrack}>Больше такого</button>
        <button type="button" className={styles.secondary} disabled={!hasTrack}>Меньше такого</button>
      </div>
    </div>
  );

  const atmosphereCard = (
    <section className={styles.card} aria-labelledby="atm" data-testid="atmosphere">
      <div className={styles.cardHead}>
        <h3 id="atm">Атмосфера</h3>
        <span className={styles.badge}>{auto ? "Автоматически" : "Настроено вручную"}</span>
      </div>
      <p className={styles.mood}>{moodText(energy)}</p>
      <label className={styles.range}>
        <span className={styles.rangeLabels}><span>Спокойнее</span><span>Энергичнее</span></span>
        <input type="range" min={0} max={100} step={5} value={energy} aria-label="Спокойнее – Энергичнее" aria-valuetext={moodText(energy)}
          onChange={(e) => { setEnergy(Number(e.target.value)); setAuto(false); }} />
      </label>
      {!auto && (
        <button type="button" className={styles.link} onClick={() => { setEnergy(AUTO_ENERGY); setAuto(true); }}>Вернуть автоматический режим</button>
      )}
      {reaction}
      <p className={styles.note}>Пример элемента. Управление музыкой в макете не подключено.</p>
    </section>
  );

  const nextChange = (
    <section className={styles.card} aria-labelledby="next">
      <h3 id="next">Музыкальный день</h3>
      <div className={styles.nextRow}>
        <div><strong>Утро в SPA</strong><p className={styles.muted}>Следом: «Дневное спокойствие»</p></div>
        <span className={styles.timePill}>13:00</span>
      </div>
    </section>
  );

  const historyLink = (
    <button type="button" className={styles.listLink} onClick={() => setScreen("music")}>
      <span>История звучания</span><span aria-hidden="true">›</span>
    </button>
  );

  const dayFull = (
    <section className={styles.card} aria-labelledby="day">
      <h3 id="day">Музыкальный день</h3>
      <ol className={styles.arcFull}>
        {dayArc.map(([t, name, mood, when]) => (
          <li key={t} className={styles[when]} aria-current={when === "now" ? "step" : undefined}>
            <strong>{name}</strong><span>{t} · {mood}</span>
          </li>
        ))}
      </ol>
      <p className={styles.note}>Аудиолад сам ведёт музыку через день. Поправите атмосферу – день подстроится.</p>
    </section>
  );

  const historyCard = (
    <section className={styles.card} aria-labelledby="hist">
      <h3 id="hist">История звучания</h3>
      <ol className={styles.history}>
        {history.map(([t, name, author, cover]) => (
          <li key={t}>
            <span className={styles.muted}>{t}</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- static mockup asset */}
            <img src={cover} alt="" width={40} height={40} />
            <span>{name}<br /><span className={styles.muted}>{author}</span></span></li>
        ))}
      </ol>
    </section>
  );

  const licenseCard = (
    <section className={styles.card} aria-labelledby="lic">
      <h3 id="lic">Лицензия и документы</h3>
      <p>Музыка точки лицензирована · пример</p>
      <dl className={styles.facts}>
        <div><dt>Точка</dt><dd>SPA «Тихий сад» · Тверская</dd></div>
        <div><dt>Период</dt><dd>01.10.2026 – 30.09.2027</dd></div>
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
      <h3 id="al">Уведомления</h3>
      {needsAction ? (
        <div className={`${styles.alert} ${styles[status.tone]}`}><strong>{status.title}</strong><p>{status.action}</p></div>
      ) : (
        <p className={styles.muted}>Ничего делать не нужно. Мы напишем, только если потребуется ваше действие.</p>
      )}
      <p className={styles.note}>Канал: MAX · почта. Без рекламы и «отчётов ради отчётов».</p>
    </section>
  );

  const locationsCard = (
    <section className={styles.card} aria-labelledby="loc">
      <h3 id="loc">Мои точки</h3>
      <p className={styles.muted}>2 играют · 1 закрыта · действий не требуется</p>
      <ul className={styles.venues}>
        {venues.map(([name, st, tone]) => <li key={name}><span className={`${styles.dot} ${styles[tone]}`} aria-hidden="true" /><span>{name}</span><span className={styles.muted}>{st}</span></li>)}
      </ul>
    </section>
  );

  const moreCard = (
    <section className={styles.card} aria-labelledby="more">
      <h3 id="more">Ещё</h3>
      <div className={styles.menu}>
        <button type="button" className={styles.listLink} onClick={() => setScreen("license")}><span>Лицензия и документы</span><span aria-hidden="true">›</span></button>
        <button type="button" className={styles.listLink} onClick={() => setScreen("alerts")}><span>Уведомления</span><span aria-hidden="true">›</span></button>
        <button type="button" className={styles.listLink} onClick={() => setScreen("company")}><span>Компания и оплата</span><span aria-hidden="true">›</span></button>
        <button type="button" className={styles.listLink} onClick={() => setScreen("support")}><span>Поддержка</span><span aria-hidden="true">›</span></button>
      </div>
    </section>
  );

  const companyCard = (
    <section className={styles.card} aria-labelledby="co">
      <h3 id="co">Компания и оплата</h3>
      <dl className={styles.facts}>
        <div><dt>Компания</dt><dd>ООО «Тихий сад» · пример</dd></div>
        <div><dt>Тариф</dt><dd>Аудиолад Бизнес · 3 точки</dd></div>
        <div><dt>Оплачено до</dt><dd>30.09.2027</dd></div>
      </dl>
      <button type="button" className={styles.secondary}>Счета и акты</button>
    </section>
  );

  const supportCard = (
    <section className={styles.card} aria-labelledby="sup">
      <h3 id="sup">Поддержка</h3>
      <p className={styles.muted}>Ответим в рабочее время в течение 15 минут.</p>
      <div className={styles.row}>
        <button type="button" className={styles.secondary}>Написать в MAX</button>
        <button type="button" className={styles.secondary}>Позвонить</button>
      </div>
    </section>
  );

  const tabs: [Tab, string][] = [["home", "Главная"], ["music", "Музыка"], ["locations", "Точки"], ["more", "Ещё"]];
  const sideNav: [Screen, string][] = [["home", "Главная"], ["music", "Музыка"], ["locations", "Точки"], ["license", "Лицензия и документы"], ["alerts", "Уведомления"], ["company", "Компания и оплата"], ["support", "Поддержка"]];

  return (
    <section className={styles.preview} aria-label="Согласование дизайна кабинета владельца">
      <header className={styles.reviewHeader}>
        <p className={styles.eyebrow}>Аудиолад Бизнес · макеты v3</p>
        <h1>Пульт звуковой атмосферы</h1>
      </header>
      <div className={styles.banner}>
        <strong>Макет – не реальные данные</strong>
        <p>Точки, время и статусы вымышлены; треки и обложки – примеры из каталога Аудиолад. Кнопки меняют только макет. Звука и сохранения нет.</p>
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
          <div><strong>{POINT}</strong><p>Тверская · ваша точка</p></div>
          <span className={styles.badge}>Макет</span>
        </div>
        <div className={styles.shell}>
          {frame === "desktop" && (
            <nav className={styles.sideNav} aria-label="Разделы кабинета">
              {sideNav.map(([id, label]) => (
                <button type="button" key={id} aria-current={screen === id ? "page" : undefined} onClick={() => setScreen(id)}>{label}</button>
              ))}
            </nav>
          )}
          <div className={styles.content}>
            {screen === "home" && (
              frame === "phone" ? (
                <div className={styles.stack}>{statusCard}{nowPlaying}{atmosphereCard}{nextChange}{historyLink}</div>
              ) : (
                <div className={styles.grid}>
                  <div className={styles.main}>{statusCard}{nowPlaying}</div>
                  <div className={styles.side}>{needsAction && alertsCard}{atmosphereCard}{nextChange}{historyLink}</div>
                </div>
              )
            )}
            {screen === "music" && <div className={styles.stack}>{dayFull}{atmosphereCard}{historyCard}</div>}
            {screen === "locations" && <div className={styles.stack}>{locationsCard}</div>}
            {screen === "more" && <div className={styles.stack}>{moreCard}</div>}
            {screen === "license" && <div className={styles.stack}>{licenseCard}</div>}
            {screen === "alerts" && <div className={styles.stack}>{alertsCard}</div>}
            {screen === "company" && <div className={styles.stack}>{companyCard}</div>}
            {screen === "support" && <div className={styles.stack}>{supportCard}</div>}
          </div>
        </div>
        {frame === "phone" && (
          <nav className={styles.bottomNav} aria-label="Разделы кабинета">
            {tabs.map(([id, label]) => (
              <button type="button" key={id} aria-current={tab === id ? "page" : undefined} onClick={() => setScreen(id)}>
                <Icon name={id} /><span>{label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </section>
  );
}
