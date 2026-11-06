"use client";

import { createContext, useContext, type ReactNode } from "react";
import Link from "next/link";

import BottomNav from "@/components/BottomNav";

const CoffeeAuthContext = createContext(false);

export function CoffeeAuthProvider({ children }: { children: ReactNode }) {
  return (
    <CoffeeAuthContext.Provider value={true}>
      <div className="business-auth-root" data-biz-theme="jazz-coffee">{children}</div>
    </CoffeeAuthContext.Provider>
  );
}

export function useCoffeeAuth(): boolean {
  return useContext(CoffeeAuthContext);
}

/** Keep platform-only navigation out of the coffee auth flow, including SSR. */
export default function AuthBottomNav() {
  const coffee = useCoffeeAuth();
  if (!coffee) return <BottomNav />;

  return (
    <nav aria-label="Основная навигация" className="bottom-nav bottom-nav--default border-t border-[var(--biz-border,#eadff8)]">
      <div className="mx-auto flex min-h-[68px] max-w-[430px] items-center justify-around text-sm">
        <Link href="/">Главная</Link>
        <Link href="/cabinet">Кабинет</Link>
        <Link href="/documents">Документы</Link>
      </div>
    </nav>
  );
}
