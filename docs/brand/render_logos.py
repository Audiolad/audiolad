#!/usr/bin/env python3
"""Render classic AudioLad logos, wordmarks and the default author avatar.

Source: docs/brand/violet-lotus-source.webp (owner-approved, t1409u / t1410u:
white lotus with a treble clef on a full-bleed violet field #7711D3).

This replaces the older outline lotus (dark purple on a transparent or white
field) in the ordinary AudioLad wordmarks, the JSON-LD Organization logo,
the library/sidebar fallback mark, and the default author avatar.

Wordmark lettering is taken from the original files in
docs/brand/wordmark-masters/ (do not overwrite those). Rebuild from repo root:

    python3 docs/brand/render_logos.py
"""
from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(__file__).resolve().parent / "violet-lotus-source.webp"
MASTERS = Path(__file__).resolve().parent / "wordmark-masters"
PUBLIC = ROOT / "public"
BRAND = PUBLIC / "brand"
BADGE_RADIUS = 0.20


def png_bytes(im: Image.Image) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True, compress_level=9)
    return buf.getvalue()


def webp_bytes(im: Image.Image, *, quality: int = 90) -> bytes:
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=quality, method=6)
    return buf.getvalue()


def load_source() -> Image.Image:
    src = Image.open(SRC).convert("RGB")
    if src.size[0] != src.size[1]:
        raise SystemExit(f"source must be square, got {src.size}")
    return src


def render_square(src: Image.Image, size: int) -> Image.Image:
    im = src.resize((size, size), Image.Resampling.LANCZOS)
    if im.mode != "RGB":
        im = im.convert("RGB")
    if size <= 64:
        im = im.filter(ImageFilter.UnsharpMask(radius=0.8, percent=140, threshold=2))
    elif size <= 192:
        im = im.filter(ImageFilter.UnsharpMask(radius=0.6, percent=80, threshold=2))
    return im


def rounded_badge(src: Image.Image, size: int, radius_ratio: float = BADGE_RADIUS) -> Image.Image:
    square = render_square(src, size).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    radius = max(1, round(size * radius_ratio))
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(square, mask=mask)
    return out


def alpha_rows_for_columns(im: Image.Image, threshold: int = 16) -> list[list[int]]:
    """For each column, the y-coordinates whose alpha exceeds threshold."""
    alpha = im.convert("RGBA").getchannel("A")
    w, h = alpha.size
    pix = alpha.load()
    columns: list[list[int]] = [[] for _ in range(w)]
    for y in range(h):
        for x in range(w):
            if pix[x, y] > threshold:
                columns[x].append(y)
    return columns


def column_runs_from_occupancy(occupied: list[bool]) -> list[tuple[bool, int, int]]:
    runs: list[tuple[bool, int, int]] = []
    i = 0
    n = len(occupied)
    while i < n:
        j = i
        while j < n and occupied[j] == occupied[i]:
            j += 1
        runs.append((bool(occupied[i]), i, j - 1))
        i = j
    return runs


def bbox_from_columns(columns: list[list[int]], x0: int, x1: int) -> tuple[int, int, int, int]:
    xs_hit: list[int] = []
    ys_hit: list[int] = []
    for x in range(x0, x1 + 1):
        if columns[x]:
            xs_hit.append(x)
            ys_hit.extend(columns[x])
    if not xs_hit:
        raise SystemExit(f"empty bbox in columns {x0}-{x1}")
    return (xs_hit[0], min(ys_hit), xs_hit[-1], max(ys_hit))


def mark_and_text_bounds(im: Image.Image, min_gap: int = 8) -> tuple[tuple[int, int, int, int], tuple[int, int, int, int], int]:
    """Return (mark_bbox, text_bbox, gap_px) for a lotus+word wordmark."""
    columns = alpha_rows_for_columns(im)
    occupied = [bool(col) for col in columns]
    runs = column_runs_from_occupancy(occupied)
    mark_run = None
    gap_run = None
    text_start = None
    for filled, start, end in runs:
        width = end - start + 1
        if mark_run is None:
            if filled:
                mark_run = (start, end)
            continue
        if gap_run is None:
            if (not filled) and width >= min_gap:
                gap_run = (start, end)
                continue
            raise SystemExit(f"no gap of {min_gap}px after the mark in {im.size}")
        if filled and text_start is None:
            text_start = start
            break
    if mark_run is None or gap_run is None or text_start is None:
        raise SystemExit(f"could not split mark and text in {im.size}")

    mark = bbox_from_columns(columns, mark_run[0], mark_run[1])
    text = bbox_from_columns(columns, text_start, im.size[0] - 1)
    gap = text[0] - mark[2] - 1
    return mark, text, gap


def compose_wordmark(
    src: Image.Image,
    original: Image.Image,
    *,
    min_gap: int = 8,
    left_pad: int | None = None,
    gap: int | None = None,
    keep_canvas: bool = True,
    right_pad: int | None = None,
) -> Image.Image:
    original = original.convert("RGBA")
    canvas_w, canvas_h = original.size
    mark, text_box, orig_gap = mark_and_text_bounds(original, min_gap=min_gap)
    text = original.crop((text_box[0], text_box[1], text_box[2] + 1, text_box[3] + 1))
    text_w, text_h = text.size

    mark_h = mark[3] - mark[1] + 1
    # Badge follows the original lotus height so it stays readable at the
    # 32px header size, and never exceeds the canvas.
    badge_size = min(canvas_h, max(text_h, mark_h))

    if left_pad is None:
        left_pad = mark[0]
    if gap is None:
        gap = max(12, orig_gap)

    flush = mark[1] <= 1 and mark[3] >= canvas_h - 2
    if flush:
        badge_size = canvas_h
        badge_y = 0
        text_y = (canvas_h - text_h) // 2
    else:
        # Vertically center the lettering on the badge, then center that
        # group in the original content band if it still fits.
        badge_y = (canvas_h - badge_size) // 2
        text_y = badge_y + (badge_size - text_h) // 2

    badge = rounded_badge(src, badge_size)
    group_w = left_pad + badge_size + gap + text_w
    if keep_canvas:
        out_w, out_h = canvas_w, canvas_h
    else:
        rp = 5 if right_pad is None else right_pad
        out_w = group_w + rp
        out_h = canvas_h

    out = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
    out.paste(badge, (left_pad, badge_y), badge)
    out.paste(text, (left_pad + badge_size + gap, text_y), text)
    return out


def write_png(path: Path, im: Image.Image) -> None:
    data = png_bytes(im)
    path.write_bytes(data)
    print(f"  {path.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}  {len(data)} bytes")


def write_webp(path: Path, im: Image.Image, *, quality: int = 90) -> None:
    data = webp_bytes(im, quality=quality)
    path.write_bytes(data)
    print(f"  {path.relative_to(ROOT)}  {im.size[0]}x{im.size[1]}  {len(data)} bytes")


def main() -> None:
    src = load_source()
    print("source", SRC.relative_to(ROOT), src.size)

    write_png(PUBLIC / "audiolad-logo.png", render_square(src, 1254))
    write_png(BRAND / "author-default-avatar.png", render_square(src, 512))
    write_png(BRAND / "audiolad-fallback-mark.png", render_square(src, 1024))

    write_png(
        BRAND / "audiolad-logo-horizontal.png",
        compose_wordmark(src, Image.open(MASTERS / "audiolad-logo-horizontal.png"), min_gap=8, keep_canvas=True),
    )
    write_webp(
        BRAND / "audiolad-logo-light.webp",
        compose_wordmark(
            src,
            Image.open(MASTERS / "audiolad-logo-light.webp"),
            min_gap=6,
            keep_canvas=False,
            right_pad=5,
        ),
        quality=90,
    )
    write_webp(
        BRAND / "audiolad-logo-sidebar-v2.webp",
        compose_wordmark(src, Image.open(MASTERS / "audiolad-logo-sidebar-v2.webp"), min_gap=8, keep_canvas=True),
        quality=90,
    )
    write_png(
        BRAND / "audiolad-logo-sidebar.png",
        compose_wordmark(src, Image.open(MASTERS / "audiolad-logo-sidebar.png"), min_gap=16, keep_canvas=True),
    )

    print("rendered classic violet logos into public/ and public/brand/")


if __name__ == "__main__":
    main()
