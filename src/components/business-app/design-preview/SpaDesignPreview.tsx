"use client";

import { useState, type ReactNode } from "react";
import styles from "./design-preview.module.css";

const screens = [
  ["home", "Главная / статус музыки"],
  ["player", "Плеер точки"],
  ["atmosphere", "Атмосфера и время суток [концепт]"],
  ["venue", "Точка и лицензия"],
  ["help", "Помощь"],
  ["profile", "Профиль"],
] as const;
type Screen = (typeof screens)[number][0];

const states = {
  playing: { label: "Играет", title: "Музыка играет · пример", detail: "Показан образец подтверждённого воспроизведения. Это не статус вашей точки.", hint: "В рабочем кабинете здесь нужны источник и время подтверждения." },
  paused: { label: "Пауза", title: "Музыка на паузе · пример", detail: "В этом сценарии воспроизведение приостановлено на устройстве точки.", hint: "Продолжить можно на устройстве, к которому подключены колонки." },
  empty: { label: "Нет музыки", title: "Пока нет доступной музыки · пример", detail: "В этом сценарии программа пуста. Наличие программы само по себе не подтверждает права.", hint: "Уточните доступность программы у поддержки." },
  offline: { label: "Offline / нет подключения", title: "Нет подключения · пример", detail: "Текущий статус звучания неизвестен. Проверьте интернет на устройстве точки.", hint: "В текущем онлайн-пилоте автономное воспроизведение не предусмотрено." },
  error: { label: "Ошибка", title: "Не удалось получить статус · пример", detail: "В этом сценарии произошла ошибка. Мы не можем подтвердить, звучит ли музыка.", hint: "Проверьте подключение и откройте подсказки в разделе помощи." },
} as const;
type PreviewState = keyof typeof states;

function Concept({ children }: { children: ReactNode }) {
  return <div className={styles.concept}><span className={styles.badge}>Концепт · позже</span>{children}</div>;
}

export default function SpaDesignPreview() {
  const [screen, setScreen] = useState<Screen>("home");
  const [state, setState] = useState<PreviewState>("paused");
  const [frame, setFrame] = useState("phone");
  const status = states[state];
  const hasTrack = state === "playing" || state === "paused";

  return (
    <section className={styles.preview} aria-label="Согласование дизайна SPA-кабинета">
      <header className={styles.reviewHeader}>
        <p className={styles.eyebrow}>Аудиолад Бизнес · исследование 01</p>
        <h1>Спокойствие начинается с ясности</h1>
        <p>Кабинет владельца одной SPA-точки. Макеты для согласования Сергеем.</p>
      </header>
      <div className={styles.banner}>
        <strong>Макет — не реальные данные</strong>
        <p>Все имена, треки и состояния вымышлены. Кнопки меняют только макет. Звука и сохранения нет.</p>
      </div>
      <div className={styles.controls}>
        <label>Экран
          <select value={screen} onChange={(e) => setScreen(e.target.value as Screen)}>
            {screens.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>Состояние музыки
          <select value={state} onChange={(e) => setState(e.target.value as PreviewState)}>
            {Object.entries(states).map(([id, value]) => <option key={id} value={id}>{value.label}</option>)}
          </select>
        </label>
        <label>Рамка просмотра
          <select value={frame} onChange={(e) => setFrame(e.target.value)}>
            <option value="phone">Телефон · 390px</option>
            <option value="desktop">Десктоп</option>
          </select>
        </label>
      </div>
      <p className={styles.frameNote}>На узком экране рамка сжимается по доступной ширине. Внешнее меню — действующая оболочка кабинета.</p>
      <div className={`${styles.frame} ${frame === "phone" ? styles.phone : styles.desktop}`}>
        <div className={styles.mockHeader}>
          <span className={styles.monogram} aria-hidden="true">а</span>
          <div><strong>Аудиолад Бизнес</strong><p>SPA «Тихий сад» · пример точки</p></div>
          <span className={styles.badge}>Макет</span>
        </div>
        <nav className={styles.screenNav} aria-label="Экраны макета">
          {screens.map(([id, label]) => (
            <button type="button" key={id} aria-pressed={screen === id} onClick={() => setScreen(id)}>{label}</button>
          ))}
        </nav>
        <div className={styles.content}>
          <header className={styles.pageHeading}>
            <p className={styles.eyebrow}>{screen === "player" ? "Устройство точки · пример" : "Кабинет владельца · пример"}</p>
            <h2>{screens.find(([id]) => id === screen)?.[1]}</h2>
            <p>{screen === "home" ? "Одна точка. Самое нужное — перед вами." : "Вариант интерфейса для обсуждения."}</p>
          </header>
          <section className={styles.status} aria-live="polite" aria-atomic="true">
            <span className={styles.badge}>Сценарий макета · {status.label}</span>
            <h3>{status.title}</h3><p>{status.detail}</p>
            <p className={styles.hint}>{status.hint}</p>
          </section>
          <div className={styles.grid}>
            {(screen === "home" || screen === "player") && <>
              <section className={styles.card}>
                <p className={styles.eyebrow}>Программа · пример</p>
                <div className={styles.track}>
                  <div className={styles.art} aria-hidden="true">♪</div>
                  <div><h3>{hasTrack ? "Мягкий свет" : "Трек не подтверждён"}</h3><p>{hasTrack ? "Тихое пространство · вымышленная программа" : "Данные о текущем треке отсутствуют в этом сценарии."}</p></div>
                </div>
                <p className={styles.hint}>Воспроизведение — на устройстве точки. Телефон владельца показывает состояние.</p>
                {screen === "home" ? <button type="button" className={styles.primary} onClick={() => setScreen("player")}>Посмотреть макет плеера</button> : <>
                  <button type="button" className={styles.primary} disabled={!hasTrack} onClick={() => setState(state === "playing" ? "paused" : "playing")}>
                    {state === "playing" ? "Пауза · в макете" : "Играть · в макете"}
                  </button>
                  <p className={styles.hint}>Кнопка только переключает сценарий. Аудио не воспроизводится.</p>
                  <Concept><p>Громкость и следующий трек</p></Concept>
                </>}
              </section>
              <section className={styles.card}>
                <p className={styles.eyebrow}>Ваша точка · пример</p><h3>SPA «Тихий сад»</h3>
                <dl><dt>Зона</dt><dd>Зона отдыха · пример</dd><dt>Лицензия</dt><dd>Не проверена в макете</dd><dt>Данные статуса</dt><dd>Демонстрационные, без времени проверки</dd></dl>
                <button type="button" onClick={() => setScreen("venue")}>Точка и лицензия · макет</button>
              </section>
            </>}
            {screen === "atmosphere" && <section className={styles.card}>
              <Concept><h3>Ритм вашего пространства</h3><p>Мягкая атмосфера в течение дня. Расписание ниже — идея, оно не применяется к музыке.</p>
                <ol className={styles.dayparts}>
                  <li><span>09:00–12:00 · пример</span><strong>Тихое утро</strong><p>Плавное начало дня</p></li>
                  <li><span>12:00–17:00 · пример</span><strong>Ровный день</strong><p>Ненавязчивый фон для процедур</p></li>
                  <li><span>17:00–21:00 · пример</span><strong>Мягкий вечер</strong><p>Спокойное завершение</p></li>
                </ol>
                <p>Настройка атмосферы, времени и автозапуск — концепции для отдельного этапа.</p>
              </Concept>
            </section>}
            {screen === "venue" && <>
              <section className={styles.card}><h3>Одна точка, одна зона</h3><dl><dt>Название</dt><dd>SPA «Тихий сад» · пример</dd><dt>Категория</dt><dd>SPA / wellness · пример</dd><dt>Часовой пояс</dt><dd>Москва · пример</dd><dt>Зона</dt><dd>Зона отдыха · пример</dd></dl><Concept><p>Изменение данных точки</p></Concept></section>
              <section className={styles.card}><h3>Лицензия: нет подтверждённых данных</h3><p>Макет не проверяет документы и не подтверждает право публичного использования музыки.</p><Concept><p>Документ, срок и территория использования. Загрузка документа — после подключения реального источника.</p></Concept></section>
            </>}
            {screen === "help" && <>
              <section className={styles.card}><h3>Если музыка не слышна</h3><ol className={styles.steps}><li>Проверьте колонки и громкость на устройстве точки.</li><li>Проверьте интернет на этом устройстве.</li><li>Откройте плеер на устройстве точки и посмотрите сообщение.</li></ol><button type="button" onClick={() => setScreen("player")}>Посмотреть макет плеера</button></section>
              <section className={styles.card}><h3>Помощь без лишних шагов</h3><details><summary>Что означает «нет подключения»?</summary><p>Связь потеряна. Это не доказывает ни звучание, ни остановку музыки. Для текущего онлайн-пилота нужен интернет.</p></details><details><summary>Почему лицензия не проверена?</summary><p>Здесь нет доступа к документам. Демонстрационный статус не является разрешением на использование музыки.</p></details><Concept><p>Связаться с поддержкой и передать диагностику. Заявка из макета не отправляется.</p></Concept></section>
            </>}
            {screen === "profile" && <section className={styles.card}><h3>Анна · вымышленный владелец</h3><dl><dt>Роль</dt><dd>Владелец одной SPA-точки · пример</dd><dt>Почта</dt><dd>owner@example.invalid · пример</dd></dl><Concept><p>Редактирование профиля и управление сеансом</p></Concept><p className={styles.hint}>Это карточка концепции профиля, данные вашей сессии сюда не передаются.</p></section>}
          </div>
          {(state === "offline" || state === "error" || state === "empty") && screen !== "help" && <button type="button" onClick={() => setScreen("help")}>Посмотреть помощь · макет</button>}
          <footer className={styles.footer}>Макет — не реальные данные · Применение дизайна ожидает согласования Сергея</footer>
        </div>
      </div>
    </section>
  );
}
