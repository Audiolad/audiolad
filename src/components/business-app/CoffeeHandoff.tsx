"use client";

import { useEffect } from "react";
import { COFFEE_ORIGIN } from "@/lib/business-app/host";
import { coffeeReturnPath } from "@/lib/business-app/guest-coffee/shared-identity";
import { migrateCoffeeSettings } from "@/lib/business-app/shared-coffee-storage";

export default function CoffeeHandoff({ next }: { next: string }) {
  const href = `${COFFEE_ORIGIN}${coffeeReturnPath(next)}`;
  useEffect(() => {
    try { migrateCoffeeSettings(); } catch { /* blocked storage: continue with server identity */ }
    window.location.replace(href);
  }, [href]);
  return <p>Открываем кофейню… <a href={href}>Продолжить</a></p>;
}
