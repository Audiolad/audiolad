# AudioLad Business — icon set (espresso on cream)

Icons for `business.audiolad.ru` live in `public/business/brand/`
(audiolad.ru keeps its own icons in `public/`, unchanged).

**Source:** the original AudioLad mark `public/master-logo-icon.png` (1254×1254,
white mark on dark purple — the same artwork as the audiolad.ru icons).
The mark is **not redrawn**: `render_icons.py` recovers its coverage exactly from
the white-on-dark original and recolours it — strictly two colours, no gradients:

- mark: `--biz-espresso #2b1d14`
- background: `--biz-cream #f7f1e8` (opaque, full-bleed)

Every file is only a uniform Lanczos downscale of the original (antialiased edges are
blends of the two colours); the geometry and proportions match `master-logo-icon.png`.

| File | Notes |
| --- | --- |
| `icon-512.png`, `icon-192.png` | manifest `purpose: any` |
| `icon-maskable-512.png` | manifest `purpose: maskable`; whole mark scaled uniformly to 80 % and centred (inside the 0.4·N safe-zone circle) |
| `apple-touch-icon.png` | 180×180, opaque |
| `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png` | |
| `favicon.ico` | embeds the three favicon PNGs byte-for-byte (16/32/48) |

Regenerate (repo root, needs Python 3 with Pillow + numpy; output is deterministic):

```sh
python3 docs/business/brand-icons/render_icons.py
npm run test:business-brand-icons
```

`scripts/business-brand-icons-unit.mjs` checks sizes, opacity, the two-colour palette,
the maskable safe zone, the `.ico` contents and that no file equals an audiolad.ru icon.
