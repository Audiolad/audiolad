#!/usr/bin/env python3
"""t1578u: PDF of a play-log extract («Выписка из журнала воспроизведения»).

Input: JSON written by src/lib/evidence/extract.server.ts. Output: one PDF (A4, DejaVu fonts,
Cyrillic). The PDF is a human-readable view; the evidence itself is the CSV files whose
SHA-256 are printed here and in manifest.json, sealed by manifest.sig.
"""
import argparse
import json
import os
import sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--fonts", default="/usr/share/fonts/truetype/dejavu")
    a = ap.parse_args()

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import LongTable, Paragraph, SimpleDocTemplate, Spacer, TableStyle

    pdfmetrics.registerFont(TTFont("DejaVu", os.path.join(a.fonts, "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVu-Bold", os.path.join(a.fonts, "DejaVuSans-Bold.ttf")))
    pdfmetrics.registerFont(TTFont("DejaVuMono", os.path.join(a.fonts, "DejaVuSansMono.ttf")))

    with open(a.input, encoding="utf-8") as fh:
        d = json.load(fh)

    base = ParagraphStyle("b", fontName="DejaVu", fontSize=9, leading=12)
    small = ParagraphStyle("s", parent=base, fontSize=7.5, leading=9.5)
    mono = ParagraphStyle("m", parent=base, fontName="DejaVuMono", fontSize=7, leading=9)
    h1 = ParagraphStyle("h1", parent=base, fontName="DejaVu-Bold", fontSize=14, leading=18, spaceAfter=4)
    h2 = ParagraphStyle("h2", parent=base, fontName="DejaVu-Bold", fontSize=10.5, leading=14, spaceBefore=8, spaceAfter=3)

    def esc(s):
        return (str(s) if s is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    loc = d["location"]
    w = d["window"]
    c = d["counts"]
    story = [
        Paragraph("Выписка из журнала воспроизведения", h1),
        Paragraph(f"АудиоЛад Бизнес · выписка № {esc(d['extract_id'])}", base),
        Paragraph(f"Сформирована: {esc(d['created_local'])} ({esc(w['timezone'])}), {esc(d['created_at_utc'])} UTC", base),
        Spacer(1, 4 * mm),
        Paragraph("Заведение", h2),
        Paragraph(f"{esc(loc['organizationName'])} – {esc(loc['name'])}", base),
        Paragraph(esc(loc.get("address") or "Адрес не указан"), base),
        Paragraph(f"Идентификатор точки: {esc(loc['id'])}", small),
        Paragraph("Период", h2),
        Paragraph(f"{esc(w['from_local'])} – {esc(w['to_local'])} ({esc(w['timezone'])})", base),
        Paragraph(f"UTC: {esc(w['from_utc'])} – {esc(w['to_utc'])}", small),
        Paragraph("Источник данных", h2),
        Paragraph(
            "Отметки плеера зала, принятые сервером (таблица playback_usage_facts): плеер, трек, позиция в треке. "
            "Время – время сервера в момент приёма отметки, часы сервера синхронизированы по NTP. "
            "Отметки приходят каждые 5–15 секунд, пока музыка играет. Выписка полная: прочитаны все отметки периода.",
            base,
        ),
        Paragraph(
            f"Отметок: {c['facts']} · воспроизведений: {c['plays']} · плееров: {c['players']} · разных треков: {c['tracks']}",
            base,
        ),
    ]
    if d.get("players"):
        story.append(Paragraph("Плееры", h2))
        for p in d["players"]:
            story.append(Paragraph(f"{esc(p.get('code') or '–')} {esc(p.get('name') or '')} · {esc(p['id'])}", small))

    story.append(Paragraph("Воспроизведения", h2))
    rows = [["№", "Начало", "Конец", "Плеер", "Код трека", "Название", "Позиция, с"]]
    for i, p in enumerate(d.get("plays", []), 1):
        rows.append([
            str(i), p["first_local"][5:], p["last_local"][11:], p["player"][-4:] if p["player"] else "",
            p["code"], Paragraph(esc(p["title"]), small), f"{p['pos_from_s']}–{p['pos_to_s']}",
        ])
    if len(rows) == 1:
        story.append(Paragraph("За этот период сервер не получал отметок воспроизведения.", base))
    else:
        t = LongTable(rows, colWidths=[9 * mm, 26 * mm, 15 * mm, 12 * mm, 30 * mm, 70 * mm, 20 * mm], repeatRows=1)
        t.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, -1), "DejaVu", 7.5),
            ("FONT", (0, 0), (-1, 0), "DejaVu-Bold", 7.5),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#efeaf7")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(t)

    story.append(Paragraph("Контроль целостности", h2))
    for f in d.get("files", []):
        story.append(Paragraph(f"{esc(f['name'])} ({f['bytes']} байт)", small))
        story.append(Paragraph(f"SHA-256: {esc(f['sha256'])}", mono))
    story.append(Paragraph(
        "Хеши этого PDF и CSV-файлов записаны в manifest.json. manifest.json заверен технической печатью "
        "сервиса (Ed25519, файл manifest.sig, открытый ключ seal-public.pem). Это не квалифицированная "
        "электронная подпись. Порядок проверки – в файле VERIFY.txt.",
        small,
    ))
    story.append(Paragraph(f"SHA-256 открытого ключа печати: {esc(d['seal_fingerprint'])}", mono))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("DejaVu", 7)
        canvas.drawString(15 * mm, 10 * mm, f"Выписка № {d['extract_id']} · стр. {doc.page}")
        canvas.restoreState()

    doc = SimpleDocTemplate(a.out + ".tmp", pagesize=A4, leftMargin=12 * mm, rightMargin=12 * mm,
                            topMargin=14 * mm, bottomMargin=16 * mm,
                            title=f"Выписка {d['extract_id']}", author="АудиоЛад", invariant=1)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    os.replace(a.out + ".tmp", a.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
