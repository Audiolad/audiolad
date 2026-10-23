# AudioLad Business — icon set (embossed lotus)

Icons for `business.audiolad.ru` live in `public/business/brand/`
(audiolad.ru keeps its own icons in `public/`, unchanged).

**Source:** `docs/business/brand-icons/lotus-source.webp` — a square crop of the
owner's embossed leather mark (five outer petals, treble clef in the tall
centre petal). That file is the regeneration source and is not shipped as a
favicon.

What is shipped:

- Header slot (40px): `mark-64` / `mark-128` as AVIF and WebP, with `mark-64.png` as the fallback. These are the photograph.
- 180 / 192 / 512: the same photograph. 192, 512 and the maskable icon are WebP so the set stays small; `apple-touch-icon.png` stays PNG.
- Maskable 512: the photograph scaled to 68% and centred on the leather, so the petal tips sit inside the safe zone.
- 16 / 32 / 48, `favicon.ico` and `favicon.svg`: a thickened trace of the same grooves, dark brown `#2a120c` on leather tan `#82442c`, so the clef still reads at 16px. This is not the cabinet mark.

| File | Notes |
| --- | --- |
| `mark-64.webp`, `mark-128.webp`, `mark-64.avif`, `mark-128.avif`, `mark-64.png` | cabinet header, 1x/2x of the 40px slot |
| `icon-512.webp`, `icon-192.webp` | manifest `purpose: any`, `image/webp` |
| `icon-maskable-512.webp` | manifest `purpose: maskable` |
| `apple-touch-icon.png` | 180×180 photograph, opaque PNG |
| `favicon.svg` | tiny-size trace only |
| `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png` | rendered from the trace |
| `favicon.ico` | embeds those three PNGs byte-for-byte |

Regenerate (repo root; needs `potrace`, `rsvg-convert`, `pngquant`, `optipng`, `avifenc`, Pillow, numpy):

```sh
python3 docs/business/brand-icons/render_icons.py
npm run test:business-brand-icons
```

`scripts/business-brand-icons-unit.mjs` checks sizes, that the small favicons are the tan trace, that 180+ is the leather photograph, the `.ico` contents, and that no file equals an audiolad.ru icon. Payload of `public/business/brand/` excluding the manifest stays under 80 KB.
