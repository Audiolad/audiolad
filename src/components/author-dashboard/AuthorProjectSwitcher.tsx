"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import AuthorProjectCapacityOfferDialog from "@/components/author-dashboard/AuthorProjectCapacityOfferDialog";
import type { AuthorWorkspace } from "@/lib/author-products/types";
import { setAuthorProjectCookieClient } from "@/lib/author-projects/selection";

type ProjectsApiResponse = {
  projects?: AuthorWorkspace[];
  can_create?: boolean;
  show_premium_upsell?: boolean;
  show_capacity_offer?: boolean;
  owned_count?: number;
  limit?: number;
  unlimited?: boolean;
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
  const [ownedCount, setOwnedCount] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [unlimited, setUnlimited] = useState(false);
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
          setOwnedCount(
            typeof payload.owned_count === "number" ? payload.owned_count : null,
          );
          setLimit(typeof payload.limit === "number" ? payload.limit : null);
          setUnlimited(payload.unlimited === true);
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
    <div
      ref={rootRef}
      className="flex flex-col gap-3 sm:flex-row sm:items-stretch"
    >
      <div className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex h-full w-full min-w-0 items-center justify-between gap-3 rounded-[18px] border border-[#e4d7f4] bg-white px-4 py-3 text-left shadow-[0_6px_16px_rgba(91,62,145,0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5]"
      >
        <span className="min-w-0">
          <span className="block text-xs font-medium text-[#7d70a2]">
            Текущий проект
          </span>
          <span className="mt-0.5 block truncate text-[15px] font-semibold text-[#25135c]">
            {activeProject.name}
          </span>
          {ownedCount != null && unlimited ? (
            <span className="mt-0.5 block text-xs text-[#8a7daf]">
              Лимит проектов: Безлимит
            </span>
          ) : ownedCount != null && limit != null ? (
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
        </div>
      ) : null}
      </div>

      <button
        type="button"
        onClick={handleCreateClick}
        className="inline-flex min-h-12 w-full shrink-0 items-center justify-center rounded-[22px] bg-[#7042c5] px-5 py-3 text-center text-sm font-semibold leading-5 text-white shadow-[0_10px_24px_rgba(112,66,197,0.28)] transition hover:bg-[#5e32ad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7042c5] sm:w-auto sm:max-w-[18rem] sm:self-center"
      >
        Создать новый проект (новый артист)
      </button>

      <AuthorProjectCapacityOfferDialog
        open={upsellOpen}
        onClose={() => setUpsellOpen(false)}
        surface="author_project_switcher"
      />
    </div>
  );
}
