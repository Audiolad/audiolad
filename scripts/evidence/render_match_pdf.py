#!/usr/bin/env python3
"""t1578u: PDF «Отчёт сверки записи с каталогом АудиоЛад» (reportlab, DejaVu).

Human-readable view of report.json; report.json (sealed by report.sig) is the evidence.
"""
import argparse
import json
import os
import sys


def fmt_s(x):
    if x is None:
        return "–"
    x = float(x)
    m, s = divmod(int(round(x)), 60)
    return "%d:%02d" % (m, s)


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

    def table(rows, widths):
        t = LongTable(rows, colWidths=[w * mm for w in widths], repeatRows=1)
        t.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, -1), "DejaVu", 7.5),
            ("FONT", (0, 0), (-1, 0), "DejaVu-Bold", 7.5),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#efeaf7")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        return t

    inp = d["input"]
    s = d["summary"]
    idx = d["index"]
    tz = d["timezone"]
    story = [
        Paragraph("Отчёт сверки записи с каталогом АудиоЛад", h1),
        Paragraph("Проверка № %s · сформирован %s (%s), %s UTC" % (esc(d["job_id"]), esc(d["created_local"]), esc(tz), esc(d["created_at_utc"])), base),
        Paragraph("Запись", h2),
        Paragraph("Файл: %s · %s байт · длительность %s" % (esc(inp["name"]), inp["size_bytes"], fmt_s(inp["decoded_duration_s"])), base),
        Paragraph("SHA-256 файла записи: %s" % esc(inp["sha256"]), mono),
    ]
    tags = (inp.get("probe") or {}).get("tags") or {}
    if tags:
        story.append(Paragraph("Метаданные файла: " + esc(", ".join("%s=%s" % (k, v) for k, v in sorted(tags.items()))), small))
    if d.get("note"):
        story.append(Paragraph("Примечание: " + esc(d["note"]), small))

    story.append(Paragraph("Вывод", h2))
    tracks = s.get("catalog_tracks") or []
    if tracks:
        story.append(Paragraph(
            "В записи распознана музыка каталога АудиоЛад: %d трек(ов) – %s. Фрагментов по %s с: всего %d, совпали с каталогом %d, "
            "с контрольной чужой музыкой %d, без совпадения %d, противоречивых %d."
            % (len(tracks), esc(", ".join(tracks)), d["engine_params_window"] if "engine_params_window" in d else 10,
               s["windows"], s["catalog_windows"], s["control_windows"], s["unmatched_windows"], s["conflict_windows"]), base))
    else:
        story.append(Paragraph(
            "Совпадений с каталогом АудиоЛад не найдено. Фрагментов: %d, с контрольной чужой музыкой %d, без совпадения %d."
            % (s["windows"], s["control_windows"], s["unmatched_windows"]), base))
    for ref in d.get("claimed_refs") or []:
        story.append(Paragraph(
            "Трек из претензии «%s» (SHA-256 %s): %s." % (
                esc(ref.get("title")), esc(ref.get("sha256", "")[:16] + "…"),
                "звучит в записи во фрагментах: %d" % s["claimed_windows"] if s.get("claimed_windows") else "в записи не обнаружен"),
            base))

    segs = d.get("segments") or []
    if segs:
        story.append(Paragraph("Совпадения по времени записи", h2))
        rows = [["Запись", "Трек", "Название", "Позиция в треке", "Надёжность"]]
        conf = {"high": "высокая", "medium": "средняя", "low": "низкая"}
        for g in segs:
            kind = "" if g["kind"] == "catalog" else (" (контроль)" if g["kind"] == "control" else " (претензия)")
            rows.append(["%s–%s" % (fmt_s(g["rec_from_s"]), fmt_s(g["rec_to_s"])), esc(g["code"]) + kind,
                         Paragraph(esc(g.get("title") or ""), small),
                         "%s–%s" % (fmt_s(g["track_from_s"]), fmt_s(g["track_to_s"])), conf.get(g.get("confidence"), "")])
        story.append(table(rows, [22, 38, 62, 30, 22]))

    c = d.get("concordance")
    story.append(Paragraph("Сверка с журналом воспроизведения", h2))
    if not c:
        story.append(Paragraph("Не выполнялась: не указаны точка и время записи.", base))
    else:
        loc = c["location"]
        story.append(Paragraph("Точка: %s – %s, %s" % (esc(loc["organizationName"]), esc(loc["name"]), esc(loc.get("address") or "")), base))
        src = {"typed": "указано вручную", "file_metadata": "из метаданных файла"}.get(c.get("claimed_source"), "")
        story.append(Paragraph("Заявленное время записи: %s (%s)" % (esc(c.get("claimed_start_local") or "–"), src), base))
        if c.get("recording_start_local"):
            story.append(Paragraph(
                "Начало записи по журналу: %s, отличие от заявленного %s с. Подтверждено журналом %d из %d фрагментов каталога. Порядок треков %s."
                % (esc(c["recording_start_local"]), c.get("claimed_delta_s"), c["confirmed_segments"], c["catalog_segments"],
                   "совпадает" if c.get("order_consistent") else ("не совпадает" if c.get("order_consistent") is False else "не проверялся (меньше двух треков)")),
                base))
        else:
            story.append(Paragraph("В журнале точки за ±3 ч от заявленного времени нет воспроизведений распознанных треков.", base))
        story.append(Paragraph("Отметок журнала прочитано: %d. Допуск совпадения: %s с." % (c["facts"], c["tolerance_s"]), small))
        if c.get("checks"):
            rows = [["Запись", "Трек", "Звучал (время точки)", "Плеер", "Журнал"]]
            for k in c["checks"]:
                rows.append(["%s–%s" % (fmt_s(k["recFromS"]), fmt_s(k["recToS"])), esc(k["code"]),
                             "%s – %s" % (esc((k.get("heard_from_local") or "–")[5:]), esc((k.get("heard_to_local") or "–")[11:])),
                             esc(k.get("playerCode") or ""), "да (±%s с)" % abs(k["deltaS"] or 0) if k["confirmed"] else "нет"])
            story.append(table(rows, [22, 34, 52, 34, 32]))

    story.append(Paragraph("Метод", h2))
    story.append(Paragraph(
        "Запись делится на фрагменты по 10 с с шагом 5 с. Каждый фрагмент сравнивается с акустическими отпечатками всех "
        "треков каталога и контрольного набора чужой музыки двумя независимыми алгоритмами (audfprint и Olaf). "
        "Совпадение засчитывается, если хотя бы один алгоритм уверен, а при обоих – если они указывают один трек и одну позицию. "
        "Время в журнале – время сервера при приёме отметки плеера.", small))
    story.append(Paragraph("Индекс %s от %s: треков каталога %s, контрольных %s. Olaf: %s. Движок %s." % (
        esc(idx.get("version")), esc(idx.get("built_at")), idx.get("counts", {}).get("catalog"), idx.get("counts", {}).get("control"),
        esc((idx.get("olaf") or {}).get("version") or "нет"), esc(d.get("engine_version"))), small))
    story.append(Paragraph("SHA-256 индекса audfprint: %s" % esc(idx.get("audfprint_sha256")), mono))
    story.append(Paragraph("SHA-256 result.json: %s" % esc(d.get("result_sha256")), mono))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        "Хеши этого PDF и result.json записаны в report.json, который заверен технической печатью сервиса "
        "(Ed25519, report.sig, открытый ключ seal-public.pem). Это не квалифицированная электронная подпись.", small))
    story.append(Paragraph("SHA-256 открытого ключа печати: %s" % esc(d["seal_fingerprint"]), mono))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("DejaVu", 7)
        canvas.drawString(15 * mm, 10 * mm, "Сверка № %s · стр. %d" % (d["job_id"], doc.page))
        canvas.restoreState()

    doc = SimpleDocTemplate(a.out + ".tmp", pagesize=A4, leftMargin=12 * mm, rightMargin=12 * mm, topMargin=14 * mm,
                            bottomMargin=16 * mm, title="Сверка %s" % d["job_id"], author="АудиоЛад", invariant=1)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    os.replace(a.out + ".tmp", a.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
