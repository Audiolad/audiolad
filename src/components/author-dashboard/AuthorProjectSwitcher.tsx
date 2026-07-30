"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import type { AuthorWorkspace } from "@/lib/author-products/types";
import { setAuthorProjectCookieClient } from "@/lib/author-projects/selection";

type ProjectsApiResponse = {
  projects?: AuthorWorkspace[];
  can_create?: boolean;
  show_premium_upsell?: boolean;
  limit_message?: string | null;
  owned_count?: number;
  limit?: number;
  error?: string;
};

type AuthorProjectSwitcherProps = {
  currentSlug?: string;
};

export default function AuthorProjectSwitcher({
  currentSlug,
}: AuthorProjectSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<AuthorWorkspace[]>([]);
  const [canCreate, setCanCreate] = useState(true);
  const [showPremiumUpsell, setShowPremiumUpsell] = useState(false);
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [ownedCount, setOwnedCount] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [upsellOpen, setUpsellOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/author/projects", { cache: "no-store" });
        const payload = (await response.json()) as ProjectsApiResponse;
        if (!response.ok) {
          throw new Error(payload.error ?? "load_failed");
        }
        if (!cancelled) {
          setProjects(payload.projects ?? []);
          setCanCreate(payload.can_create !== false);
          setShowPremiumUpsell(payload.show_premium_upsell === true);
          setLimitMessage(payload.limit_message ?? null);
          setOwnedCount(
            typeof payload.owned_count === "number" ? payload.owned_count : null,
          );
          setLimit(typeof payload.limit === "number" ? payload.limit : null);
        }
      } catch {
        if (!cancelled) {
          setProjects([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setUpsellOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const activeSlug = currentSlug || searchParams.get("author") || projects[0]?.slug;
  const activeProject =
    projects.find((project) => project.slug === activeSlug) ?? projects[0] ?? null;

  function switchTo(slug: string) {
    setAuthorProjectCookieClient(slug);
    const params = new URLSearchParams(searchParams.toString());
    params.set("author", slug);
    const next = params.toString();
    setOpen(false);
    router.push(next ? `${pathname}?${next}` : pathname);
  }

  function handleCreateClick() {
    if (canCreate) {
      setOpen(false);
      router.push("/author-dashboard/projects/new");
      return;
    }

    setOpen(false);
    setUpsellOpen(true);
  }

  if (loading && projects.length === 0) {
    return (
      <div className="rounded-[18px] border border-[#eadff8] bg-white px-4 py-3 text-sm text-[#7d70a2]">
        Загрузка проектов…
      </div>
    );
  }

  if (!activeProject) {
    return null;
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full min-w-0 items-center justify-between gap-3 rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 text-left shadow-[0_6px_16px_rgba(91,62,145,0.04)]"
      >
        <span className="min-w-0">
          <span className="block text-xs font-medium text-[#7d70a2]">
            Текущий проект
          </span>
          <span className="mt-0.5 block truncate text-[15px] font-semibold text-[#25135c]">
            {activeProject.name}
          </span>
          {ownedCount != null && limit != null ? (
            <span className="mt-0.5 block text-xs text-[#8a7daf]">
              Лимит проектов: {ownedCount} из {limit}
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[#7042c5]" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-[18px] border border-[#eadff8] bg-white shadow-[0_16px_40px_rgba(61,40,102,0.14)]"
        >
          <p className="border-b border-[#f0e8fa] px-4 py-2 text-xs font-medium uppercase tracking-wide text-[#8a7daf]">
            Ваши проекты
          </p>
          <ul className="max-h-64 overflow-auto py-1">
            {projects.map((project) => {
              const selected = project.slug === activeProject.slug;
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => switchTo(project.slug)}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm ${
                      selected
                        ? "bg-[#f6f0ff] font-semibold text-[#7042c5]"
                        : "text-[#3f3560] hover:bg-[#faf6ff]"
                    }`}
                  >
                    <span className="truncate">{project.name}</span>
                    {selected ? <span aria-hidden="true">✓</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-[#f0e8fa] p-2">
            <button
              type="button"
              role="menuitem"
              onClick={handleCreateClick}
              className="flex w-full items-center rounded-[14px] px-3 py-2.5 text-left text-sm font-semibold text-[#7042c5] hover:bg-[#f6f0ff]"
            >
              + Создать проект
            </button>
          </div>
        </div>
      ) : null}

      {upsellOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${menuId}-upsell-title`}
          onClick={() => setUpsellOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-[24px] border border-[#eadff8] bg-white p-5 shadow-[0_24px_60px_rgba(40,20,80,0.22)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2
              id={`${menuId}-upsell-title`}
              className="text-[18px] font-semibold text-[#25135c]"
            >
              Лимит проектов
            </h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-[#5f5484]">
              {showPremiumUpsell
                ? [
                    "В базовом кабинете доступен один авторский проект.",
                    "В Premium можно создать до трёх проектов и управлять ими из одного аккаунта.",
                  ].join("\n")
                : limitMessage ?? "Лимит проектов исчерпан."}
            </p>
            {showPremiumUpsell ? (
              <div className="mt-4 rounded-[18px] border border-dashed border-[#d7c4f5] bg-[#faf6ff] px-4 py-3 text-sm text-[#7d70a2]">
                Покупка Premium пока недоступна. Администратор может увеличить
                лимит вручную.
              </div>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setUpsellOpen(false)}
                className="rounded-full bg-[#7042c5] px-4 py-2 text-sm font-semibold text-white"
              >
                Понятно
              </button>
              <Link
                href="/author-dashboard"
                className="rounded-full border border-[#c6afe6] px-4 py-2 text-sm font-semibold text-[#7042c5]"
                onClick={() => setUpsellOpen(false)}
              >
                В кабинет
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
