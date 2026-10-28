"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createContext, useContext, type ReactNode } from "react";

import { BUSINESS_BRAND_MARK_PATH, BUSINESS_BRAND_NAME } from "@/lib/business-app/brand-icons";
import { selectAuthVariant, type AuthVariant } from "./variant";
import styles from "./business-auth.module.css";

const AuthHostnameContext = createContext("");

export function AuthHostnameProvider({ hostname, children }: { hostname: string; children: ReactNode }) {
  return <AuthHostnameContext.Provider value={hostname}>{children}</AuthHostnameContext.Provider>;
}

export function useAuthVariant(): AuthVariant {
  const params = useSearchParams();
  const hostname = useContext(AuthHostnameContext);
  return selectAuthVariant({ next: params.get("next"), from: params.get("from"), hostname });
}

export function AuthFrame({ variant, children }: { variant: AuthVariant; children: ReactNode }) {
  return (
    <main
      className={variant === "business" ? styles.business : "min-h-screen bg-platform-surface text-[#25135c]"}
    >
      {children}
    </main>
  );
}

export function AuthBrand({ variant }: { variant: AuthVariant }) {
  if (variant === "ordinary") {
    return (
      <Link href="/" className="text-[30px] font-semibold text-[#7042c5]">
        АудиоЛад
      </Link>
    );
  }

  return (
    <Link href="/" className={styles.brand}>
      <Image src={BUSINESS_BRAND_MARK_PATH} alt="" width={80} height={80} priority unoptimized />
      <span>{BUSINESS_BRAND_NAME}</span>
    </Link>
  );
}
