"use client";

import Link from "next/link";

import { useBusinessChromeAccess } from "@/components/business-app/BusinessAccessLine";
import { useBusinessDomain } from "@/components/business-app/BusinessDomainProvider";
import { useBusinessCabinetMode, useBusinessEntry } from "@/components/business-app/BusinessPointMode";
import PointDeviceControls from "@/components/business-app/PointDeviceControls";
import { hasLiveBusinessAccess, type BusinessChromeAccess } from "@/lib/access-grants/access-line";

/** The hall never discloses access dates or why renewal is needed. */
export function businessHallAccessNotice(access: BusinessChromeAccess | null): { kind: "expired" | "grace"; text: string } | null {
  if (!access) return null;
  if (access.mode === "grace") {
    return {
      kind: "grace",
      text: "Попросите владельца продлить доступ.",
    };
  }
  if (hasLiveBusinessAccess(access)) return null;
  return { kind: "expired", text: "Попросите владельца продлить доступ." };
}

/**
 * «Главная» of the venue side (cabinet-mode.ts): the hall device, or the owner's preview of it.
 * The venue name, a neutral access notice, the hall buttons and the way to music.
 */
export default function BusinessHallHome() {
  const cabinet = useBusinessCabinetMode();
  const { setEntry } = useBusinessEntry();
  const domain = useBusinessDomain();
  const access = useBusinessChromeAccess();
  const venueName =
    cabinet.mode === "point"
      ? cabinet.pointVenueName
      : domain.status === "authenticated"
        ? domain.location?.name ?? null
        : null;
  const notice = businessHallAccessNotice(access);

  return (
    <div className="mx-auto max-w-3xl" data-testid="biz-home" data-entry="venue" data-mode={cabinet.mode}>
      <header className="mb-5">
        <h1 className="text-[1.75rem] font-bold tracking-tight text-[var(--biz-text)] sm:text-[2rem]" data-testid="biz-home-title">
          {venueName?.trim() || "Кофейня"}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[1.05rem] leading-relaxed text-[var(--biz-text-muted)]">
          Музыка в зале.
        </p>
      </header>
      <div className="business-app-owner-home space-y-4">
        {notice ? (
          <section
            className="business-app-card business-app-hall-notice space-y-3"
            role="status"
            data-testid="biz-hall-access-notice"
            data-kind={notice.kind}
          >
            <p className="text-[1.05rem] font-semibold text-[var(--biz-text)]">{notice.text}</p>
            {cabinet.mode !== "point" ? (
              <Link
                href="/profile"
                prefetch={false}
                onClick={() => setEntry("person")}
                className="business-app-btn business-app-btn-cta business-app-focus-ring"
                data-testid="biz-hall-renew"
              >
                Продлить доступ
              </Link>
            ) : null}
          </section>
        ) : null}
        {cabinet.can("hallControls") ? <PointDeviceControls /> : null}
        <section className="business-app-card space-y-3" aria-label="Разделы">
          <div className="flex flex-wrap gap-2">
            <Link href="/music" className="business-app-btn business-app-btn-cta business-app-focus-ring" data-testid="biz-hall-music">
              Открыть музыку
            </Link>
            <Link href="/documents" className="business-app-btn business-app-btn-secondary business-app-focus-ring">
              Документы для проверки
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
