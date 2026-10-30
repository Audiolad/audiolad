#!/usr/bin/env python3
"""Text card for a coffee guide (own artwork, not a photo): og:image and JSON-LD image.

Usage: python3 og-card.py <slug> "<H1 title>" [out_dir]
Writes <out_dir>/<slug>.jpg, 1200x630 (default out_dir public/images/b/coffee/og).
Fonts: OG_FONT_SERIF / OG_FONT_SANS env vars, otherwise Noto Serif / Noto Sans, then DejaVu.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (42, 26, 16)        # --guide-espresso
INK = (255, 248, 239)    # --guide-accent-ink
GOLD = (196, 165, 116)   # --guide-gold
MUTED = (214, 196, 172)

SERIF = [os.environ.get("OG_FONT_SERIF", ""),
         "/usr/share/fonts/truetype/sand-box/google/Noto Serif/NotoSerif-VariableFont_wdth,wght.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"]
SANS = [os.environ.get("OG_FONT_SANS", ""),
        "/usr/share/fonts/truetype/sand-box/google/Noto Sans/NotoSans-VariableFont_wdth,wght.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]


def font(paths, size, weight=None):
    for path in paths:
        if path and os.path.exists(path):
            f = ImageFont.truetype(path, size)
            if weight:
                try:
                    f.set_variation_by_name(weight)
                except Exception:
                    pass
            return f
    raise SystemExit("no font found")


def wrap(draw, text, f, width):
    lines, line = [], ""
    for word in text.split():
        probe = f"{line} {word}".strip()
        if draw.textlength(probe, font=f) <= width:
            line = probe
        else:
            lines.append(line)
            line = word
    lines.append(line)
    return lines


def main():
    slug, title = sys.argv[1], sys.argv[2]
    out_dir = sys.argv[3] if len(sys.argv) > 3 else "public/images/b/coffee/og"
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, 14, H], fill=GOLD)
    label = font(SANS, 30, "SemiBold")
    d.text((80, 70), "АудиоЛад Кофейни", font=label, fill=GOLD)
    size = 72
    while True:
        f = font(SERIF, size, "Bold")
        lines = wrap(d, title, f, W - 160)
        if len(lines) <= 4 or size <= 44:
            break
        size -= 4
    y = 150
    for line in lines:
        d.text((80, y), line, font=f, fill=INK)
        y += int(size * 1.22)
    d.line([80, H - 110, 260, H - 110], fill=GOLD, width=3)
    d.text((80, H - 90), "Кофейня: открытие и работа", font=font(SANS, 28), fill=MUTED)
    os.makedirs(out_dir, exist_ok=True)
    img.save(os.path.join(out_dir, f"{slug}.jpg"), "JPEG", quality=86, optimize=True, progressive=True)


if __name__ == "__main__":
    main()
