import Link from "next/link";
import type { ReactNode } from "react";

type ProductionShellProps = {
  title: string;
  subtitle?: string;
  canAdmin: boolean;
  children: ReactNode;
};

const linkClass = "text-sm font-medium text-[#7042c5]";

export default function ProductionShell({
  title,
  subtitle,
  canAdmin,
  children,
}: ProductionShellProps) {
  return (
    <main className="min-h-screen bg-[#f7f4fb] text-[#25135c]">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-[#796ba0]">АудиоЛад Classica</p>
            <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-[#796ba0]">{subtitle}</p> : null}
          </div>
          <nav className="flex flex-wrap gap-3">
            <Link className={linkClass} href="/classica/production">
              Очередь
            </Link>
            <Link className={linkClass} href="/classica/production/stats">
              Статистика
            </Link>
            {canAdmin ? (
              <>
                <Link className={linkClass} href="/classica/production/new">
                  Новая работа
                </Link>
                <Link className={linkClass} href="/classica/production/prompt">
                  Промпт
                </Link>
                <Link className={linkClass} href="/classica/production/team">
                  Роли
                </Link>
              </>
            ) : null}
          </nav>
        </header>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
