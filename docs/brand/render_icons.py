#!/usr/bin/env python3
"""Render the classic AudioLad icon set from the approved violet lotus mark.

Source: docs/brand/violet-lotus-source.webp (owner-approved, t1409u:
white lotus with a treble clef on a full-bleed violet field).

Usage (from repo root; needs Pillow):
    python3 docs/brand/render_icons.py
"""
from __future__ import annotations

import base64
import io
import struct
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).resolve().parent / "violet-lotus-source.webp"
OUT = ROOT / "public"
MASKABLE_SCALE = 0.80
FIELD = (119, 17, 211)  # #7711D3, median of the source field


def png_bytes(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    if im.mode != "RGB":
        im = im.convert("RGB")
    im.save(buf, "PNG", optimize=True, compress_level=9)
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


def render_square(src: Image.Image, size: int) -> Image.Image:
    im = src.resize((size, size), Image.Resampling.LANCZOS)
    if im.mode != "RGB":
        im = im.convert("RGB")
    if size <= 64:
        im = im.filter(ImageFilter.UnsharpMask(radius=0.8, percent=140, threshold=2))
    elif size <= 192:
        im = im.filter(ImageFilter.UnsharpMask(radius=0.6, percent=80, threshold=2))
    return im


def render_maskable(src: Image.Image, size: int, scale: float = MASKABLE_SCALE) -> Image.Image:
    canvas = Image.new("RGB", (size, size), FIELD)
    inner = round(size * scale)
    sharp = render_square(src, inner)
    canvas.paste(sharp, ((size - inner) // 2, (size - inner) // 2))
    return canvas


def write_svg(png_512: bytes, dest: Path) -> None:
    b64 = base64.b64encode(png_512).decode("ascii")
    dest.write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n'
        '  <rect width="512" height="512" fill="#7711D3"/>\n'
        f'  <image width="512" height="512" href="data:image/png;base64,{b64}"/>\n'
        "</svg>\n",
        encoding="utf-8",
    )


def main() -> None:
    src = Image.open(SRC).convert("RGB")
    if src.size[0] != src.size[1]:
        raise SystemExit(f"source must be square, got {src.size}")

    squares = {
        "favicon-16x16.png": render_square(src, 16),
        "favicon-32x32.png": render_square(src, 32),
        "favicon-48x48.png": render_square(src, 48),
        "favicon-64x64.png": render_square(src, 64),
        "apple-touch-icon.png": render_square(src, 180),
        "icon-192.png": render_square(src, 192),
        "icon-512.png": render_square(src, 512),
        "icon-1024.png": render_square(src, 1024),
        "icon-maskable-512.png": render_maskable(src, 512),
        "master-logo-icon.png": render_square(src, 1254),
    }

    fav: dict[int, bytes] = {}
    for name, im in squares.items():
        data = png_bytes(im)
        (OUT / name).write_bytes(data)
        if name.startswith("favicon-") and name.endswith(".png"):
            fav[int(name.split("-")[1].split("x")[0])] = data

    (OUT / "favicon.ico").write_bytes(ico_bytes(fav))
    png512 = png_bytes(squares["icon-512.png"])
    write_svg(png512, OUT / "icon.svg")
    write_svg(png512, OUT / "apple-icon.svg")
    print("rendered classic violet icons into", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
