#!/usr/bin/env bash
# Одноразовая подготовка VM Selectel: Ubuntu 22.04, драйвер NVIDIA 580, одна L4 24 ГБ.
# Повторный запуск ничего не перекачивает, если коммит, версии и SHA256 шардов на месте.
# Токен Hugging Face не нужен и в этот процесс не передаётся.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAR="${MOSS_VAR:-$ROOT/var}"
CODE_DIR="$VAR/MOSS-Music"
WEIGHTS="$VAR/weights/MOSS-Music-8B-Instruct"
VENV="$VAR/venv"
COMMIT="ad107c7ddaa06de168a0dfbc18d3e1e6a40c0e5e"
REVISION="fce7f8304e96cc2d3398b8106456cbb2ecec3139"
REPO_URL="https://github.com/OpenMOSS/MOSS-Music.git"
REPO_ID="OpenMOSS-Team/MOSS-Music-8B-Instruct"
MIN_FREE_GB=45

log() { printf '[moss-setup] %s\n' "$*"; }
die() { printf '[moss-setup] ERROR: %s\n' "$*" >&2; exit 1; }

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
usage: ./setup.sh [--plan]

Без флагов: проверить nvidia-smi, поставить зависимости, скачать веса.
--plan: печатает закреплённые версии и оценку диска, ничего не ставит.
EOF
  exit 0
fi

if [[ "${1:-}" == "--plan" ]]; then
  cat <<EOF
code: $REPO_URL @ $COMMIT
weights: $REPO_ID @ $REVISION
license card: apache-2.0, gated=false, файла LICENSE на этих ревизиях нет
dtype: bfloat16, parameters: 9052464128, tensors about 16.9 GiB, four shards about 16.9 GiB
torch: 2.9.1+cu128, transformers: 4.57.1
disk free needed: ${MIN_FREE_GB} GB
HF token: not used
target GPU: one NVIDIA L4, nvidia-smi memory at least 22000 MiB
variant: Instruct. Thinking is not downloaded.
EOF
  exit 0
fi

if [[ $# -gt 0 ]]; then
  die "неизвестный аргумент: $1"
fi

command -v nvidia-smi >/dev/null 2>&1 || die "nvidia-smi не найден. Нужен образ Ubuntu 22.04 GPU Driver 580."
nvidia-smi
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader

mapfile -t GPU_MEM < <(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits)
if [[ "${#GPU_MEM[@]}" -lt 1 ]]; then
  die "nvidia-smi не показал ни одной карты"
fi
if [[ "${#GPU_MEM[@]}" -gt 1 ]]; then
  log "видно карт: ${#GPU_MEM[@]}. Прогон использует cuda:0."
fi
if [[ "${GPU_MEM[0]// /}" -lt 22000 ]]; then
  die "у cuda:0 ${GPU_MEM[0]} MiB. Для BF16 нужен запас L4, ориентир от 22000 MiB. Веса не скачиваю."
fi

avail_kb="$(df -k --output=avail "$ROOT" | tail -1 | tr -d ' ')"
avail_gb="$((avail_kb / 1024 / 1024))"
if [[ "$avail_gb" -lt "$MIN_FREE_GB" ]]; then
  die "свободно ${avail_gb} ГБ, нужно не меньше ${MIN_FREE_GB} ГБ под веса и venv"
fi

as_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo -n "$@"
  fi
}

missing=()
command -v git >/dev/null 2>&1 || missing+=(git)
command -v ffmpeg >/dev/null 2>&1 || missing+=(ffmpeg)
command -v python3 >/dev/null 2>&1 || missing+=(python3)
python3 -c 'import venv, ensurepip' >/dev/null 2>&1 || missing+=(python3-venv)
if [[ "${#missing[@]}" -gt 0 ]]; then
  log "ставлю пакеты: ${missing[*]}"
  export DEBIAN_FRONTEND=noninteractive
  as_root apt-get update
  as_root apt-get install -y "${missing[@]}" ca-certificates
fi

python3 - <<'PY' || die "нужен Python не ниже 3.10"
import sys
raise SystemExit(0 if sys.version_info >= (3, 10) else 1)
PY

mkdir -p "$VAR"
if [[ ! -x "$VENV/bin/python" ]]; then
  python3 -m venv "$VENV"
fi
PY="$VENV/bin/python"
"$PY" -m pip install --upgrade "pip==25.2"

if ! "$PY" - <<'PY'
import torch
import transformers
raise SystemExit(0 if torch.__version__.startswith("2.9.1") and "+cu128" in torch.__version__ and transformers.__version__ == "4.57.1" else 1)
PY
then
  log "ставлю закреплённые пакеты"
  "$PY" -m pip install --extra-index-url https://download.pytorch.org/whl/cu128 -r "$ROOT/requirements.txt"
fi

"$PY" - <<'PY' || die "torch не видит CUDA. Нужен драйвер 580 и колесо cu128, не cpu."
import torch
assert torch.cuda.is_available(), "cuda is not available"
print("torch", torch.__version__, "cuda", torch.version.cuda, "gpu", torch.cuda.get_device_name(0))
PY

if [[ -d "$CODE_DIR/.git" ]] && [[ "$(git -C "$CODE_DIR" rev-parse HEAD)" == "$COMMIT" ]]; then
  log "код уже на $COMMIT"
else
  if [[ ! -d "$CODE_DIR/.git" ]]; then
    git clone "$REPO_URL" "$CODE_DIR"
  fi
  git -C "$CODE_DIR" fetch --depth 1 origin "$COMMIT"
  git -C "$CODE_DIR" checkout --detach "$COMMIT"
fi
[[ "$(git -C "$CODE_DIR" rev-parse HEAD)" == "$COMMIT" ]] || die "код не на коммите $COMMIT"

mkdir -p "$WEIGHTS"
export HF_HUB_DISABLE_TELEMETRY=1
if ! env -u HF_TOKEN -u HUGGING_FACE_HUB_TOKEN -u HF_HUB_TOKEN \
  "$VENV/bin/python" - "$WEIGHTS" "$REVISION" "$REPO_ID" "$ROOT/weights.sha256" <<'PY'
import hashlib
import sys
from pathlib import Path

weights = Path(sys.argv[1])
revision = sys.argv[2]
repo_id = sys.argv[3]
manifest = Path(sys.argv[4])
expected = {}
for line in manifest.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    digest, name = line.split(None, 1)
    expected[name] = digest

def hashes_ok() -> bool:
    for name, digest in expected.items():
        path = weights / name
        if not path.is_file():
            return False
        hasher = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
                hasher.update(chunk)
        if hasher.hexdigest() != digest:
            print(f"sha256 mismatch {name}", file=sys.stderr)
            return False
    return True

stamp = weights / ".sha256-ok"
if stamp.is_file() and stamp.read_text().strip() == revision and all((weights / name).is_file() for name in expected):
    print("weights stamp ok", revision)
    raise SystemExit(0)
if hashes_ok():
    stamp.write_text(revision + "\n")
    print("weights hash ok")
    raise SystemExit(0)

try:
    from huggingface_hub import snapshot_download
    snapshot_download(repo_id=repo_id, revision=revision, local_dir=str(weights))
except Exception as exc:
    text = str(exc).lower()
    if any(token in text for token in ("401", "403", "gated", "unauthorized", "forbidden")):
        print(
            "Hugging Face отказал в доступе. Модель публичная, токен не нужен и скрипт его не подставляет. "
            "Проверьте сеть и ревизию, секрет добавлять не надо.",
            file=sys.stderr,
        )
        raise SystemExit(1) from exc
    raise
if not hashes_ok():
    print("веса скачаны, но SHA256 шардов не совпал с weights.sha256", file=sys.stderr)
    raise SystemExit(1)
stamp.write_text(revision + "\n")
print("weights downloaded", revision)
PY
then
  die "загрузка весов не завершилась"
fi

"$PY" - <<PY
import sys
sys.path.insert(0, "$CODE_DIR")
import torch
import transformers
import src.modeling_moss_music  # noqa: F401
print("python", sys.version.split()[0])
print("transformers", transformers.__version__)
print("torch", torch.__version__)
PY
ffmpeg -version | head -n 1
log "код $COMMIT"
log "веса $WEIGHTS"
du -sh "$WEIGHTS" "$VENV" || true
log "готово"
