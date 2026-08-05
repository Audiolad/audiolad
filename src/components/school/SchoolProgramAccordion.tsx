"use client";

import { useId, useState } from "react";

export type SchoolProgramModule = {
  id: string;
  kind: "module" | "bonus";
  label: string;
  title: string;
  result: string;
  learn: readonly string[];
};

type SchoolProgramAccordionProps = {
  modules: readonly SchoolProgramModule[];
};

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 7.5 10 12.5 15 7.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SchoolProgramAccordion({
  modules,
}: SchoolProgramAccordionProps) {
  const baseId = useId();
  const [openId, setOpenId] = useState<string | null>(modules[0]?.id ?? null);

  function toggle(id: string) {
    setOpenId((current) => (current === id ? null : id));
  }

  return (
    <div className="school-program__modules">
      {modules.map((module) => {
        const panelId = `${baseId}-${module.id}-panel`;
        const headerId = `${baseId}-${module.id}-header`;
        const isOpen = openId === module.id;
        const isBonus = module.kind === "bonus";

        return (
          <article
            key={module.id}
            className={
              isBonus
                ? "school-program__module school-program__module--bonus"
                : "school-program__module"
            }
          >
            <h3 className="school-program__module-heading">
              <button
                type="button"
                id={headerId}
                className="school-program__module-trigger"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(module.id)}
              >
                <span className="school-program__module-trigger-main">
                  <span className="school-program__module-label">
                    {module.kind === "module" ? (
                      <>
                        Модуль{" "}
                        <span className="school-number">
                          {module.label.replace(/^Модуль\s+/, "")}
                        </span>
                      </>
                    ) : (
                      module.label
                    )}
                  </span>
                  <span className="school-program__module-title">
                    {module.title}
                  </span>
                  <span className="school-program__module-result">
                    {module.result}
                  </span>
                </span>
                <span
                  className={
                    isOpen
                      ? "school-program__module-chevron school-program__module-chevron--open"
                      : "school-program__module-chevron"
                  }
                  aria-hidden="true"
                >
                  <ChevronIcon className="school-program__module-chevron-icon" />
                </span>
              </button>
            </h3>

            <div
              id={panelId}
              role="region"
              aria-labelledby={headerId}
              hidden={!isOpen}
              className="school-program__module-panel"
            >
              <p className="school-program__learn-lead">Что вы узнаете</p>
              <ul className="school-program__learn-list">
                {module.learn.map((item) => (
                  <li key={item} className="school-program__learn-item">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        );
      })}
    </div>
  );
}
