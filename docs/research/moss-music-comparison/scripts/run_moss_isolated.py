#!/usr/bin/env python3
"""Изолированный запуск MOSS-Music-8B-Instruct вне приложения АудиоЛада.

Скрипт не входит в runtime Next.js и не вызывается из npm-тестов.
По умолчанию он отказывается работать: нет аудио, веса больше cgroup,
trust_remote_code выключен, пока ревизия не названа явно.

Веса и аудио не скачиваются, пока не переданы отдельные флаги.
Флаг загрузки весов качает только закреплённый репозиторий модели.
Чужое аудио не запрашивается.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


CODE_COMMIT = "ad107c7ddaa06de168a0dfbc18d3e1e6a40c0e5e"
WEIGHT_REVISION = "fce7f8304e96cc2d3398b8106456cbb2ecec3139"
TENSOR_BYTES = 18_104_928_256
REPO_ID = "OpenMOSS-Team/MOSS-Music-8B-Instruct"


def cgroup_limit() -> int | None:
    rel = Path("/proc/self/cgroup").read_text().strip().splitlines()[0].split(":", 2)[-1].lstrip("/")
    path = Path("/sys/fs/cgroup") / rel / "memory.max"
    if not path.exists():
        return None
    text = path.read_text().strip()
    if text == "max":
        return None
    return int(text)


def manifest_ready(path: Path) -> tuple[bool, str]:
    document = json.loads(path.read_text())
    missing = [track["id"] for track in document["tracks"] if not track.get("audio_path")]
    if missing:
        return False, "нет файлов: " + ", ".join(missing)
    return True, "paths present; still run verify_manifest.py before inference"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=Path(__file__).resolve().parents[1] / "sha256-manifest.json")
    parser.add_argument("--weights", type=Path, default=None)
    parser.add_argument("--download-weights", action="store_true")
    parser.add_argument("--allow-cpu-offload", action="store_true")
    parser.add_argument("--i-reviewed-remote-code", action="store_true")
    args = parser.parse_args()

    ready, reason = manifest_ready(args.manifest)
    limit = cgroup_limit()
    print(json.dumps({
        "code_commit": CODE_COMMIT,
        "weight_revision": WEIGHT_REVISION,
        "tensor_bytes": TENSOR_BYTES,
        "cgroup_memory_max": limit,
        "in_ram_bf16_fits": bool(limit and TENSOR_BYTES < limit),
        "manifest_ready": ready,
        "manifest_reason": reason,
    }, ensure_ascii=False, indent=2))

    if args.download_weights:
        if args.weights is None:
            print("нужен --weights для каталога загрузки", file=sys.stderr)
            return 2
        from huggingface_hub import snapshot_download

        snapshot_download(
            repo_id=REPO_ID,
            revision=WEIGHT_REVISION,
            local_dir=str(args.weights),
        )
        print("weights_downloaded", args.weights)
        return 0

    if not ready:
        print("отказ: эталонные файлы не приложены, анализ не запускается", file=sys.stderr)
        return 2
    if limit is not None and TENSOR_BYTES >= limit and not args.allow_cpu_offload:
        print("отказ: BF16 не помещается в cgroup; нужен --allow-cpu-offload и отдельная проверка пика", file=sys.stderr)
        return 2
    if not args.i_reviewed_remote_code:
        print("отказ: trust_remote_code не включён без явного --i-reviewed-remote-code", file=sys.stderr)
        return 2
    if args.weights is None or not args.weights.is_dir():
        print("отказ: локальный каталог весов не передан", file=sys.stderr)
        return 2
    print("условия флагов выполнены, но генерация в этом скрипте сознательно не подключена к приложению")
    print("после verify_manifest.py запускайте отдельно просмотренный загрузчик, не app runtime")
    return 0


if __name__ == "__main__":
    sys.exit(main())
