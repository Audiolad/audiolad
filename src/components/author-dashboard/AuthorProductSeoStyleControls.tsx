"use client";

import { useState } from "react";

import {
  applyProductSeoStylePreset,
  PRODUCT_SEO_STYLE_PRESET_LABELS,
  PRODUCT_SEO_STYLE_PRESETS,
  PRODUCT_SEO_STYLE_VARIETY_LABELS,
  PRODUCT_SEO_STYLE_VARIETIES,
  withCustomStyleSliders,
  type ProductSeoStylePreset,
  type ProductSeoStyleProfile,
  type ProductSeoStyleVariety,
} from "@/lib/seo/product-autofill/style-profile";
import {
  PRODUCT_SEO_STYLE_ADVANCED_CTA,
  PRODUCT_SEO_STYLE_LABEL,
  PRODUCT_SEO_STYLE_SLIDER_LABELS,
  PRODUCT_SEO_STYLE_VARIETY_LABEL,
} from "@/lib/seo/product-autofill/ui";

export type AuthorProductSeoStyleControlsProps = {
  profile: ProductSeoStyleProfile;
  onChange: (profile: ProductSeoStyleProfile) => void;
  disabled?: boolean;
};

function StyleSlider({
  label,
  low,
  high,
  value,
  disabled,
  onChange,
}: {
  label: string;
  low: string;
  high: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 block text-sm font-medium text-[#2b2140]">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[#7042c5] disabled:cursor-not-allowed disabled:opacity-60"
      />
      <span className="mt-1 flex justify-between text-xs text-[#7d70a2]">
        <span>{low}</span>
        <span>{high}</span>
      </span>
    </label>
  );
}

export default function AuthorProductSeoStyleControls({
  profile,
  onChange,
  disabled = false,
}: AuthorProductSeoStyleControlsProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const namedPresets = PRODUCT_SEO_STYLE_PRESETS.filter(
    (preset) => preset !== "custom",
  );

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1">
          <span className="mb-1 block text-sm font-medium text-[#2b2140]">
            {PRODUCT_SEO_STYLE_LABEL}
          </span>
          <select
            value={profile.preset}
            disabled={disabled}
            aria-label={PRODUCT_SEO_STYLE_LABEL}
            onChange={(event) => {
              const next = event.target.value as ProductSeoStylePreset;
              if (next === "custom") {
                onChange({ ...profile, preset: "custom" });
                return;
              }
              onChange(applyProductSeoStylePreset(next, profile.variety));
            }}
            className="w-full rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {namedPresets.map((preset) => (
              <option key={preset} value={preset}>
                {PRODUCT_SEO_STYLE_PRESET_LABELS[preset]}
              </option>
            ))}
            {profile.preset === "custom" ? (
              <option value="custom">
                {PRODUCT_SEO_STYLE_PRESET_LABELS.custom}
              </option>
            ) : null}
          </select>
        </label>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={advancedOpen}
          onClick={() => setAdvancedOpen((current) => !current)}
          className="rounded-full border border-[#d4c4ee] bg-white px-3 py-2 text-sm text-[#4d336f] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {PRODUCT_SEO_STYLE_ADVANCED_CTA}
        </button>
      </div>
      <label className="mt-3 block max-w-[16rem]">
        <span className="mb-1 block text-sm font-medium text-[#2b2140]">
          {PRODUCT_SEO_STYLE_VARIETY_LABEL}
        </span>
        <select
          value={profile.variety}
          disabled={disabled}
          aria-label={PRODUCT_SEO_STYLE_VARIETY_LABEL}
          onChange={(event) =>
            onChange({
              ...profile,
              variety: event.target.value as ProductSeoStyleVariety,
            })
          }
          className="w-full rounded-[14px] border border-[#e4d7f4] bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {PRODUCT_SEO_STYLE_VARIETIES.map((variety) => (
            <option key={variety} value={variety}>
              {PRODUCT_SEO_STYLE_VARIETY_LABELS[variety]}
            </option>
          ))}
        </select>
      </label>
      {advancedOpen ? (
        <div className="mt-2 rounded-[14px] border border-[#eee4f8] bg-[#fcf8ff] px-3 py-3">
          <StyleSlider
            label={PRODUCT_SEO_STYLE_SLIDER_LABELS.warmth.name}
            low={PRODUCT_SEO_STYLE_SLIDER_LABELS.warmth.low}
            high={PRODUCT_SEO_STYLE_SLIDER_LABELS.warmth.high}
            value={profile.warmth}
            disabled={disabled}
            onChange={(warmth) =>
              onChange(withCustomStyleSliders(profile, { warmth }))
            }
          />
          <StyleSlider
            label={PRODUCT_SEO_STYLE_SLIDER_LABELS.expertise.name}
            low={PRODUCT_SEO_STYLE_SLIDER_LABELS.expertise.low}
            high={PRODUCT_SEO_STYLE_SLIDER_LABELS.expertise.high}
            value={profile.expertise}
            disabled={disabled}
            onChange={(expertise) =>
              onChange(withCustomStyleSliders(profile, { expertise }))
            }
          />
          <StyleSlider
            label={PRODUCT_SEO_STYLE_SLIDER_LABELS.conversational.name}
            low={PRODUCT_SEO_STYLE_SLIDER_LABELS.conversational.low}
            high={PRODUCT_SEO_STYLE_SLIDER_LABELS.conversational.high}
            value={profile.conversational}
            disabled={disabled}
            onChange={(conversational) =>
              onChange(withCustomStyleSliders(profile, { conversational }))
            }
          />
          <StyleSlider
            label={PRODUCT_SEO_STYLE_SLIDER_LABELS.expressiveness.name}
            low={PRODUCT_SEO_STYLE_SLIDER_LABELS.expressiveness.low}
            high={PRODUCT_SEO_STYLE_SLIDER_LABELS.expressiveness.high}
            value={profile.expressiveness}
            disabled={disabled}
            onChange={(expressiveness) =>
              onChange(withCustomStyleSliders(profile, { expressiveness }))
            }
          />
        </div>
      ) : null}
    </div>
  );
}
