#!/usr/bin/env python3
"""Снять аппаратный потолок этой машины, не скачивая веса и аудио.

Печатает JSON в stdout. Ничего не ставит и не выделяет большие буферы.
"""

from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
from pathlib import Path


WEIGHT_BYTES = 18_105_036_640
TENSOR_BYTES = 18_104_928_256
CGROUP_CANDIDATES = [
    Path("/sys/fs/cgroup/memory.max"),
]


def read_meminfo() -> dict[str, int]:
    out: dict[str, int] = {}
    for line in Path("/proc/meminfo").read_text().splitlines():
        key, value = line.split(":", 1)
        if key in {"MemTotal", "MemFree", "MemAvailable", "SwapTotal", "CommitLimit", "Committed_AS"}:
            out[key] = int(value.strip().split()[0]) * 1024
    return out


def read_balloon() -> dict[str, int]:
    out: dict[str, int] = {}
    for line in Path("/proc/vmstat").read_text().splitlines():
        if line.startswith("balloon_"):
            key, value = line.split()
            out[key] = int(value)
    return out


def cgroup_memory_max() -> dict[str, str | int | None]:
    raw = Path("/proc/self/cgroup").read_text().strip().splitlines()
    rel = raw[0].split(":", 2)[-1].lstrip("/") if raw else ""
    base = Path("/sys/fs/cgroup") / rel
    path = base / "memory.max"
    if not path.exists():
        return {"path": str(path), "bytes": None}
    text = path.read_text().strip()
    return {"path": str(path), "bytes": None if text == "max" else int(text), "raw": text}


def main() -> None:
    nvidia = shutil.which("nvidia-smi")
    gpu_rc = None
    gpu_tail = None
    if nvidia:
        proc = subprocess.run([nvidia, "-L"], capture_output=True, text=True)
        gpu_rc = proc.returncode
        gpu_tail = (proc.stdout or proc.stderr)[-500:]
    report = {
        "python": platform.python_version(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "cpu_count": os.cpu_count(),
        "nvidia_smi": nvidia,
        "nvidia_rc": gpu_rc,
        "nvidia_output": gpu_tail,
        "torch_importable": False,
        "meminfo_bytes": read_meminfo(),
        "balloon_pages": read_balloon(),
        "cgroup_memory_max": cgroup_memory_max(),
        "moss_weight_files_bytes": WEIGHT_BYTES,
        "moss_tensor_bytes_bf16": TENSOR_BYTES,
        "in_ram_bf16_fits_cgroup": False,
    }
    cap = report["cgroup_memory_max"]["bytes"]
    if isinstance(cap, int):
        report["in_ram_bf16_fits_cgroup"] = TENSOR_BYTES < cap
        report["cgroup_shortfall_bytes"] = max(0, TENSOR_BYTES - cap)
    try:
        import torch  # noqa: F401

        report["torch_importable"] = True
    except Exception as exc:  # noqa: BLE001
        report["torch_error"] = f"{type(exc).__name__}: {exc}"
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
