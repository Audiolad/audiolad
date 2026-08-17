"use client";

import Link from "next/link";
import { useEffect } from "react";

import { buildAuthRouteHref } from "@/lib/auth/routes";
import { trackGuestStudioEvent } from "@/lib/studio/guest-analytics";

const NEXT_PATH = "/studio/projects";

export function StudioGuestAuthLinks({
  className = "",
}: {
  className?: string;
}) {
  const signInHref = buildAuthRouteHref("/auth/sign-in", NEXT_PATH);
  const signUpHref = buildAuthRouteHref("/auth/sign-up", NEXT_PATH);
  return (
    <div className={`flex flex-wrap gap-2 ${className}`.trim()}>
      <Link
        href={signInHref}
        onClick={() => {
          void trackGuestStudioEvent("guest_auth_cta_clicked", NEXT_PATH, {
            cta: "sign_in",
          });
        }}
        className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#7051ae] px-4 text-sm font-semibold text-white"
      >
        Войти
      </Link>
      <Link
        href={signUpHref}
        onClick={() => {
          void trackGuestStudioEvent("guest_auth_cta_clicked", NEXT_PATH, {
            cta: "sign_up",
          });
        }}
        className="inline-flex min-h-10 items-center justify-center rounded-full border border-white/25 px-4 text-sm font-semibold text-white"
      >
        Зарегистрироваться
      </Link>
    </div>
  );
}

export function StudioGuestProjectLimitGate() {
  useEffect(() => {
    void trackGuestStudioEvent("guest_registration_gate_shown", NEXT_PATH, {
      reason: "project_limit",
    });
  }, []);
  return (
    <section
      role="status"
      className="rounded-2xl border border-[#9074c7]/50 bg-[#21133d] p-5"
    >
      <p className="text-sm leading-6 text-[#ddd2f5]">
        Чтобы создавать больше проектов, войдите или зарегистрируйтесь.
      </p>
      <StudioGuestAuthLinks className="mt-4" />
    </section>
  );
}

export function StudioGuestRenderGate({
  compact = false,
}: {
  compact?: boolean;
}) {
  useEffect(() => {
    void trackGuestStudioEvent("guest_registration_gate_shown", NEXT_PATH, {
      reason: "render_entitlement",
    });
  }, []);
  return (
    <section
      role="status"
      className={
        compact
          ? "rounded-lg border border-[#9074c7]/45 bg-[#1a1430] px-4 py-3"
          : "rounded-2xl border border-[#9074c7]/50 bg-[#21133d] p-5"
      }
    >
      <p className="text-sm leading-6 text-[#ddd2f5]">
        Хотите продолжить работу в Студии? Войдите или зарегистрируйтесь, чтобы
        создавать новые проекты и MP3.
      </p>
      <StudioGuestAuthLinks className="mt-3" />
    </section>
  );
}
