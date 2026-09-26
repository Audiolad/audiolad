"use client";

import { useState } from "react";
import Link from "next/link";

import BusinessListenRail from "@/components/business/BusinessListenRail";
import HomeProductPlayButton from "@/components/home/HomeProductPlayButton";
import {
  BUSINESS_ATMOSPHERES,
  BUSINESS_FORMATS,
  BUSINESS_LISTEN_LEAD,
  BUSINESS_LISTEN_MATCHED,
  BUSINESS_LISTEN_PLAY,
} from "@/lib/business/landing";
import type { BusinessListenExample } from "@/lib/business/listen-selection";

type BusinessListenStudioProps = {
  items: BusinessListenExample[];
};

export default function BusinessListenStudio({ items }: BusinessListenStudioProps) {
  const [formatId, setFormatId] = useState("beauty");
  const [atmosphere, setAtmosphere] = useState<string>(BUSINESS_ATMOSPHERES[1]);
  const format =
    BUSINESS_FORMATS.find((item) => item.id === formatId) ?? BUSINESS_FORMATS[2];
  const first = items[0];

  return (
    <>
      <p className="business-lead">{BUSINESS_LISTEN_LEAD}</p>
      <fieldset className="business-fieldset">
        <legend className="business-kicker">Ваш бизнес</legend>
        <div className="business-chips">
          {BUSINESS_FORMATS.map((item) => (
            <label key={item.id} className="business-chip">
              <input
                type="radio"
                name="business-format"
                checked={item.id === format.id}
                onChange={() => setFormatId(item.id)}
              />
              <span>{item.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="business-fieldset">
        <legend className="business-kicker">Атмосфера</legend>
        <div className="business-chips">
          {BUSINESS_ATMOSPHERES.map((item) => (
            <label key={item} className="business-chip">
              <input
                type="radio"
                name="business-atmosphere"
                checked={item === atmosphere}
                onChange={() => setAtmosphere(item)}
              />
              <span>{item}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="business-scenario" data-business-listen-scenario="true">
        <p className="business-scenario__pair">
          {format.name} · {atmosphere}
        </p>
        <p className="business-scenario__lead">{BUSINESS_LISTEN_MATCHED}</p>
        <div className="business-actions">
          {first ? (
            <HomeProductPlayButton
              practiceId={first.id}
              authorSlug={first.authorSlug}
              productSlug={first.slug}
              ariaLabel={`${BUSINESS_LISTEN_PLAY}: ${first.title}`}
              className="business-btn business-btn--primary"
            >
              ▶ {BUSINESS_LISTEN_PLAY}
            </HomeProductPlayButton>
          ) : (
            <Link href="/catalog" className="business-btn business-btn--primary">
              ▶ {BUSINESS_LISTEN_PLAY}
            </Link>
          )}
        </div>
      </div>
      <div className="mt-6" id="listen-now">
        <BusinessListenRail items={items} />
      </div>
    </>
  );
}
