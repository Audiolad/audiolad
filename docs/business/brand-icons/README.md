# AudioLad Business — icon set (leather lotus)

Icons for `business.audiolad.ru` live in `public/business/brand/`
(audiolad.ru keeps its own icons in `public/`, unchanged).

**Source:** `public/business/brand/favicon.svg` — a lotus whose central petal
forms a treble clef, traced as line art from the approved embossed-leather mark.
The SVG is the only vector (under 5 KB). Rasters are rendered from it:

- mark: leather `#3d2618`
- background: cream `#f7f1e8` (opaque, full-bleed, same as `--biz-bg`)

Antialiased edges are blends of those two colours. 16 and 32 px icons use a
thickened trace so the flower still reads. No leather photograph is shipped.

| File | Notes |
| --- | --- |
| `favicon.svg` | vector mark, also the cabinet brand slot |
| `icon-512.png`, `icon-192.png` | manifest `purpose: any` |
| `icon-maskable-512.png` | manifest `purpose: maskable`; mark scaled to 76 % and centred (inside the 0.4·N safe-zone circle) |
| `apple-touch-icon.png` | 180×180, opaque |
| `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png` | |
| `favicon.ico` | embeds the three favicon PNGs byte-for-byte (16/32/48) |

Regenerate (repo root; needs `rsvg-convert`, `pngquant`, `optipng`, Pillow, numpy):

```sh
python3 docs/business/brand-icons/render_icons.py
npm run test:business-brand-icons
```

`scripts/business-brand-icons-unit.mjs` checks sizes, opacity, the two-colour palette,
the maskable safe zone, the `.ico` contents and that no file equals an audiolad.ru icon.
