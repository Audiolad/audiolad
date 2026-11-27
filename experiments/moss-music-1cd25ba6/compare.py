#!/usr/bin/env python3
"""Сводка MOSS-Music и Музыкального анализатора на русском.

Читает results.json прогона и снимки или полные JSON анализатора.
Аудио и сырой экспорт «Последней пластинки» не требуются в git.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from manifest import ManifestError
from metrics import (
    display_label,
    format_instrument_md,
    format_summary_md,
    screen_from_scores,
    summarize,
    summarize_instruments,
)


KIT = Path(__file__).resolve().parent


def cell(value, limit: int = 220) -> str:
    text = " ".join(str(value).split()) if value not in (None, "") else "нет данных"
    text = text.replace("|", "/")
    if len(text) > limit:
        return text[: limit - 1] + "…"
    return text


def top_labels(items, limit: int) -> list[str]:
    if not isinstance(items, list):
        return []
    labels = []
    for item in items:
        if isinstance(item, str) and item.strip():
            labels.append(item.strip())
        elif isinstance(item, dict):
            label = item.get("label") or item.get("name")
            if label:
                labels.append(str(label))
        if len(labels) >= limit:
            break
    return labels


def normalize_snapshot(data: dict) -> dict:
    screen = data.get("vocal_screen")
    if screen in (None, ""):
        screen = "unavailable"
    raw = data.get("vocal_raw") or "unavailable"
    return {
        "title": data.get("title"),
        "source": data.get("source"),
        "vocal_raw": raw,
        "vocal_screen": screen,
        "vocal_screen_note": data.get("vocal_screen_note") or "",
        "vocal_decision": data.get("vocal_decision") or "",
        "genres": data.get("genres") or [],
        "styles": data.get("styles") or [],
        "styles_note": data.get("styles_note") or "",
        "instruments": data.get("instruments") or [],
        "moods": data.get("moods") or [],
        "tempo": data.get("tempo") or "нет данных",
        "energy": data.get("energy") or "нет данных",
        "duration_s": data.get("duration_s"),
    }


def _analysis_note(document: dict, vocal: dict) -> str:
    decision = vocal.get("decision")
    if decision:
        return str(decision)
    analysis = document.get("analysis")
    if isinstance(analysis, dict):
        return str(analysis.get("vocal_decision_rule") or "")
    return ""


def normalize_normalized(document: dict, source: str) -> dict:
    vocal = document.get("vocal") if isinstance(document.get("vocal"), dict) else {}
    raw_scores = vocal.get("scores") if isinstance(vocal.get("scores"), dict) else {}
    scores = {}
    for key in ("instrumental", "vocal", "mixed", "spoken_word"):
        item = raw_scores.get(key)
        if isinstance(item, dict) and item.get("average") is not None:
            scores[key] = item.get("average")
    mixed = raw_scores.get("mixed") if isinstance(raw_scores.get("mixed"), dict) else {}
    raw = vocal.get("type") or "unavailable"
    if raw == "spoken_word":
        raw = "speech"
    features = {}
    wrapper = document.get("analysis_features_v1")
    if isinstance(wrapper, dict) and isinstance(wrapper.get("features"), dict):
        features = wrapper["features"]
    energy_feature = features.get("energy_0_100") if isinstance(features.get("energy_0_100"), dict) else {}
    energy_value = energy_feature.get("value")
    version = energy_feature.get("model_version") or ""
    technical = document.get("technical") if isinstance(document.get("technical"), dict) else {}
    bpm = technical.get("bpm")
    tempo = "BPM не определён" if bpm in (None, "") else f"BPM {bpm}"
    energy = "нет данных" if energy_value is None else f"{energy_value}/100, {version}, confidence=null".strip(", ")
    return {
        "title": None,
        "source": source,
        "vocal_raw": raw,
        "vocal_screen": screen_from_scores(scores, mixed.get("segment_consistency")),
        "vocal_screen_note": _analysis_note(document, vocal),
        "vocal_decision": vocal.get("decision") or "",
        "genres": top_labels(document.get("genres"), 3),
        "styles": top_labels(document.get("styles"), 3),
        "styles_note": "",
        "instruments": top_labels(document.get("instruments"), 10),
        "moods": top_labels(document.get("moods"), 5),
        "tempo": tempo,
        "energy": energy,
        "duration_s": technical.get("duration_seconds"),
    }


def normalize_eval_track(track: dict) -> dict:
    after = track.get("after") if isinstance(track.get("after"), dict) else {}
    before = track.get("before") if isinstance(track.get("before"), dict) else {}
    prediction = after.get("prediction") if isinstance(after.get("prediction"), dict) else {}
    vocal = prediction.get("vocal") or "unavailable"
    if vocal == "spoken_word":
        vocal = "speech"
    energy = prediction.get("energy")
    bpm = prediction.get("tempo_bpm")
    styles = prediction.get("subgenre") or []
    return {
        "title": track.get("title"),
        "source": "eval-results",
        "vocal_raw": vocal,
        "vocal_screen": "unavailable",
        "vocal_screen_note": "В сводке eval нет четырёх сходств, порог экрана не пересчитан.",
        "vocal_decision": before.get("vocal_decision") or "",
        "genres": prediction.get("genre") or [],
        "styles": styles,
        "styles_note": "",
        "instruments": prediction.get("instruments") or [],
        "moods": prediction.get("mood") or [],
        "tempo": "BPM не определён" if bpm in (None, "") else f"BPM {bpm}",
        "energy": "нет данных" if energy is None else f"{energy}/100",
        "duration_s": (track.get("local_measurements") or {}).get("duration_s"),
    }


def normalize_document(data: dict, source: str) -> dict | None:
    if not isinstance(data, dict):
        return None
    if data.get("schema") == "audiolad-analyzer-snapshot" or "vocal_raw" in data:
        return normalize_snapshot(data)
    if isinstance(data.get("normalized_json"), dict):
        found = normalize_normalized(data["normalized_json"], source)
        found["title"] = found["title"] or data.get("title")
        return found
    if isinstance(data.get("vocal"), dict) and "moods" in data:
        return normalize_normalized(data, source)
    if "before" in data and "after" in data:
        return normalize_eval_track(data)
    tracks = data.get("tracks")
    if isinstance(tracks, list) and any(isinstance(item, dict) and "after" in item for item in tracks):
        return None
    return None


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def builtin_by_sha() -> dict[str, dict]:
    found = {}
    folder = KIT / "analyzer"
    if not folder.is_dir():
        return found
    for path in sorted(folder.glob("*.json")):
        data = load_json(path)
        sha = str(data.get("sha256") or "").lower()
        normalized = normalize_document(data, str(path))
        if sha and normalized is not None:
            found[sha] = normalized
    return found


def resolve_analyzer(track: dict, builtins: dict[str, dict]) -> dict | None:
    raw_path = track.get("analyzer")
    if raw_path:
        path = Path(raw_path).expanduser()
        if not path.is_file():
            raise ManifestError(f"файл анализатора не найден: {path}")
        data = load_json(path)
        sha = str(track.get("sha256") or "").lower()
        if isinstance(data.get("tracks"), list):
            for item in data["tracks"]:
                if isinstance(item, dict) and str(item.get("sha256") or "").lower() == sha:
                    normalized = normalize_document(item, str(path))
                    if normalized is not None:
                        return normalized
            raise ManifestError(f"в {path} нет трека с sha256 {sha}")
        normalized = normalize_document(data, str(path))
        if normalized is None:
            raise ManifestError(f"не понял формат анализатора: {path}")
        file_sha = str(data.get("sha256") or "").lower()
        if file_sha and sha and file_sha != sha:
            raise ManifestError(f"sha256 анализатора {file_sha} не равен файлу трека {sha}")
        return normalized
    sha = str(track.get("sha256") or "").lower()
    return builtins.get(sha)


def prompt_text(track: dict, prompt_id: str) -> str:
    for prompt in track.get("prompts") or []:
        if prompt.get("id") == prompt_id:
            return prompt.get("answer") or ""
    return ""


def comparison_rows(results: dict) -> list[dict]:
    builtins = builtin_by_sha()
    rows = []
    for track in results.get("tracks") or []:
        analyzer = resolve_analyzer(track, builtins)
        voice = (track.get("voice") or {}).get("label") or "abstain"
        rows.append(
            {
                "title": track.get("title"),
                "filename": track.get("filename"),
                "sha256": track.get("sha256"),
                "truth": track.get("label"),
                "moss": voice,
                "moss_confidence": (track.get("voice") or {}).get("confidence"),
                "analyzer_raw": None if analyzer is None else analyzer.get("vocal_raw"),
                "analyzer_screen": None if analyzer is None else analyzer.get("vocal_screen"),
                "analyzer": analyzer,
                "track": track,
            }
        )
    return rows


def render_markdown(results: dict, rows: list[dict]) -> str:
    summary_rows = [
        {
            "truth": row["truth"],
            "moss": row["moss"],
            "analyzer_raw": row["analyzer_raw"] if row["analyzer"] else "unavailable",
            "analyzer_screen": row["analyzer_screen"] if row["analyzer"] else "unavailable",
        }
        for row in rows
    ]
    lines = [
        "# MOSS-Music и Музыкальный анализатор",
        "",
        "Сходства анализатора — cosine CLAP, не вероятности. Текст MOSS — ответ модели, не измерение.",
        "",
        "| Трек | Метка | MOSS: голос | Уверенность MOSS | Анализатор: исходный тип | Анализатор: экран | MOSS: настроение | Анализатор: настроение | MOSS: инструменты | Анализатор: инструменты | MOSS: жанр | Анализатор: жанр | MOSS: темп и энергия | Анализатор: темп и энергия |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        analyzer = row["analyzer"] or {}
        confidence = row["moss_confidence"]
        confidence_text = "нет" if confidence is None else f"{confidence:.2f}"
        genre_analyzer = ", ".join(analyzer.get("genres") or [])
        styles = ", ".join(analyzer.get("styles") or [])
        if styles:
            genre_analyzer = (genre_analyzer + "; стили: " + styles).strip("; ")
        if analyzer.get("styles_note"):
            genre_analyzer = (genre_analyzer + ". " + analyzer["styles_note"]).strip()
        tempo_energy = " / ".join(
            part for part in (prompt_text(row["track"], "tempo_energy"),) if part
        )
        analyzer_tempo = " ".join(
            part for part in (str(analyzer.get("tempo") or ""), str(analyzer.get("energy") or "")) if part and part != "нет данных"
        ) or "нет данных"
        lines.append(
            "| {title} | {truth} | {moss} | {confidence} | {raw} | {screen} | {mood} | {amood} | {inst} | {ainst} | {genre} | {agenre} | {tempo} | {atempo} |".format(
                title=cell(row["title"], 80),
                truth=cell(display_label(row["truth"]) if row["truth"] else "нет метки", 40),
                moss=cell(display_label(row["moss"]), 40),
                confidence=confidence_text,
                raw=cell(display_label(row["analyzer_raw"]) if row["analyzer"] else "нет данных", 40),
                screen=cell(display_label(row["analyzer_screen"]) if row["analyzer"] else "нет данных", 40),
                mood=cell(prompt_text(row["track"], "mood")),
                amood=cell(", ".join(analyzer.get("moods") or []) or "нет данных"),
                inst=cell(prompt_text(row["track"], "instruments")),
                ainst=cell(", ".join(analyzer.get("instruments") or []) or "нет данных"),
                genre=cell(prompt_text(row["track"], "genre")),
                agenre=cell(genre_analyzer or "нет данных"),
                tempo=cell(tempo_energy or "нет данных"),
                atempo=cell(analyzer_tempo),
            )
        )
    lines.append("")
    lines.append(format_summary_md(summarize(summary_rows)).rstrip())
    lines.append("")
    instrument_rows = []
    for row in rows:
        analyzer = row["analyzer"] or {}
        instrument_rows.append(
            {
                "title": row["title"],
                "instruments": (row["track"].get("instruments") or []),
                "moss_instruments": prompt_text(row["track"], "instruments"),
                "analyzer_instruments": None if row["analyzer"] is None else (analyzer.get("instruments") or []),
            }
        )
    lines.append(format_instrument_md(summarize_instruments(instrument_rows)).rstrip())
    lines.append("")
    lines.append("## Ответы MOSS по трекам")
    lines.append("")
    for row in rows:
        lines.append(f"### {row['title']}")
        lines.append("")
        lines.append(f"- Файл: `{row['filename']}`")
        lines.append(f"- SHA256: `{row['sha256']}`")
        expected = row["track"].get("instruments") or []
        if expected:
            lines.append("- Метка инструментов: " + ", ".join(expected))
        if row["track"].get("note"):
            lines.append(f"- Контекст метки: {row['track']['note']}")
        analyzer = row["analyzer"] or {}
        if analyzer.get("vocal_decision"):
            lines.append(f"- Решение анализатора: {analyzer['vocal_decision']}")
        if analyzer.get("vocal_screen_note"):
            lines.append(f"- Экран анализатора: {analyzer['vocal_screen_note']}")
        if analyzer.get("source"):
            lines.append(f"- Источник анализатора: {analyzer['source']}")
        describe = prompt_text(row["track"], "describe")
        if describe:
            lines.append("")
            lines.append("Описание MOSS:")
            lines.append("")
            lines.append(describe)
        voice = prompt_text(row["track"], "voice")
        if voice:
            lines.append("")
            lines.append("Ответ про голос:")
            lines.append("")
            lines.append(voice)
        lines.append("")
    timing = results.get("timings") or {}
    gpu = results.get("gpu") or {}
    lines.append("## Ресурсы прогона")
    lines.append("")
    lines.append(f"- Режим: {results.get('mode')}")
    lines.append(f"- Загрузка модели, с: {timing.get('load_s')}")
    lines.append(f"- Весь прогон, с: {timing.get('total_s')}")
    lines.append(f"- Загрузок модели: {results.get('model', {}).get('load_count')}")
    if gpu:
        lines.append(f"- GPU: {gpu.get('name')}, всего байт {gpu.get('total_bytes')}, пик allocated {gpu.get('peak_allocated_bytes')}")
    lines.append("")
    return "\n".join(lines)


def write_comparison(results_path: Path, out_path: Path) -> dict:
    results = load_json(results_path)
    rows = comparison_rows(results)
    text = render_markdown(results, rows)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf-8")
    summary = summarize(
        [
            {
                "truth": row["truth"],
                "moss": row["moss"],
                "analyzer_raw": row["analyzer_raw"] if row["analyzer"] else "unavailable",
                "analyzer_screen": row["analyzer_screen"] if row["analyzer"] else "unavailable",
            }
            for row in rows
        ]
    )
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Сравнить results.json MOSS с анализатором")
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not args.results.is_file():
        print(f"нет {args.results}", file=sys.stderr)
        return 2
    try:
        write_comparison(args.results, args.out)
    except (ManifestError, json.JSONDecodeError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    print(args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
