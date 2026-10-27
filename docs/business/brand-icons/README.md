# AudioLad Business — icon set (leather lotus)

Icons for `business.audiolad.ru` live in `public/business/brand/`
(audiolad.ru keeps its own icons in `public/`, unchanged).

**Source:** the owner-approved mark `docs/business/brand-icons/leather-lotus-source.jpg`
(a lotus with a treble clef embossed on brown leather). The artwork is not redrawn.
`render_icons.py` takes a centered square crop and downscales it with Lanczos.

| File | Notes |
| --- | --- |
| `icon-512.png`, `icon-192.png` | manifest `purpose: any`. 512 is an opaque palette PNG so the photograph stays small |
| `icon-512.webp`, `icon-192.webp` | same pixels, WebP |
| `icon-maskable-512.png` | manifest `purpose: maskable`. The crop is scaled to 80 % and centred on a soft leather field so the lotus sits inside the safe zone |
| `icon-maskable-512.webp` | same pixels, WebP |
| `apple-touch-icon.png` | 180×180, opaque |
| `apple-touch-icon.webp` | same pixels, WebP |
| `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png` | opaque RGB |
| `favicon.ico` | embeds the three favicon PNGs byte-for-byte (16/32/48) |
| `mark-leather.webp` | in-app circle (CSS `border-radius: 50%`), under 60 KB |

HTML and the manifest request these files with `?v=leather1` (`BUSINESS_BRAND_ICON_VERSION`)
so a browser that cached the previous cream mark fetches the leather set.
The in-app file name `mark-leather.webp` is new for the same reason.

Regenerate (repo root, needs Python 3 with Pillow; output is deterministic):

```sh
python3 docs/business/brand-icons/render_icons.py
npm run test:business-brand-icons
```

`scripts/business-brand-icons-unit.mjs` checks sizes, opacity, leather corners (not the
old cream field), the maskable soft pad, the `.ico` contents, the cabinet lockup, and
that no file equals an audiolad.ru icon.
