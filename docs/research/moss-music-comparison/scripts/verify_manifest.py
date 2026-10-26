#!/usr/bin/env python3
"""Проверить SHA256 файлов из манифеста.

Код выхода 0 – каждый трек на месте и хеш совпал.
Код выхода 2 – хотя бы один файл отсутствует или хеш не совпал.
Аудио никуда не скачивается.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "sha256-manifest.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    document = json.loads(MANIFEST.read_text())
    rows = []
    failed = 0
    for track in document["tracks"]:
        raw_path = track.get("audio_path")
        expected = track["sha256"]
        if not raw_path:
            failed += 1
            rows.append({
                "id": track["id"],
                "status": "missing",
                "expected_sha256": expected,
                "actual_sha256": None,
            })
            continue
        path = Path(raw_path)
        if not path.is_file():
            failed += 1
            rows.append({
                "id": track["id"],
                "status": "missing",
                "path": str(path),
                "expected_sha256": expected,
                "actual_sha256": None,
            })
            continue
        actual = sha256_file(path)
        ok = actual == expected
        if not ok:
            failed += 1
        rows.append({
            "id": track["id"],
            "status": "match" if ok else "mismatch",
            "path": str(path),
            "expected_sha256": expected,
            "actual_sha256": actual,
            "bytes": path.stat().st_size,
        })
    summary = {"tracks": len(rows), "failed": failed, "rows": rows}
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
