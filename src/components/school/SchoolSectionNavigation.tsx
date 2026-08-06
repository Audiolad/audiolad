"use client";

import {
  useCallback,
  useEffect,
  useState,
  type MouseEvent,
} from "react";

const NAV_ITEMS = [
  { id: "program", label: "Программа" },
  { id: "author", label: "Об авторе" },
  { id: "tariffs", label: "Варианты" },
  { id: "bonuses", label: "Бонусы" },
  { id: "testimonials", label: "Отзывы" },
] as const;

type NavId = (typeof NAV_ITEMS)[number]["id"];

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }

  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollToSection(id: NavId): void {
  const target = document.getElementById(id);
  if (!target) {
    return;
  }

  target.scrollIntoView({
    behavior: prefersReducedMotion() ? "auto" : "smooth",
    block: "start",
  });

  window.history.replaceState(null, "", `#${id}`);
}

function readInitialNavId(): NavId | null {
  if (typeof window === "undefined") {
    return null;
  }

  const hash = window.location.hash.replace(/^#/, "");
  return NAV_ITEMS.some((item) => item.id === hash) ? (hash as NavId) : null;
}

export default function SchoolSectionNavigation() {
  const [activeId, setActiveId] = useState<NavId | null>(readInitialNavId);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, id: NavId) => {
      event.preventDefault();
      setActiveId(id);
      scrollToSection(id);
    },
    [],
  );

  useEffect(() => {
    const sections = NAV_ITEMS.map((item) =>
      document.getElementById(item.id),
    ).filter((node): node is HTMLElement => Boolean(node));

    if (sections.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              left.boundingClientRect.top - right.boundingClientRect.top,
          );

        const nextId = visible[0]?.target.id;
        if (nextId && NAV_ITEMS.some((item) => item.id === nextId)) {
          setActiveId(nextId as NavId);
        }
      },
      {
        // Sticky nav height (~3.5rem) + breathing room; keep lower half less dominant.
        rootMargin: "-4.25rem 0px -55% 0px",
        threshold: [0, 0.15, 0.35],
      },
    );

    for (const section of sections) {
      observer.observe(section);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <nav className="school-section-nav" aria-label="Разделы лендинга Школы">
      <div className="school-section-nav__inner">
        <ul className="school-section-nav__list">
          {NAV_ITEMS.map((item) => {
            const isActive = activeId === item.id;

            return (
              <li key={item.id} className="school-section-nav__item">
                <a
                  href={`#${item.id}`}
                  className={
                    isActive
                      ? "school-section-nav__link school-section-nav__link--active"
                      : "school-section-nav__link"
                  }
                  aria-current={isActive ? "location" : undefined}
                  onClick={(event) => handleClick(event, item.id)}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
