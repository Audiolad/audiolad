#!/usr/bin/env python3
"""Render the business.audiolad.ru icon set from the approved leather lotus mark.

Source: docs/business/brand-icons/leather-lotus-source.jpg (owner-approved mark:
a lotus with a treble clef embossed on brown leather). The artwork is not redrawn.
Every square icon is a centered square crop of that photograph, downscaled with
Lanczos. The maskable icon keeps the same crop, scaled to 80% and centred, on a
leather field taken from the corners so the lotus stays inside the safe zone.

All PNGs are opaque RGB. favicon.ico embeds the 16/32/48 PNGs byte-for-byte.
The in-app lockup (mark-leather.webp) is the same crop, small enough for the
cabinet header (< 60 KB).

Usage (from repo root; needs Pillow):
    python3 docs/business/brand-icons/render_icons.py
"""
import io
import struct
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
SRC = Path(__file__).resolve().parent / "leather-lotus-source.jpg"
OUT = ROOT / "public/business/brand"
MASKABLE_SCALE = 0.80
# In-app circle is CSS-cropped; 160px covers a ~40px mark at 3×.
MARK_PX = 160
MARK_WEBP_QUALITY = 72


def square_crop(im: Image.Image) -> Image.Image:
    rgb = im.convert("RGB")
    w, h = rgb.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return rgb.crop((left, top, left + side, top + side))


def leather_field(square: Image.Image, size: int) -> Image.Image:
    """Blurred leather from the four corners — no lotus in the pad."""
    side = square.size[0]
    patch = max(80, side // 7)
    corners = [
        square.crop((0, 0, patch, patch)),
        square.crop((side - patch, 0, side, patch)),
        square.crop((0, side - patch, patch, side)),
        square.crop((side - patch, side - patch, side, side)),
    ]
    tile = Image.new("RGB", (patch * 2, patch * 2))
    tile.paste(corners[0], (0, 0))
    tile.paste(corners[1], (patch, 0))
    tile.paste(corners[2], (0, patch))
    tile.paste(corners[3], (patch, patch))
    return tile.resize((size, size), Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(14))


def feather_mask(inner: int, fade: int) -> Image.Image:
    mask = Image.new("L", (inner, inner), 255)
    px = mask.load()
    for y in range(inner):
        for x in range(inner):
            edge = min(x, y, inner - 1 - x, inner - 1 - y)
            if edge < fade:
                px[x, y] = int(255 * edge / fade)
    return mask


def render_square(square: Image.Image, size: int) -> Image.Image:
    return square.resize((size, size), Image.Resampling.LANCZOS)


def render_maskable(square: Image.Image, size: int, scale: float = MASKABLE_SCALE) -> Image.Image:
    field = leather_field(square, size)
    inner = round(size * scale)
    sharp = render_square(square, inner)
    fade = max(8, round(size * 0.02))
    field.paste(sharp, ((size - inner) // 2, (size - inner) // 2), feather_mask(inner, fade))
    return field


def store_png(im: Image.Image) -> Image.Image:
    """Large photographic PNGs are palette-quantized; small favicons stay RGB."""
    if min(im.size) < 256:
        return im
    return im.quantize(
        colors=192,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.FLOYDSTEINBERG,
    )


def png_bytes(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True, compress_level=9)
    return buf.getvalue()


def webp_bytes(im: Image.Image, quality: int) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
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
    square = square_crop(Image.open(SRC))
    pngs = {
        "icon-512.png": render_square(square, 512),
        "icon-192.png": render_square(square, 192),
        "apple-touch-icon.png": render_square(square, 180),
        "icon-maskable-512.png": render_maskable(square, 512),
        "favicon-48x48.png": render_square(square, 48),
        "favicon-32x32.png": render_square(square, 32),
        "favicon-16x16.png": render_square(square, 16),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    fav: dict[int, bytes] = {}
    for name, im in pngs.items():
        data = png_bytes(store_png(im))
        (OUT / name).write_bytes(data)
        if name.startswith("favicon-") and name.endswith(".png"):
            side = int(name.split("-")[1].split("x")[0])
            fav[side] = data
    (OUT / "favicon.ico").write_bytes(ico_bytes(fav))
    for name, quality in (
        ("icon-512.webp", 76),
        ("icon-192.webp", 76),
        ("icon-maskable-512.webp", 76),
        ("apple-touch-icon.webp", 76),
    ):
        stem = name.replace(".webp", ".png")
        (OUT / name).write_bytes(webp_bytes(pngs[stem], quality))
    mark = webp_bytes(render_square(square, MARK_PX), MARK_WEBP_QUALITY)
    (OUT / "mark-leather.webp").write_bytes(mark)
    print(
        "rendered",
        len(pngs) + 1 + 4 + 1,
        "files into",
        OUT.relative_to(ROOT),
        f"(mark {len(mark)} bytes)",
    )


if __name__ == "__main__":
    main()
