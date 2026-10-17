# AudioLad Business — Jazz & Coffee icon set

Hand-built vector sources for the `business.audiolad.ru` icons in
`public/business/brand/` (audiolad.ru keeps its own icons in `public/`).

Palette = Business theme tokens (`src/components/business-app/theme/business-theme.css`):
`--biz-coffee #6f4326` → `--biz-espresso #2b1d14` radial background,
`--biz-cream #f7f1e8` lotus, `--biz-brass #b8904f` treble clef.

| Source | Rendered files |
| --- | --- |
| `icon.svg` (rounded tile, transparent corners) | `icon-192.png`, `icon-512.png` (manifest `purpose: any`) |
| `icon-fullbleed.svg` (opaque square) | `apple-touch-icon.png` (180×180) |
| `icon-maskable.svg` (opaque, mark inside the 80 % safe zone) | `icon-maskable-512.png` (manifest `purpose: maskable`) |
| `icon-small.svg` (simplified mark, heavier strokes) | `favicon-16x16.png`, `favicon-32x32.png`, `favicon-48x48.png`, `favicon.ico` (16/32/48) |

PNGs were rasterised from these SVGs with headless Chrome at the exact pixel size
(no downscaling); `favicon.ico` embeds pixel-identical PNG versions of the three favicons.
