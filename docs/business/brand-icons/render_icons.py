#!/usr/bin/env python3
"""Render business.audiolad.ru icons from the approved embossed lotus.

Source photo: docs/business/brand-icons/lotus-source.webp (square crop of the
owner's leather mark). audiolad.ru icons in public/ are not touched.

- Header rasters: WebP + AVIF at 64 and 128, plus a 64 PNG fallback.
- 180 / 192 / 512 / maskable: the same crop (grain softened only enough to
  keep the files small). 512 and maskable are WebP.
- 16 / 32 / 48 and favicon.svg: a trace of this crop, dark grooves on leather tan.

Requires Pillow, rsvg-convert, potrace, pngquant, optipng, avifenc.

    python3 docs/business/brand-icons/render_icons.py
"""
import io
import struct
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / "docs/business/brand-icons/lotus-source.webp"
OUT = ROOT / "public/business/brand"
TAN = (0x82, 0x44, 0x2C)  # leather highlight, readable behind the grooves
GROOVE = "#2a120c"
MASKABLE_SCALE = 0.68


def run(cmd: list[str], data: bytes | None = None) -> bytes:
    proc = subprocess.run(cmd, input=data, capture_output=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"{cmd[0]} failed: {proc.stderr[-400:]!r}")
    return proc.stdout


def save_webp(im: Image.Image, path: Path, quality: int) -> None:
    im.save(path, "WEBP", quality=quality, method=6)


def save_avif(im: Image.Image, path: Path) -> None:
    png = OUT / ".avif-src.png"
    im.save(png, "PNG")
    subprocess.check_call(
        ["avifenc", "--min", "24", "--max", "36", "-s", "6", str(png), str(path)],
        stdout=subprocess.DEVNULL,
    )
    png.unlink(missing_ok=True)


def quant_png(im: Image.Image, quality: str) -> bytes:
    raw = io.BytesIO()
    im.save(raw, "PNG", optimize=True)
    src = OUT / ".q-src.png"
    dst = OUT / ".q-dst.png"
    src.write_bytes(raw.getvalue())
    proc = subprocess.run(
        ["pngquant", f"--quality={quality}", "--speed", "1", "--force", "--output", str(dst), str(src)],
        capture_output=True,
        check=False,
    )
    chosen = dst if proc.returncode == 0 and dst.exists() else src
    subprocess.check_call(["optipng", "-o4", "-quiet", str(chosen)])
    out = chosen.read_bytes()
    src.unlink(missing_ok=True)
    dst.unlink(missing_ok=True)
    return out


def photo(size: int, median: int) -> Image.Image:
    im = Image.open(SRC).convert("RGB").resize((size, size), Image.Resampling.LANCZOS)
    if median > 1:
        im = im.filter(ImageFilter.MedianFilter(median))
    return im


def maskable(size: int = 512) -> Image.Image:
    mark = photo(size, 5)
    border = []
    px = mark.load()
    for i in range(size):
        border.append(px[i, 2])
        border.append(px[i, size - 3])
        border.append(px[2, i])
        border.append(px[size - 3, i])
    avg = tuple(int(sum(c[ch] for c in border) / len(border)) for ch in range(3))
    canvas = Image.new("RGB", (size, size), avg)
    inner = round(size * MASKABLE_SCALE)
    off = (size - inner) // 2
    canvas.paste(mark.resize((inner, inner), Image.Resampling.LANCZOS), (off, off))
    return canvas


def groove_mask(size: int = 160) -> Image.Image:
    im = Image.open(SRC).convert("L").resize((size, size), Image.Resampling.BOX)
    fine = np.asarray(im.filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32)
    coarse = np.asarray(im.filter(ImageFilter.GaussianBlur(7))).astype(np.float32)
    lines = (coarse - fine) > 12
    # Black grooves on white, for potrace. One pixel of dilation keeps the
    # clef readable after the 16 px raster.
    bw = Image.fromarray(np.where(lines, 0, 255).astype(np.uint8), "L")
    ink = Image.eval(bw, lambda p: 255 - p).filter(ImageFilter.MaxFilter(3))
    return Image.eval(ink, lambda p: 255 - p)


def write_favicon_svg() -> None:
    mask = groove_mask()
    pbm = OUT / ".trace.pbm"
    traced = OUT / ".trace.svg"
    mask.convert("1", dither=Image.Dither.NONE).save(pbm)
    # potrace 1.16 writes the SVG beside the input unless -o is set; stdout stays empty.
    subprocess.check_call(
        ["potrace", str(pbm), "-s", "--flat", "-a", "1.2", "-O", "1.0", "-t", "8", "-o", str(traced)],
        stdout=subprocess.DEVNULL,
    )
    pbm.unlink(missing_ok=True)
    text = traced.read_text()
    traced.unlink(missing_ok=True)
    # Keep potrace's transformed path; drop the bulky header.
    start = text.find("<g ")
    end = text.rfind("</g>")
    if start < 0 or end < 0:
        raise RuntimeError("potrace SVG had no path group")
    group = " ".join(text[start:end + 4].split())
    group = group.replace('fill="#000000"', f'fill="{GROOVE}"')
    side = mask.width
    tan = f"#{TAN[0]:02x}{TAN[1]:02x}{TAN[2]:02x}"
    out = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}">'
        f'<rect width="{side}" height="{side}" fill="{tan}"/>'
        f"{group}</svg>\n"
    )
    (OUT / "favicon.svg").write_text(out)


def render_svg(size: int) -> Image.Image:
    raw = run(["rsvg-convert", "-w", str(size), "-h", str(size), str(OUT / "favicon.svg")])
    return Image.open(io.BytesIO(raw)).convert("RGB")


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
    write_favicon_svg()
    for s, q in ((64, 68), (128, 70)):
        im = photo(s, 3 if s >= 128 else 1)
        save_webp(im, OUT / f"mark-{s}.webp", q)
        save_avif(im, OUT / f"mark-{s}.avif")
    (OUT / "mark-64.png").write_bytes(quant_png(photo(64, 1), "45-75"))

    save_webp(photo(192, 3), OUT / "icon-192.webp", 66)
    save_webp(photo(512, 5), OUT / "icon-512.webp", 56)
    save_webp(maskable(), OUT / "icon-maskable-512.webp", 58)
    (OUT / "apple-touch-icon.png").write_bytes(quant_png(photo(180, 3), "20-42"))

    # Light quant only: a hard palette wipe turns the 16 px clef into a blob.
    fav = {s: quant_png(render_svg(s), "65-95") for s in (16, 32, 48)}
    for s, data in fav.items():
        (OUT / f"favicon-{s}x{s}.png").write_bytes(data)
    (OUT / "favicon.ico").write_bytes(ico_bytes(fav))

    for stale in ("icon-192.png", "icon-512.png", "icon-maskable-512.png"):
        (OUT / stale).unlink(missing_ok=True)
    print("rendered business brand into", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
