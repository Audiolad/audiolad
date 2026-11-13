#!/usr/bin/env python3
"""Render the classic AudioLad icon set from the approved violet lotus mark.

Source: docs/brand/violet-lotus-source.webp (owner-approved, t1409u:
white lotus with a treble clef on a full-bleed violet field).

Rounded assets (t1424u): favicon.ico/png/svg and the PWA purpose=any
icons get a ~20% corner radius with a transparent outside, so a browser
tab and the Android splash (icon on the lavender #f7f2fc field) show a
rounded square like the MAX favicon.

Full-bleed assets stay square and opaque: apple-touch-icon (iOS applies
its own mask), icon-192/512/1024 and master-logo-icon (Open Graph and
other square uses), and icon-maskable-512 (the OS masks the home-screen
icon).

Usage (from repo root; needs Pillow):
    python3 docs/brand/render_icons.py           # rounded favicons + any-icons
    python3 docs/brand/render_icons.py --all     # also rebuild full-bleed set
"""
from __future__ import annotations

import argparse
import base64
import io
import struct
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).resolve().parent / "violet-lotus-source.webp"
OUT = ROOT / "public"
MASKABLE_SCALE = 0.80
FIELD = (119, 17, 211)  # #7711D3, median of the source field
# Midpoint of the 18–22% range; close to a typical iOS/MAX rounded square.
RADIUS_RATIO = 0.20


def png_bytes(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA") if "A" in im.getbands() else im.convert("RGB")
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


def render_rounded(src: Image.Image, size: int, radius_ratio: float = RADIUS_RATIO) -> Image.Image:
    """Full-bleed mark, then a rounded-rect alpha so corners are transparent."""
    over = 4
    big_size = size * over
    big = src.resize((big_size, big_size), Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", (big_size, big_size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, big_size - 1, big_size - 1),
        radius=round(big_size * radius_ratio),
        fill=255,
    )
    big.putalpha(mask)
    im = big.resize((size, size), Image.Resampling.LANCZOS)
    if size <= 64:
        rgb = im.convert("RGB").filter(
            ImageFilter.UnsharpMask(radius=0.8, percent=140, threshold=2)
        )
        out = rgb.convert("RGBA")
        out.putalpha(im.getchannel("A"))
        return out
    if size <= 192:
        rgb = im.convert("RGB").filter(
            ImageFilter.UnsharpMask(radius=0.6, percent=80, threshold=2)
        )
        out = rgb.convert("RGBA")
        out.putalpha(im.getchannel("A"))
        return out
    return im


def write_svg(png_rounded: bytes, dest: Path, size: int = 512) -> None:
    # No square fill behind the image: the PNG already has a transparent outside.
    b64 = base64.b64encode(png_rounded).decode("ascii")
    dest.write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '
        f'{size} {size}">\n'
        f'  <image width="{size}" height="{size}" href="data:image/png;base64,{b64}"/>\n'
        "</svg>\n",
        encoding="utf-8",
    )


def _write(name: str, data: bytes) -> None:
    (OUT / name).write_bytes(data)
    print(f"{len(data):8}  {name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--all",
        action="store_true",
        help="also rebuild full-bleed apple-touch / icon-192 / icon-512 / "
        "icon-1024 / maskable / master-logo (normally left unchanged)",
    )
    args = parser.parse_args()

    src = Image.open(SRC).convert("RGB")
    if src.size[0] != src.size[1]:
        raise SystemExit(f"source must be square, got {src.size}")

    OUT.mkdir(parents=True, exist_ok=True)

    rounded = {
        "favicon-16x16.png": render_rounded(src, 16),
        "favicon-32x32.png": render_rounded(src, 32),
        "favicon-48x48.png": render_rounded(src, 48),
        "favicon-64x64.png": render_rounded(src, 64),
        "icon-any-192.png": render_rounded(src, 192),
        "icon-any-512.png": render_rounded(src, 512),
    }
    fav: dict[int, bytes] = {}
    for name, im in rounded.items():
        data = png_bytes(im)
        _write(name, data)
        if name.startswith("favicon-") and name.endswith(".png"):
            fav[int(name.split("-")[1].split("x")[0])] = data

    _write("favicon.ico", ico_bytes(fav))
    png512 = png_bytes(rounded["icon-any-512.png"])
    write_svg(png512, OUT / "icon.svg")
    write_svg(png512, OUT / "apple-icon.svg")
    print(f"{(OUT / 'icon.svg').stat().st_size:8}  icon.svg")
    print(f"{(OUT / 'apple-icon.svg').stat().st_size:8}  apple-icon.svg")

    if args.all:
        squares = {
            "apple-touch-icon.png": render_square(src, 180),
            "icon-192.png": render_square(src, 192),
            "icon-512.png": render_square(src, 512),
            "icon-1024.png": render_square(src, 1024),
            "icon-maskable-512.png": render_maskable(src, 512),
            "master-logo-icon.png": render_square(src, 1254),
        }
        for name, im in squares.items():
            _write(name, png_bytes(im))

    print("rendered classic violet icons into", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
