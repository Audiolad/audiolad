#!/usr/bin/env python3
"""Render business.audiolad.ru icons from the leather lotus mark.

Source: public/business/brand/favicon.svg (lotus whose central petal is a
treble clef, traced from the approved embossed-leather artwork). audiolad.ru
icons in public/ are not touched.

Output is opaque: leather #3d2618 on cream #f7f1e8. Edges are blends of those
two colours only. 16 and 32 px are thickened so the flower still reads.
The maskable icon is scaled to 76% so the mark stays inside the safe zone.

Requires rsvg-convert, pngquant, optipng, Pillow and numpy:

    python3 docs/business/brand-icons/render_icons.py
"""
import io
import struct
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
SVG = ROOT / "public/business/brand/favicon.svg"
OUT = ROOT / "public/business/brand"
MARK = (0x3D, 0x26, 0x18)  # leather
BG = (0xF7, 0xF1, 0xE8)  # cream, same as --biz-bg
MASKABLE_SCALE = 0.76


def render_alpha(size: int) -> Image.Image:
    raw = subprocess.check_output(
        ["rsvg-convert", "-w", str(size), "-h", str(size), str(SVG)],
    )
    return Image.open(io.BytesIO(raw)).convert("RGBA").getchannel("A")


def thicken(size: int) -> Image.Image:
    """Bold line art so a 16–32 px favicon still reads as a lotus."""
    big = render_alpha(128)
    radius = 5 if size <= 16 else 3
    big = big.filter(ImageFilter.MaxFilter(radius))
    return big.resize((size, size), Image.Resampling.LANCZOS)


def compose(alpha: Image.Image) -> Image.Image:
    a = np.asarray(alpha).astype(np.float64) / 255.0
    a[a < 0.04] = 0
    a[a > 0.92] = 1
    rgb = a[..., None] * np.array(MARK, float) + (1 - a[..., None]) * np.array(BG, float)
    return Image.fromarray((rgb + 0.5).clip(0, 255).astype(np.uint8), "RGB")


def at(master: Image.Image, size: int, scale: float = 1.0) -> Image.Image:
    alpha = thicken(size) if size <= 32 else (
        master if size == master.width else master.resize((size, size), Image.Resampling.LANCZOS)
    )
    if scale != 1:
        inner = max(1, round(size * scale))
        canvas = Image.new("L", (size, size), 0)
        off = (size - inner) // 2
        canvas.paste(alpha.resize((inner, inner), Image.Resampling.LANCZOS), (off, off))
        alpha = canvas
    return compose(alpha)


def quantize(png: bytes) -> bytes:
    """Palette quant (pngquant) then lossless optipng. Falls back to the RGB PNG."""
    src = OUT / ".icon-src.png"
    dst = OUT / ".icon-dst.png"
    src.write_bytes(png)
    proc = subprocess.run(
        ["pngquant", "--speed", "1", "--force", "--output", str(dst), str(src)],
        capture_output=True,
        check=False,
    )
    chosen = dst if proc.returncode == 0 and dst.exists() else src
    subprocess.check_call(["optipng", "-o5", "-quiet", str(chosen)])
    out = chosen.read_bytes()
    src.unlink(missing_ok=True)
    dst.unlink(missing_ok=True)
    return out


def png_bytes(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return quantize(buf.getvalue())


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
    master = render_alpha(512)
    files = {
        "icon-512.png": at(master, 512),
        "icon-192.png": at(master, 192),
        "apple-touch-icon.png": at(master, 180),
        "icon-maskable-512.png": at(master, 512, MASKABLE_SCALE),
    }
    fav = {s: png_bytes(at(master, s)) for s in (16, 32, 48)}
    for name, im in files.items():
        (OUT / name).write_bytes(png_bytes(im))
    for s, data in fav.items():
        (OUT / f"favicon-{s}x{s}.png").write_bytes(data)
    (OUT / "favicon.ico").write_bytes(ico_bytes(fav))
    print("rendered", len(files) + len(fav) + 1, "files into", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
