"use client";

import { useState } from "react";

import type { GuideCup } from "@/lib/business/vertical-guides/types";

type GuideFourCupsProps = {
  cups: readonly GuideCup[];
  question: string;
};

export default function GuideFourCups({ cups, question }: GuideFourCupsProps) {
  const [active, setActive] = useState(0);
  const current = cups[active] ?? cups[0];

  return (
    <div className="guide-cups" data-coffee-cups="true">
      <p className="guide-question">{question}</p>
      <div className="guide-cups__tabs" role="tablist" aria-label="Четыре чашки">
        {cups.map((cup, index) => {
          const selected = index === active;
          return (
            <button
              key={cup.id}
              type="button"
              role="tab"
              id={`guide-cup-tab-${cup.id}`}
              aria-selected={selected}
              aria-controls={`guide-cup-panel-${cup.id}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? "guide-cup is-active" : "guide-cup"}
              onClick={() => setActive(index)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
                  return;
                }
                event.preventDefault();
                const direction = event.key === "ArrowRight" ? 1 : -1;
                const next = (index + direction + cups.length) % cups.length;
                setActive(next);
                const tab = document.getElementById(`guide-cup-tab-${cups[next]?.id}`);
                tab?.focus();
              }}
            >
              <span className="guide-cup__mark" aria-hidden="true">
                {index + 1}
              </span>
              <span>{cup.title}</span>
            </button>
          );
        })}
      </div>
      {current ? (
        <div
          className="guide-cups__panel"
          role="tabpanel"
          id={`guide-cup-panel-${current.id}`}
          aria-labelledby={`guide-cup-tab-${current.id}`}
        >
          <p className="guide-kicker">Чашка {active + 1} из {cups.length}</p>
          <h3 className="guide-display guide-h3">{current.title}</h3>
          <p>{current.text}</p>
        </div>
      ) : null}
    </div>
  );
}
