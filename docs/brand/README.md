# Classic AudioLad icon (violet lotus)

Owner-approved mark for audiolad.ru: a white lotus with a treble clef on a full-bleed violet field (`#7711D3`).

Rebuild the public icon set from the source:

```bash
python3 docs/brand/render_icons.py
```

Then bump `CLASSIC_BRAND_ICON_VERSION` in `src/lib/business-app/brand-icons.ts` and the `?v=` query on icons in `public/manifest.webmanifest`.

Rebuild the ordinary AudioLad logos, wordmarks and default author avatar (same source; lettering comes from `docs/brand/wordmark-masters/`):

```bash
python3 docs/brand/render_logos.py
```

This writes:

- `public/audiolad-logo.png` – JSON-LD Organization / search logo
- `public/brand/author-default-avatar.png` – fallback author avatar
- `public/brand/audiolad-fallback-mark.png` – library cover and collapsed sidebar mark
- `public/brand/audiolad-logo-horizontal.png` – header, footer and email wordmark
- `public/brand/audiolad-logo-light.webp` – studio wordmark on a dark ground
- `public/brand/audiolad-logo-sidebar-v2.webp` and `audiolad-logo-sidebar.png`

Do not overwrite the files in `docs/brand/wordmark-masters/`. After changing the email wordmark file, bump `CLASSIC_WORDMARK_VERSION` in `src/lib/brand/classic-logos.ts` (this query is for raw `<img>` URLs in letters only; do not put it on `next/image` sources).

This set is not used on business.audiolad.ru or coffee.audiolad.ru: those hosts keep the leather lotus in `public/business/brand/`.
