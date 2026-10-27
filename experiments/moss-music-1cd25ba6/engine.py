"""Один процесс, одна загрузка MOSS-Music-8B-Instruct.

Тело генерации повторяет src/hf_inference.py закреплённого коммита
ad107c7ddaa06de168a0dfbc18d3e1e6a40c0e5e, но принимает уже декодированную
волновую форму: так шесть промптов не перечитывают файл и не требуют
torchcodec. Веса остаются на cuda:0 между треками.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import torch


L4_MIN_BYTES = 22 * 1024**3
CODE_COMMIT = "ad107c7ddaa06de168a0dfbc18d3e1e6a40c0e5e"


class Engine:
    def __init__(self, model, processor):
        self.model = model
        self.processor = processor
        self.load_count = 1
        self.sample_rate = int(processor.config.mel_sr)

    def answer(self, audio: np.ndarray, question: str, max_new_tokens: int) -> dict:
        torch.manual_seed(0)
        torch.cuda.manual_seed_all(0)
        torch.cuda.reset_peak_memory_stats()
        inputs = self.processor(text=question, audios=[audio], return_tensors="pt")
        inputs = inputs.to(self.model.device)
        if inputs.get("audio_data") is not None:
            inputs["audio_data"] = inputs["audio_data"].to(self.model.dtype)
        inputs["audio_input_mask"] = inputs["input_ids"] == self.processor.audio_token_id
        with torch.inference_mode():
            generated_ids = self.model.generate(
                **inputs,
                max_new_tokens=int(max_new_tokens),
                do_sample=False,
                num_beams=1,
                use_cache=True,
            )
        input_len = int(inputs["input_ids"].shape[1])
        new_ids = generated_ids[0, input_len:]
        text = self.processor.decode(new_ids, skip_special_tokens=True).strip()
        peak = int(torch.cuda.max_memory_allocated())
        del inputs, generated_ids
        torch.cuda.empty_cache()
        return {
            "answer": text,
            "new_tokens": int(new_ids.shape[0]),
            "input_tokens": input_len,
            "peak_allocated_bytes": peak,
        }


def load_engine(code_dir: Path, weights_dir: Path) -> Engine:
    code_dir = code_dir.resolve()
    weights_dir = weights_dir.resolve()
    if not (code_dir / "src" / "hf_inference.py").is_file():
        raise RuntimeError(f"нет исходников MOSS-Music в {code_dir}. Сначала ./setup.sh")
    if not (weights_dir / "config.json").is_file():
        raise RuntimeError(f"нет весов в {weights_dir}. Сначала ./setup.sh")
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA недоступна. Нужна одна NVIDIA L4 и колесо torch 2.9.1+cu128.")
    free_bytes, total_bytes = torch.cuda.mem_get_info()
    if total_bytes < L4_MIN_BYTES:
        gib = total_bytes / (1024**3)
        raise RuntimeError(
            f"Видеопамять {gib:.2f} ГиБ меньше 22 ГиБ. "
            "BF16 MOSS-Music-8B занимает около 16.9 ГиБ и рассчитан на L4 24 ГБ. "
            "Загрузка остановлена до чтения весов."
        )
    if str(code_dir) not in sys.path:
        sys.path.insert(0, str(code_dir))
    from src.configuration_moss_music import MossMusicConfig, MossMusicEncoderConfig
    from src.modeling_moss_music import MossMusicModel
    from src.processing_moss_music import MossMusicProcessor

    # Класс берётся из закреплённого src/, не из укороченного modeling внутри весов.
    # trust_remote_code здесь выключен: auto_map чекпоинта подменяет конфиг короткой
    # копией, у которой audio_config остаётся словарём. Это тот сбой, который уже
    # наблюдался у AutoModel. Официальный infer.py импортирует тот же src-класс.
    config = MossMusicConfig.from_pretrained(str(weights_dir), local_files_only=True)
    if isinstance(config.audio_config, dict):
        config.audio_config = MossMusicEncoderConfig.from_dict(config.audio_config)
    # bfloat16 явно: fp32 на L4 не помещается.
    # low_cpu_mem_usage не держит вторую полную копию весов в 32 ГБ RAM.
    model = MossMusicModel.from_pretrained(
        str(weights_dir),
        config=config,
        trust_remote_code=False,
        torch_dtype=torch.bfloat16,
        device_map="cuda:0",
        low_cpu_mem_usage=True,
        local_files_only=True,
    )
    model.eval()
    processor = MossMusicProcessor.from_pretrained(
        str(weights_dir),
        local_files_only=True,
        enable_time_marker=True,
    )
    _ = free_bytes
    return Engine(model, processor)


def gpu_facts() -> dict:
    props = torch.cuda.get_device_properties(0)
    free_bytes, total_bytes = torch.cuda.mem_get_info()
    return {
        "name": torch.cuda.get_device_name(0),
        "total_bytes": int(total_bytes),
        "free_bytes_before_load": int(free_bytes),
        "capability": f"{props.major}.{props.minor}",
        "torch": torch.__version__,
        "cuda": torch.version.cuda,
    }
