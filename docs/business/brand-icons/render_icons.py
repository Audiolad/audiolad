#!/usr/bin/env python3
"""Render the business.audiolad.ru icon set from the ORIGINAL AudioLad mark.

Source: public/master-logo-icon.png (1254x1254, white mark on dark purple; the
same artwork as the audiolad.ru icons). The mark is NOT redrawn: its coverage
(alpha) is recovered exactly from the white-on-dark original,
    pixel = alpha * 255 + (1 - alpha) * background,
and re-composited as ONE flat colour on ONE flat background. Every output is
only a uniform downscale (Lanczos) of that alpha; the maskable icon is the same
alpha scaled uniformly to 80 % and centred so the mark sits inside the safe zone.

Palette (Business theme tokens): mark --biz-espresso #2b1d14 on --biz-cream #f7f1e8.
All PNGs are opaque RGB. favicon.ico embeds the three favicon PNGs byte-for-byte.

Usage (from repo root; needs Pillow + numpy):
    python3 docs/business/brand-icons/render_icons.py
"""
import io
import struct
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "public/master-logo-icon.png"
OUT = ROOT / "public/business/brand"
MARK = (0x2B, 0x1D, 0x14)  # espresso
BG = (0xF7, 0xF1, 0xE8)  # cream
MASKABLE_SCALE = 0.80


def mark_alpha() -> Image.Image:
    m = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float64)
    lum = m.mean(axis=2)
    n = lum.shape[0]
    # Smooth background estimate (the original has a +-3 level vignette).
    bgmask = (lum < 75).astype(np.float64)

    def smooth(a: np.ndarray) -> np.ndarray:
        im = Image.fromarray(a.astype(np.float32), "F")
        return np.asarray(im.resize((n // 25, n // 25), Image.BOX).resize((n, n), Image.BILINEAR))

    bg = smooth(lum * bgmask) / np.maximum(smooth(bgmask), 1e-3)
    a = np.clip((lum - bg) / (255 - bg), 0, 1)
    a[a < 0.02] = 0  # background jitter
    a[a > 0.96] = 1  # flat mark interior is exactly the mark colour
    return Image.fromarray((a * 255 + 0.5).astype(np.uint8), "L")


def compose(alpha: Image.Image) -> Image.Image:
    a = np.asarray(alpha).astype(np.float64)[..., None] / 255
    rgb = a * np.array(MARK, float) + (1 - a) * np.array(BG, float)
    return Image.fromarray((rgb + 0.5).clip(0, 255).astype(np.uint8), "RGB")


def render(alpha: Image.Image, size: int, scale: float = 1.0) -> Image.Image:
    if scale == 1.0:
        return compose(alpha.resize((size, size), Image.LANCZOS))
    inner = round(size * scale)
    canvas = Image.new("L", (size, size), 0)
    off = (size - inner) // 2
    canvas.paste(alpha.resize((inner, inner), Image.LANCZOS), (off, off))
    return compose(canvas)


def png_bytes(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return buf.getvalue()


def ico_bytes(pngs: dict[int, bytes]) -> bytes:
    sizes = sorted(pngs)
    head = struct.pack("<HHH", 0, 1, len(sizes))
    off = 6 + 16 * len(sizes)
    entries, blobs = b"", b""
    for s in sizes:
        data = pngs[s]
        entries += struct.pack("<BBBBHHII", s, s, 0, 0, 1, 32, len(data), off)
        blobs += data
        off += len(data)
    return head + entries + blobs


def main() -> None:
    alpha = mark_alpha()
    files = {
        "icon-512.png": render(alpha, 512),
        "icon-192.png": render(alpha, 192),
        "apple-touch-icon.png": render(alpha, 180),
        "icon-maskable-512.png": render(alpha, 512, MASKABLE_SCALE),
    }
    fav = {s: png_bytes(render(alpha, s)) for s in (16, 32, 48)}
    for name, im in files.items():
        (OUT / name).write_bytes(png_bytes(im))
    for s, data in fav.items():
        (OUT / f"favicon-{s}x{s}.png").write_bytes(data)
    (OUT / "favicon.ico").write_bytes(ico_bytes(fav))
    print("rendered", len(files) + len(fav) + 1, "files into", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
