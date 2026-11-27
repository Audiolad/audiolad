"""Манифест треков, закреплённые SHA256 и проверка файлов.

Аудио в репозиторий не входит. Скрипт только читает локальные файлы.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path


KNOWN_TRACKS = (
    {
        "id": "tihaya-garmoniya",
        "filename": "tihaya-garmoniya.mp3",
        "title": "Тихая гармония",
        "sha256": "adda7e8735f90686ed52516cd979b875ba7f955d15aee8faf412d018e20c291c",
        "label": "instrumental",
        "instruments": [],
        "note": "Aurafon, инструментальная spa-музыка",
    },
    {
        "id": "last-plastinka",
        "filename": "last-plastinka.wav",
        "title": "Последняя пластинка",
        "sha256": "793773feae95b724bce3c38d8f2c49a580c7e879a684d2349a6316acdb7759fa",
        "label": "instrumental",
        "instruments": [],
        "note": "Чили на виниле, инструментал без голоса",
    },
    {
        "id": "solnechnoe-utro-v-rime",
        "filename": "solnechnoe-utro-v-rime.mp3",
        "title": "Солнечное утро в Риме",
        "sha256": "f27965fc20e6cbb328d6ff34950b9a7d0e74a30e7815f4232060da515a60341a",
        "label": "instrumental",
        "instruments": ["piano", "guitar"],
        "note": "инструментальный джаз, фортепиано и гитара",
    },
    {
        "id": "kolybelnaya-vocal",
        "filename": "kolybelnaya-vocal.mp3",
        "title": "Колыбельная",
        "sha256": "33d0e3e111dc8c674faeacc16be574b6c34c5978561c6b7720a9867d90aabffc",
        "label": "vocal",
        "instruments": [],
        "note": "колыбельная, женский поющий голос",
    },
    {
        "id": "klyuch-k-izobiliyu",
        "filename": "klyuch-k-izobiliyu.mp3",
        "title": "Ключ к изобилию",
        "sha256": "2832b3104698e0767001bf56af596b06f5e79090fd842669718f1992afe85199",
        "label": "speech",
        "instruments": [],
        "note": "медитация с речью",
    },
)

LABELS = ("vocal", "speech", "instrumental")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")


class ManifestError(Exception):
    """Ошибка манифеста или контрольной суммы. Прогон останавливается."""


@dataclass
class Track:
    filename: str
    title: str
    path: Path
    sha256_expected: str | None
    sha256_actual: str | None
    label: str | None
    instruments: list[str]
    note: str | None
    analyzer: str | None
    known_id: str | None

    def to_public_dict(self) -> dict:
        return {
            "filename": self.filename,
            "title": self.title,
            "path": str(self.path),
            "sha256": self.sha256_actual,
            "sha256_expected": self.sha256_expected,
            "label": self.label,
            "instruments": list(self.instruments),
            "note": self.note,
            "analyzer": self.analyzer,
            "known_id": self.known_id,
        }


def canonical_title(title: str) -> str:
    text = title.lower().replace("ё", "е")
    text = re.sub(r"[^0-9a-zа-я]+", " ", text)
    return " ".join(text.split())


def match_known(filename: str, title: str | None) -> dict | None:
    by_filename = [item for item in KNOWN_TRACKS if item["filename"] == filename]
    by_title: list[dict] = []
    if title:
        folded = canonical_title(title)
        by_title = [
            item
            for item in KNOWN_TRACKS
            if canonical_title(item["title"]) in folded
        ]
    if len(by_filename) > 1 or len(by_title) > 1:
        raise ManifestError(f"«{filename}» совпало с несколькими закреплёнными треками")
    if by_filename and by_title and by_filename[0]["id"] != by_title[0]["id"]:
        raise ManifestError(
            f"файл {filename} закреплён как «{by_filename[0]['title']}», а название указывает на «{by_title[0]['title']}»"
        )
    if by_filename:
        return by_filename[0]
    return by_title[0] if by_title else None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _clean(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _label(value: object, title: str) -> str | None:
    text = _clean(value)
    if text is None:
        return None
    folded = text.lower()
    aliases = {
        "vocal": "vocal",
        "voice": "vocal",
        "singing": "vocal",
        "вокал": "vocal",
        "speech": "speech",
        "spoken": "speech",
        "spoken_word": "speech",
        "речь": "speech",
        "instrumental": "instrumental",
        "instrumental_only": "instrumental",
        "инструментал": "instrumental",
    }
    if folded not in aliases:
        allowed = ", ".join(LABELS)
        raise ManifestError(f"метка «{text}» у «{title}» не из списка {allowed}")
    return aliases[folded]


def _instruments(value: object) -> list[str] | None:
    if value is None or value == "":
        return None
    if isinstance(value, list):
        parts = [str(item).strip().lower() for item in value]
    else:
        parts = [part.strip().lower() for part in re.split(r"[;,]", str(value))]
    cleaned = [part for part in parts if part]
    return cleaned


def _row_get(row: dict, *keys: str) -> str | None:
    for key in keys:
        if key in row:
            return _clean(row.get(key))
    return None


def load_rows(path: Path) -> list[dict]:
    suffix = path.suffix.lower()
    if suffix == ".json":
        document = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(document, list):
            rows = document
        elif isinstance(document, dict) and isinstance(document.get("tracks"), list):
            rows = document["tracks"]
        else:
            raise ManifestError("JSON-манифест должен быть списком или объектом с полем tracks")
        if not all(isinstance(row, dict) for row in rows):
            raise ManifestError("каждая запись манифеста должна быть объектом")
        return rows
    if suffix == ".csv":
        with path.open(encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames is None or "filename" not in reader.fieldnames:
                raise ManifestError("CSV нужен с заголовком filename и далее sha256,label,instruments")
            return list(reader)
    raise ManifestError("манифест должен быть .json или .csv")


def manifest_input_dir(path: Path) -> Path | None:
    if path.suffix.lower() != ".json":
        return None
    document = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(document, dict):
        raw = _clean(document.get("input_dir"))
        if raw:
            return Path(raw).expanduser()
    return None


def resolve_tracks(manifest_path: Path, input_dir: Path | None, *, hash_files: bool = True) -> list[Track]:
    manifest_path = manifest_path.resolve()
    if not manifest_path.is_file():
        raise ManifestError(f"манифест не найден: {manifest_path}")
    directory = input_dir or manifest_input_dir(manifest_path) or manifest_path.parent
    directory = directory.expanduser().resolve()
    if not directory.is_dir():
        raise ManifestError(f"каталог аудио не найден: {directory}")

    rows = load_rows(manifest_path)
    if not rows:
        raise ManifestError("в манифесте нет треков")

    tracks: list[Track] = []
    seen: set[str] = set()
    for index, row in enumerate(rows, start=1):
        filename = _row_get(row, "filename", "file")
        if not filename:
            raise ManifestError(f"строка {index}: нужен filename")
        if filename != Path(filename).name or "/" in filename or "\\" in filename:
            raise ManifestError(f"filename «{filename}» должен быть именем файла без каталога")
        if filename in seen:
            raise ManifestError(f"filename «{filename}» повторяется")
        seen.add(filename)

        known = match_known(filename, _row_get(row, "title", "name"))
        title = _row_get(row, "title", "name") or (known["title"] if known else Path(filename).stem)
        given_sha = _row_get(row, "sha256", "expected_sha256", "sha")
        if given_sha is not None:
            given_sha = given_sha.lower()
            if not SHA_RE.fullmatch(given_sha):
                raise ManifestError(f"sha256 у «{title}» должен быть 64 hex-символа")

        expected = given_sha
        if known is not None:
            if given_sha is not None and given_sha != known["sha256"]:
                raise ManifestError(
                    f"для «{known['title']}» закреплён sha256 {known['sha256']}, в манифесте указан другой"
                )
            expected = known["sha256"]

        label = _label(_row_get(row, "label", "ground_truth", "ground_truth_label"), title)
        if label is None and known is not None:
            label = known["label"]
        instruments = _instruments(row.get("instruments"))
        if instruments is None and known is not None:
            instruments = list(known.get("instruments") or [])
        note = _row_get(row, "note") or (known.get("note") if known else None)
        analyzer = _row_get(row, "analyzer", "analyzer_result", "analyzer_path")
        audio_path = directory / filename
        if not audio_path.is_file():
            raise ManifestError(f"файл не найден: {audio_path}")

        actual = sha256_file(audio_path) if hash_files else None
        if hash_files and expected is not None and actual != expected:
            raise ManifestError(
                f"SHA256 не совпал у «{title}» ({filename}): файл {actual}, ожидался {expected}"
            )
        if hash_files and known is not None and actual != known["sha256"]:
            raise ManifestError(
                f"SHA256 закреплённого трека «{known['title']}» не совпал: файл {actual}"
            )

        tracks.append(
            Track(
                filename=filename,
                title=title,
                path=audio_path,
                sha256_expected=expected,
                sha256_actual=actual,
                label=label,
                instruments=instruments or [],
                note=note,
                analyzer=analyzer,
                known_id=known["id"] if known else None,
            )
        )
    return tracks
