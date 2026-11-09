import Link from "next/link";

/**
 * «Музыка» on a hall device whose venue cannot be read (t1299u, Sergey 09.11.2026): the device
 * cookie was revoked from the owner's phone, or the check failed. Never the guest demo here –
 * only the existing ways back: a new code on /point, a reload, «Помощь».
 */
export default function BusinessHallReconnect({ revoked }: { revoked: boolean }) {
  return (
    <section
      className="business-app-card mx-auto max-w-xl space-y-3"
      data-testid="biz-hall-reconnect"
      data-kind={revoked ? "revoked" : "unknown"}
    >
      <h1 className="text-[1.75rem] font-bold text-[var(--biz-text)]">
        {revoked ? "Устройство отключено от заведения" : "Не удалось открыть плеер зала"}
      </h1>
      <p className="text-sm leading-6 text-[var(--biz-text-muted)]">
        {revoked
          ? "Чтобы музыка снова играла, подключите устройство заново: на телефоне владельца откройте «Устройство в зале» и нажмите «Получить код для устройства»."
          : "Проверьте интернет и обновите страницу. Если не помогло – подключите устройство заново по коду с телефона владельца."}
      </p>
      <div className="flex flex-wrap gap-2">
        {revoked ? null : (
          <a href="/music" className="business-app-btn business-app-btn-primary business-app-focus-ring" data-testid="biz-hall-reconnect-reload">
            Обновить
          </a>
        )}
        <Link
          href="/point"
          prefetch={false}
          className={`business-app-btn ${revoked ? "business-app-btn-primary" : "business-app-btn-secondary"} business-app-focus-ring`}
          data-testid="biz-hall-reconnect-join"
        >
          Подключить устройство
        </Link>
        <Link href="/help" prefetch={false} className="business-app-btn business-app-btn-secondary business-app-focus-ring">
          Помощь
        </Link>
      </div>
    </section>
  );
}
