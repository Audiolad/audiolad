# Classic AudioLad icon (violet lotus)

Owner-approved mark for audiolad.ru: a white lotus with a treble clef on a full-bleed violet field (`#7711D3`).

Rebuild the public icon set from the source:

```bash
python3 docs/brand/render_icons.py
```

Then bump `CLASSIC_BRAND_ICON_VERSION` in `src/lib/business-app/brand-icons.ts` and the `?v=` query on icons in `public/manifest.webmanifest`.

This set is not used on business.audiolad.ru or coffee.audiolad.ru: those hosts keep the leather lotus in `public/business/brand/`.
