"use client";

import { useEffect, useState } from "react";

import { BUSINESS_ORIGIN } from "@/lib/business-app/host";
import { createClient } from "@/lib/supabase/client";

/**
 * t1442u: a guest cabinet («7 дней в подарок») has no email. Signing in or signing up from it
 * replaces that session for good, so the sign-in and sign-up pages warn first and link to the
 * profile section where the guest saves a login email.
 */
export default function AnonymousSessionNotice({ coffee }: { coffee: boolean }) {
  const [anonymous, setAnonymous] = useState(false);
  useEffect(() => {
    let alive = true;
    createClient().auth.getUser()
      .then(({ data }) => { if (alive) setAnonymous(data.user?.is_anonymous === true); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!anonymous) return null;
  const href = coffee ? "/profile#biz-profile-login" : `${BUSINESS_ORIGIN}/profile#biz-profile-login`;
  return (
    <div role="alert" className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="auth-anonymous-session-notice">
      <p>Сейчас открыт кабинет без почты. Если войти в другой аккаунт, вернуться в этот кабинет будет нельзя.</p>
      <a className="mt-2 inline-block font-semibold underline" href={href}>Сначала сохранить почту для входа</a>
    </div>
  );
}
