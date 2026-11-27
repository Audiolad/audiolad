#!/usr/bin/env python3
"""Прогон MOSS-Music по манифесту. Модель загружается один раз на все треки."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import wave
from pathlib import Path

from compare import write_comparison
from manifest import ManifestError, resolve_tracks
from metrics import format_summary_md, parse_moss_voice


KIT = Path(__file__).resolve().parent

MODEL = {
    "code_repo": "https://github.com/OpenMOSS/MOSS-Music",
    "code_commit": "ad107c7ddaa06de168a0dfbc18d3e1e6a40c0e5e",
    "weights_repo": "OpenMOSS-Team/MOSS-Music-8B-Instruct",
    "weights_revision": "fce7f8304e96cc2d3398b8106456cbb2ecec3139",
    "license_card": "apache-2.0",
    "license_file_present": False,
    "parameters": 9052464128,
    "dtype": "bfloat16",
    "variant": "instruct",
}


def load_prompts() -> list[dict]:
    document = json.loads((KIT / "prompts.json").read_text(encoding="utf-8"))
    prompts = document.get("prompts")
    if not isinstance(prompts, list) or not prompts:
        raise ManifestError("prompts.json пуст")
    return prompts


def decode_ffmpeg(path: Path, sample_rate: int):
    import numpy as np

    command = [
        "ffmpeg",
        "-nostdin",
        "-v",
        "error",
        "-i",
        str(path),
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-f",
        "f32le",
        "pipe:1",
    ]
    try:
        raw = subprocess.check_output(command)
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg не найден. Его ставит ./setup.sh") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"ffmpeg не декодировал {path.name}") from exc
    audio = np.frombuffer(raw, dtype="<f4").copy()
    if audio.size == 0:
        raise RuntimeError(f"пустое аудио: {path.name}")
    return audio


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as handle:
        frames = handle.getnframes()
        rate = handle.getframerate()
    if frames <= 0 or rate <= 0:
        raise ManifestError(f"пустой wav: {path.name}")
    return frames / float(rate)


def smoke_duration(path: Path) -> float | None:
    if path.suffix.lower() in {".wav", ".wave"}:
        return wav_duration(path)
    if subprocess.call(["ffmpeg", "-version"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) != 0:
        return None
    audio = decode_ffmpeg(path, 16000)
    return float(audio.size) / 16000.0


def blank_prompts(prompts: list[dict], note: str) -> list[dict]:
    rows = []
    for prompt in prompts:
        rows.append(
            {
                "id": prompt["id"],
                "title_ru": prompt.get("title_ru"),
                "prompt": prompt["text"],
                "max_new_tokens": prompt["max_new_tokens"],
                "answer": None,
                "seconds": None,
                "new_tokens": None,
                "input_tokens": None,
                "peak_allocated_bytes": None,
                "note": note,
            }
        )
    return rows


def result_document(mode: str, tracks: list[dict], timings: dict, gpu: dict | None, load_count: int, error: str | None) -> dict:
    return {
        "schema": "moss-music-experiment-1cd25ba6",
        "mode": mode,
        "model": {**MODEL, "load_count": load_count},
        "timings": timings,
        "gpu": gpu,
        "error": error,
        "tracks": tracks,
    }


def render_results_md(document: dict, summary_md: str) -> str:
    lines = [
        "# Результаты MOSS-Music",
        "",
        f"Режим: {document['mode']}. Вариант: {document['model']['variant']}. "
        f"Загрузок модели: {document['model']['load_count']}.",
        "",
        f"Код: `{document['model']['code_commit']}`",
        "",
        f"Веса: `{document['model']['weights_repo']}` @ `{document['model']['weights_revision']}`",
        "",
    ]
    if document.get("error"):
        lines.extend(["Остановка:", "", document["error"], ""])
    timings = document.get("timings") or {}
    lines.append(f"Загрузка, с: {timings.get('load_s')}. Весь прогон, с: {timings.get('total_s')}.")
    gpu = document.get("gpu") or {}
    if gpu:
        lines.append(
            f"GPU: {gpu.get('name')}. Всего байт: {gpu.get('total_bytes')}. "
            f"Пик allocated: {gpu.get('peak_allocated_bytes')}."
        )
    lines.append("")
    lines.append(summary_md.rstrip())
    lines.append("")
    for track in document["tracks"]:
        lines.append(f"## {track['title']}")
        lines.append("")
        lines.append(f"- Файл: `{track['filename']}`")
        lines.append(f"- SHA256: `{track['sha256']}`")
        lines.append(f"- Метка: {track.get('label') or 'нет'}")
        if track.get("duration_s") is not None:
            lines.append(f"- Длительность, с: {track['duration_s']:.3f}")
        if track.get("seconds") is not None:
            lines.append(f"- Время трека, с: {track['seconds']:.3f}")
        voice = track.get("voice") or {}
        lines.append(f"- Разобранный голос: {voice.get('label')}, уверенность {voice.get('confidence')}")
        for prompt in track.get("prompts") or []:
            lines.append("")
            lines.append(f"### {prompt.get('title_ru') or prompt.get('id')}")
            lines.append("")
            lines.append(f"Секунды: {prompt.get('seconds')}. Новых токенов: {prompt.get('new_tokens')}.")
            lines.append("")
            lines.append(prompt.get("answer") or "(ответа нет)")
        lines.append("")
    lines.append("Таблица сравнения пишется в `comparison.md`.")
    lines.append("")
    return "\n".join(lines)


def write_outputs(out_dir: Path, document: dict) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    results_path = out_dir / "results.json"
    results_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = write_comparison(results_path, out_dir / "comparison.md")
    summary_md = format_summary_md(summary)
    (out_dir / "results.md").write_text(render_results_md(document, summary_md), encoding="utf-8")


def light_tracks(tracks, prompts, mode: str) -> list[dict]:
    note = "dry-run: модель не загружалась" if mode == "dry-run" else "cpu-smoke: модель не загружалась"
    rows = []
    for track in tracks:
        duration = None
        if mode == "cpu-smoke":
            duration = smoke_duration(track.path)
        rows.append(
            {
                **track.to_public_dict(),
                "sha256": track.sha256_actual,
                "duration_s": duration,
                "seconds": None,
                "prompts": blank_prompts(prompts, note),
                "voice": {"label": "abstain", "confidence": None},
            }
        )
    return rows


def run_gpu(tracks, prompts, code_dir: Path, weights_dir: Path, out_dir: Path) -> int:
    os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True")
    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    for key in ("HF_TOKEN", "HUGGING_FACE_HUB_TOKEN", "HF_HUB_TOKEN"):
        os.environ.pop(key, None)
    started = time.perf_counter()
    try:
        import torch

        torch.backends.cuda.matmul.allow_tf32 = False
        torch.backends.cudnn.allow_tf32 = False
        try:
            torch.use_deterministic_algorithms(True, warn_only=True)
        except Exception:
            pass
        import engine
    except Exception as exc:
        document = result_document("gpu", [], {"total_s": None, "load_s": None}, None, 0, str(exc))
        write_outputs(out_dir, document)
        print(str(exc), file=sys.stderr)
        return 3

    gpu = engine.gpu_facts()
    load_started = time.perf_counter()
    try:
        loaded = engine.load_engine(code_dir, weights_dir)
    except Exception as exc:
        document = result_document(
            "gpu",
            [],
            {"total_s": round(time.perf_counter() - started, 3), "load_s": None},
            gpu,
            0,
            str(exc),
        )
        write_outputs(out_dir, document)
        print(str(exc), file=sys.stderr)
        return 3
    load_s = time.perf_counter() - load_started
    if loaded.load_count != 1:
        print("внутренняя ошибка: модель должна загружаться один раз", file=sys.stderr)
        return 3
    free_bytes, total_bytes = torch.cuda.mem_get_info()
    gpu["total_bytes"] = int(total_bytes)
    gpu["free_bytes_after_load"] = int(free_bytes)
    gpu["allocated_after_load"] = int(torch.cuda.memory_allocated())
    peak = int(torch.cuda.max_memory_allocated())
    rows = []
    for track in tracks:
        track_started = time.perf_counter()
        try:
            audio = decode_ffmpeg(track.path, loaded.sample_rate)
        except Exception as exc:
            document = result_document(
                "gpu",
                rows,
                {"total_s": round(time.perf_counter() - started, 3), "load_s": round(load_s, 3)},
                {**gpu, "peak_allocated_bytes": peak},
                loaded.load_count,
                f"{track.title}: {exc}",
            )
            write_outputs(out_dir, document)
            print(str(exc), file=sys.stderr)
            return 3
        prompt_rows = []
        voice = {"label": "abstain", "confidence": None}
        oom = None
        for prompt in prompts:
            prompt_started = time.perf_counter()
            try:
                answered = loaded.answer(audio, prompt["text"], int(prompt["max_new_tokens"]))
            except torch.cuda.OutOfMemoryError as exc:
                oom = f"CUDA out of memory на «{track.title}», промпт {prompt['id']}: {exc}"
                break
            peak = max(peak, int(answered["peak_allocated_bytes"]))
            prompt_rows.append(
                {
                    "id": prompt["id"],
                    "title_ru": prompt.get("title_ru"),
                    "prompt": prompt["text"],
                    "max_new_tokens": prompt["max_new_tokens"],
                    "answer": answered["answer"],
                    "seconds": round(time.perf_counter() - prompt_started, 3),
                    "new_tokens": answered["new_tokens"],
                    "input_tokens": answered["input_tokens"],
                    "peak_allocated_bytes": answered["peak_allocated_bytes"],
                }
            )
            if prompt["id"] == "voice":
                voice = parse_moss_voice(answered["answer"])
            print(
                f"[moss] {track.filename} {prompt['id']} {prompt_rows[-1]['seconds']}s tokens={answered['new_tokens']}",
                flush=True,
            )
        rows.append(
            {
                **track.to_public_dict(),
                "sha256": track.sha256_actual,
                "duration_s": round(float(audio.size) / loaded.sample_rate, 3),
                "seconds": round(time.perf_counter() - track_started, 3),
                "prompts": prompt_rows,
                "voice": voice,
            }
        )
        gpu["peak_allocated_bytes"] = peak
        partial = result_document(
            "gpu",
            rows,
            {"total_s": round(time.perf_counter() - started, 3), "load_s": round(load_s, 3)},
            gpu,
            loaded.load_count,
            oom,
        )
        write_outputs(out_dir, partial)
        if oom:
            print(oom, file=sys.stderr)
            return 3
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="MOSS-Music по манифесту треков")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--input-dir", type=Path, default=None)
    parser.add_argument("--out-dir", type=Path, default=KIT / "var" / "results")
    parser.add_argument("--code-dir", type=Path, default=KIT / "var" / "MOSS-Music")
    parser.add_argument("--weights-dir", type=Path, default=KIT / "var" / "weights" / "MOSS-Music-8B-Instruct")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--cpu-smoke", action="store_true")
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    if args.dry_run and args.cpu_smoke:
        print("укажите только один из --dry-run и --cpu-smoke", file=sys.stderr)
        return 2
    if args.limit is not None and args.limit < 1:
        print("--limit должен быть положительным", file=sys.stderr)
        return 2
    try:
        tracks = resolve_tracks(args.manifest, args.input_dir, hash_files=True)
        prompts = load_prompts()
    except ManifestError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    if args.limit is not None:
        tracks = tracks[: args.limit]
    mode = "dry-run" if args.dry_run else "cpu-smoke" if args.cpu_smoke else "gpu"
    out_dir = args.out_dir
    if mode != "gpu":
        started = time.perf_counter()
        document = result_document(
            mode,
            light_tracks(tracks, prompts, mode),
            {"total_s": None, "load_s": None},
            None,
            0,
            None,
        )
        document["timings"]["total_s"] = round(time.perf_counter() - started, 3)
        try:
            write_outputs(out_dir, document)
        except ManifestError as exc:
            print(str(exc), file=sys.stderr)
            return 2
        print(out_dir / "results.json")
        return 0
    code = run_gpu(tracks, prompts, args.code_dir, args.weights_dir, out_dir)
    if code == 0:
        print(out_dir / "results.json")
    return code


if __name__ == "__main__":
    sys.exit(main())
