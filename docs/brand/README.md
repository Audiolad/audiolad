# Classic AudioLad icon (violet lotus)

Owner-approved mark for audiolad.ru: a white lotus with a treble clef on a full-bleed violet field (`#7711D3`).

Rebuild the public icon set from the source:

```bash
python3 docs/brand/render_icons.py
```

`render_icons.py` (without `--all`) writes only the rounded assets: favicon.ico/png, icon.svg, apple-icon.svg, and the PWA `purpose=any` files `icon-any-192.png` / `icon-any-512.png`. Those have a 20% corner radius and a transparent outside (t1424u), so the browser tab and the Android splash show a rounded square.

Full-bleed square assets stay as they are, because other surfaces depend on them:

- `apple-touch-icon.png` — iOS applies its own mask on the home screen
- `icon-192.png`, `icon-512.png`, `icon-1024.png`, `master-logo-icon.png` — Open Graph and other square uses (do not give these a transparent outside)
- `icon-maskable-512.png` — the OS masks the home-screen icon; keep the mark in the 80% safe zone

Pass `--all` only when you also need to rebuild that full-bleed set from the source.

Then bump `CLASSIC_BRAND_ICON_VERSION` in `src/lib/business-app/brand-icons.ts` and the `?v=` query on icons in `public/manifest.webmanifest`. New `any` icon files also cache-bust by filename.

This set is not used on business.audiolad.ru or coffee.audiolad.ru: those hosts keep the leather lotus in `public/business/brand/`.
