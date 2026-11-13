"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

import { clearCatalogReturnSnapshot } from "@/lib/catalog/return-state";

/** Sign-out form that also erases the catalog return snapshot of this tab. */
export default function SignOutForm({
  action,
  children,
  anonymousWarning = false,
  saveAccessHref = "/profile#biz-profile-login",
}: {
  action: () => Promise<void>;
  children: ReactNode;
  anonymousWarning?: boolean;
  saveAccessHref?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (anonymousWarning && !confirming) {
          event.preventDefault();
          setConfirming(true);
          return;
        }
        try {
          clearCatalogReturnSnapshot(window.sessionStorage);
        } catch {
          // ignore
        }
      }}
    >
      {anonymousWarning && confirming ? <div role="alertdialog" aria-label="Сохраните доступ" className="space-y-3">
        <p>Вы вошли без почты – после выхода вернуться в этот кабинет будет нельзя. Сначала сохраните почту для входа.</p>
        <Link className="business-app-btn business-app-btn-primary" href={saveAccessHref}>Сохранить доступ</Link>
        <button type="submit" className="business-app-btn business-app-btn-secondary">Всё равно выйти</button>
      </div> : children}
    </form>
  );
}
