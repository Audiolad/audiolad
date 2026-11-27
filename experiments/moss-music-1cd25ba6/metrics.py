"""Разбор ответа про голос и сводка точности по меткам.

Точность считается только там, где в манифесте есть метка
vocal / speech / instrumental. Смешанный ответ анализатора — это
утверждение «голос есть», а не точное попадание в класс.
"""

from __future__ import annotations

import re


EXACT_LABELS = ("instrumental", "vocal", "speech")
VOICE_YES = {"vocal", "speech", "mixed", "voice_unspecified"}
DISPLAY = {
    "instrumental": "инструментал",
    "vocal": "вокал",
    "speech": "речь",
    "mixed": "mixed (голос/смешение)",
    "voice_unspecified": "голос, тип не назван",
    "abstain": "не определено",
    "unavailable": "нет данных",
}


def display_label(label: str | None) -> str:
    if label is None or label == "":
        return DISPLAY["unavailable"]
    return DISPLAY.get(label, label)


def binary_voice(label: str | None) -> bool | None:
    if label in VOICE_YES:
        return True
    if label == "instrumental":
        return False
    return None


def parse_moss_voice(text: str | None) -> dict:
    if text is None or not str(text).strip():
        return {"label": "abstain", "confidence": None}

    cleaned = re.sub(r"<think>.*?</think>", " ", str(text), flags=re.IGNORECASE | re.DOTALL)
    cleaned = cleaned.strip()
    head = cleaned.splitlines()[0].strip()
    window = cleaned[:800]
    confidence = _confidence(head, window)
    head_label = _explicit_label(head)
    if head_label is not None:
        return {"label": head_label, "confidence": confidence}

    if _negated_voice(window):
        return {"label": "instrumental", "confidence": confidence}
    if re.search(r"\b(singing|sung|vocal|вокал|пение|поёт|поет)\b", window, re.IGNORECASE):
        return {"label": "vocal", "confidence": confidence}
    if re.search(r"\b(speech|spoken|talking|речь|говорит)\b", window, re.IGNORECASE):
        return {"label": "speech", "confidence": confidence}
    if re.search(r"\b(yes|да)\b", head, re.IGNORECASE):
        return {"label": "voice_unspecified", "confidence": confidence}
    return {"label": "abstain", "confidence": confidence}


def _explicit_label(head: str) -> str | None:
    match = re.match(
        r"^\s*(?:label\s*[:=]\s*)?(instrumental|speech|vocal|mixed)\b",
        head,
        re.IGNORECASE,
    )
    if match:
        return match.group(1).lower()
    if re.match(r"^\s*инструментал", head, re.IGNORECASE):
        return "instrumental"
    if re.match(r"^\s*речь\b", head, re.IGNORECASE):
        return "speech"
    if re.match(r"^\s*вокал", head, re.IGNORECASE):
        return "vocal"
    return None


def _negated_voice(text: str) -> bool:
    return re.search(
        r"\b(no|not|without|нет|отсутств\w*)\b.{0,48}\b(voice|singing|speech|vocal|голос|пени\w*|вокал)",
        text,
        re.IGNORECASE,
    ) is not None


def _confidence(head: str, window: str) -> float | None:
    match = re.search(
        r"(?:confidence|уверенност\w*)\s*[:=]?\s*(1(?:\.0+)?|0(?:\.\d+)?|\d{1,3}(?:\.\d+)?)\s*%?",
        window,
        re.IGNORECASE,
    )
    if match is None:
        match = re.search(r"\b(0\.\d+|1\.0+|1|0)\b", head)
    if match is None:
        return None
    value = float(match.group(1))
    if match.group(0).strip().endswith("%") or value > 1:
        if value > 100:
            return None
        value = value / 100
    if value < 0 or value > 1:
        return None
    return value


def screen_from_scores(scores: dict | None, mixed_consistency: float | None = None) -> str:
    """Порог экрана из features.mjs после E20: победитель ≥ 0.35 и отрыв ≥ 0.08."""
    if not scores:
        return "unavailable"
    needed = ("instrumental", "vocal", "spoken_word", "mixed")
    if any(scores.get(key) is None for key in needed):
        return "unavailable"
    try:
        values = {key: float(scores[key]) for key in needed}
    except (TypeError, ValueError):
        return "unavailable"
    if any(value < 0 or value > 1 for value in values.values()):
        return "unavailable"
    winner = max(values, key=values.get)
    ordered = sorted(values.values(), reverse=True)
    margin = ordered[0] - ordered[1]
    if values[winner] < 0.35 or margin < 0.08:
        return "abstain"
    if winner == "mixed":
        if (
            values["vocal"] < 0.35
            or values["vocal"] - values["instrumental"] < 0.08
            or mixed_consistency is None
            or mixed_consistency < 0.6
        ):
            return "abstain"
        return "mixed"
    if winner == "spoken_word":
        return "speech"
    return winner


def _status(prediction: str | None, truth: str) -> str:
    if prediction in (None, "", "unavailable"):
        return "unavailable"
    if prediction == "abstain":
        return "abstain"
    return "correct" if prediction == truth else "wrong"


def _binary_status(prediction: str | None, truth: str) -> str:
    predicted = binary_voice(prediction)
    actual = binary_voice(truth)
    if actual is None:
        return "unavailable"
    if predicted is None:
        return "abstain" if prediction == "abstain" else "unavailable"
    return "correct" if predicted is actual else "wrong"


def empty_counts() -> dict:
    return {"n": 0, "correct": 0, "wrong": 0, "abstain": 0, "unavailable": 0}


def summarize(rows: list[dict]) -> dict:
    labels = list(EXACT_LABELS)
    systems = ("moss", "analyzer_raw", "analyzer_screen")
    exact = {system: {label: empty_counts() for label in labels} for system in systems}
    binary = {system: {label: empty_counts() for label in labels} for system in systems}
    overall_exact = {system: empty_counts() for system in systems}
    overall_binary = {system: empty_counts() for system in systems}

    used = 0
    for row in rows:
        truth = row.get("truth")
        if truth not in EXACT_LABELS:
            continue
        used += 1
        for system in systems:
            prediction = row.get(system)
            for table, status in (
                (exact, _status(prediction, truth)),
                (binary, _binary_status(prediction, truth)),
            ):
                table[system][truth]["n"] += 1
                table[system][truth][status] += 1
            overall_exact[system]["n"] += 1
            overall_exact[system][_status(prediction, truth)] += 1
            overall_binary[system]["n"] += 1
            overall_binary[system][_binary_status(prediction, truth)] += 1

    return {
        "labelled": used,
        "exact": exact,
        "binary": binary,
        "overall_exact": overall_exact,
        "overall_binary": overall_binary,
        "definition": (
            "Трёхклассовое совпадение: instrumental, vocal или speech. "
            "mixed и неназванный голос — ответ «голос есть», но не точный класс. "
            "Воздержание («не определено») не считается верным. "
            "Бинарная проверка: instrumental = голоса нет, остальные названные голосовые метки = голос есть."
        ),
    }


def _ratio(correct: int, total: int) -> str:
    if total == 0:
        return "—"
    return f"{correct}/{total} ({correct / total:.0%})"


INSTRUMENT_ALIASES = {
    "piano": ("piano", "пианино", "фортепиано", "рояль"),
    "guitar": ("guitar", "гитара"),
}


def _instrument_blob(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple)):
        return " ".join(str(item) for item in value).lower()
    return str(value).lower()


def instrument_found(name: str, value) -> bool:
    blob = _instrument_blob(value)
    aliases = INSTRUMENT_ALIASES.get(name, (name.lower(),))
    return any(alias in blob for alias in aliases)


def summarize_instruments(rows: list[dict]) -> dict:
    """Полнота известных инструментов. Лишние названия в ответе не штрафуются."""
    details = []
    moss_hit = moss_total = analyzer_hit = analyzer_total = 0
    for row in rows:
        expected = [str(item).strip().lower() for item in (row.get("instruments") or []) if str(item).strip()]
        if not expected:
            continue
        moss_text = row.get("moss_instruments") or ""
        analyzer_labels = row.get("analyzer_instruments")
        item_rows = []
        for name in expected:
            moss_ok = instrument_found(name, moss_text)
            analyzer_ok = None if analyzer_labels is None else instrument_found(name, analyzer_labels)
            moss_total += 1
            moss_hit += int(moss_ok)
            if analyzer_ok is not None:
                analyzer_total += 1
                analyzer_hit += int(analyzer_ok)
            item_rows.append({"instrument": name, "moss": moss_ok, "analyzer": analyzer_ok})
        details.append({"title": row.get("title"), "items": item_rows})
    return {
        "tracks": details,
        "moss_hit": moss_hit,
        "moss_total": moss_total,
        "analyzer_hit": analyzer_hit,
        "analyzer_total": analyzer_total,
        "definition": (
            "Считаются только инструменты, названные в метке. "
            "Попадание — если слово есть в ответе MOSS или в списке анализатора. "
            "Лишние инструменты не снижают долю. Нет списка анализатора — это отсутствие данных, не ошибка."
        ),
    }


def format_instrument_md(summary: dict) -> str:
    lines = [
        "### Инструменты, где метка известна",
        "",
        summary["definition"],
        "",
        "| Трек | Инструмент | MOSS | Анализатор |",
        "| --- | --- | --- | --- |",
    ]
    if not summary["tracks"]:
        lines.append("| — | нет меток инструментов | — | — |")
    for track in summary["tracks"]:
        for item in track["items"]:
            analyzer = "нет данных" if item["analyzer"] is None else ("да" if item["analyzer"] else "нет")
            lines.append(
                f"| {track['title']} | {item['instrument']} | {'да' if item['moss'] else 'нет'} | {analyzer} |"
            )
    lines.append("")
    lines.append(
        f"MOSS: {_ratio(summary['moss_hit'], summary['moss_total'])}. "
        f"Анализатор: {_ratio(summary['analyzer_hit'], summary['analyzer_total'])}."
    )
    lines.append("")
    return "\n".join(lines)


def format_summary_md(summary: dict) -> str:
    lines = [
        "### Голос: точность по меткам",
        "",
        summary["definition"],
        "",
        "Точность в таблице — верные ответы ко всем трекам метки. Воздержание входит в знаменатель и не считается успехом.",
        "",
    ]
    blocks = (
        ("MOSS", "moss"),
        ("Анализатор, исходный vocal.type", "analyzer_raw"),
        ("Анализатор, экран после порогов", "analyzer_screen"),
    )
    for title, system in blocks:
        lines.append(f"#### {title}")
        lines.append("")
        lines.append("| Метка | Треков | Верно | Неверно | Воздержался | Нет данных | Точность |")
        lines.append("| --- | ---: | ---: | ---: | ---: | ---: | ---: |")
        for label in EXACT_LABELS:
            counts = summary["exact"][system][label]
            lines.append(
                "| {label} | {n} | {correct} | {wrong} | {abstain} | {unavailable} | {ratio} |".format(
                    label=display_label(label),
                    ratio=_ratio(counts["correct"], counts["n"]),
                    **counts,
                )
            )
        overall = summary["overall_exact"][system]
        lines.append(
            "| все метки | {n} | {correct} | {wrong} | {abstain} | {unavailable} | {ratio} |".format(
                ratio=_ratio(overall["correct"], overall["n"]),
                **overall,
            )
        )
        binary = summary["overall_binary"][system]
        lines.append("")
        lines.append(
            "Бинарно «голос есть / нет»: {ratio}; неверно {wrong}; воздержался или нет данных {rest}.".format(
                ratio=_ratio(binary["correct"], binary["n"]),
                wrong=binary["wrong"],
                rest=binary["abstain"] + binary["unavailable"],
            )
        )
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"
