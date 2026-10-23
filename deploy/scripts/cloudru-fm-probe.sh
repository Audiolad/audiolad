#!/usr/bin/env bash
# Secret-bearing commands must never be traced, exported or passed via argv.
set +x
set +v
set +a
set -euo pipefail
umask 077
ulimit -c 0
unset CLOUDRU_FM_API_KEY fm_secret fm_header

fail() { printf 'Ошибка: %s\n' "$1" >&2; exit 1; }
help() {
  cat <<'HELP'
Проверка Cloud.ru Foundation Models (без повторов запросов).
  sudo bash cloudru-fm-probe.sh          бесплатный GET /models
  sudo bash cloudru-fm-probe.sh --paid   один платный запрос на модель; подтверждение ДА
Ключ читается только из /etc/audiolad/cloudru-fm.env (root, права не шире 0600).
CLOUDRU_FM_ENV_FILE — другой файл; CLOUDRU_FM_PROBE_MODELS — ID через пробел.
CLOUDRU_FM_PROBE_MAX_TOKENS — 1..256 (по умолчанию 32).
Без терминала платный запуск требует CLOUDRU_FM_PROBE_CONFIRM=ДА.
Неизвестная цена: платный запуск только с CLOUDRU_FM_PROBE_ALLOW_UNPRICED=1.
Только для локального мока: CLOUDRU_FM_PROBE_ALLOW_LOCAL=1 разрешает
http://127.0.0.1:<port>; вместе с локальным URL разрешён
CLOUDRU_FM_PROBE_SKIP_OWNER_CHECK=1 (проверка прав остаётся).
Никогда не передавайте ключ в аргументах или переменных окружения.
HELP
}
paid=0
case "${1:-}" in
  --help|-h) help; exit 0 ;;
  --paid) paid=1 ;;
  '') ;;
  *) fail 'Неизвестный аргумент; используйте --help.' ;;
esac
(( $# <= 1 )) || fail 'Лишние аргументы; используйте --help.'
command -v curl >/dev/null || fail 'Нужен curl.'
command -v python3 >/dev/null || fail 'Нужен python3; тело ответа не выводится.'

env_file=${CLOUDRU_FM_ENV_FILE:-/etc/audiolad/cloudru-fm.env}
[[ -f "$env_file" && ! -L "$env_file" ]] || fail 'Env-файл отсутствует, не обычный файл или является symlink.'
# Check the opened inode, then read that same descriptor (no source/eval).
exec {env_fd}< "$env_file"
metadata=$(stat -Lc '%u %a' "/proc/$$/fd/$env_fd") || fail 'Не удалось проверить владельца и права env-файла.'
read -r owner mode <<< "$metadata"
(( (8#$mode & ~0600) == 0 )) || fail 'Env-файл должен иметь права не шире 0600, без group/other и execute.'
if [[ "$owner" != 0 ]]; then
  [[ ${CLOUDRU_FM_PROBE_SKIP_OWNER_CHECK:-0} == 1 && ${CLOUDRU_FM_PROBE_ALLOW_LOCAL:-0} == 1 ]] ||
    fail 'Владелец env-файла должен быть root (uid 0).'
fi
# Bash read discards NUL bytes; reject them before parsing instead.
python3 -c 'import sys; sys.exit(1 if b"\x00" in open(sys.argv[1], "rb").read() else 0)' \
  "/proc/$$/fd/$env_fd" || fail 'Env-файл содержит NUL или недоступен.'
fm_secret=''
base_url=https://foundation-models.api.cloud.ru/v1
key_seen=0
base_seen=0
while IFS= read -r line <&"$env_fd" || [[ -n "$line" ]]; do
  line=${line%$'\r'}
  [[ "$line" =~ ^[[:space:]]*$ || "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" == *=* ]] || fail 'В env-файле допустимы только KEY=VALUE.'
  name=${line%%=*}
  value=${line#*=}
  if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then
    value=${value:1:${#value}-2}
  fi
  case "$name" in
    CLOUDRU_FM_API_KEY)
      (( key_seen == 0 )) || fail 'Дублируется CLOUDRU_FM_API_KEY.'
      fm_secret=$value; key_seen=1 ;;
    CLOUDRU_FM_BASE_URL)
      (( base_seen == 0 )) || fail 'Дублируется CLOUDRU_FM_BASE_URL.'
      base_url=$value; base_seen=1 ;;
    *) fail 'В env-файле обнаружена неподдерживаемая переменная.' ;;
  esac
done
exec {env_fd}<&-
unset line value
[[ -n "$fm_secret" && ! "$fm_secret" =~ [[:space:][:cntrl:]] ]] || fail 'Ключ пуст или содержит пробелы/управляющие символы.'
base_url=${base_url%/}
local_url=0
if [[ "$base_url" =~ ^http://127\.0\.0\.1:([0-9]{1,5})(/[a-zA-Z0-9_./%-]*)?$ ]]; then
  port=${BASH_REMATCH[1]}
  [[ ${CLOUDRU_FM_PROBE_ALLOW_LOCAL:-0} == 1 ]] || fail 'Локальный URL разрешён только с CLOUDRU_FM_PROBE_ALLOW_LOCAL=1.'
  (( 10#$port >= 1 && 10#$port <= 65535 )) || fail 'Некорректный локальный порт.'
  local_url=1
elif [[ ! "$base_url" =~ ^https://foundation-models\.api\.cloud\.ru(/[a-zA-Z0-9_./%-]*)?$ ]]; then
  fail 'Разрешён только HTTPS-хост foundation-models.api.cloud.ru.'
fi
if [[ ${CLOUDRU_FM_PROBE_SKIP_OWNER_CHECK:-0} == 1 || "$owner" != 0 ]]; then
  [[ ${CLOUDRU_FM_PROBE_ALLOW_LOCAL:-0} == 1 && "$local_url" == 1 ]] || fail 'Пропуск владельца допустим только для локального мока.'
fi
read -r -a models <<< "${CLOUDRU_FM_PROBE_MODELS-openai/gpt-oss-120b Qwen/Qwen3.6-35B-A3B}"
(( ${#models[@]} > 0 )) || fail 'Список моделей пуст.'
[[ ! ${CLOUDRU_FM_PROBE_MODELS:-} =~ [[:cntrl:]] ]] || fail 'Список моделей содержит управляющие символы.'
for model in "${models[@]}"; do
  [[ "$model" =~ ^[a-zA-Z0-9_./-]+$ ]] || fail 'Недопустимый ID модели.'
done
max_tokens=${CLOUDRU_FM_PROBE_MAX_TOKENS:-32}
[[ "$max_tokens" =~ ^[0-9]{1,3}$ ]] || fail 'max_tokens должен быть целым числом 1..256.'
max_tokens=$((10#$max_tokens))
(( max_tokens >= 1 && max_tokens <= 256 )) || fail 'max_tokens должен быть в диапазоне 1..256.'

workdir=$(mktemp -d /tmp/cloudru-fm-probe.XXXXXXXX)
cleanup() { rm -rf -- "$workdir"; unset fm_secret fm_header; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cat > "$workdir/fm_probe_json.py" <<'PY'
import json
import sys
import unicodedata
from decimal import Decimal

# App. 7.EVO.11.2, version 261023, effective 2026-10-23; RUB incl. VAT / 1M.
PRICES = {
    'openai/gpt-oss-120b': ('15.86', '61.00'),
    'Qwen/Qwen3.6-35B-A3B': ('219.60', '329.40'),
    'Qwen/Qwen3.5-397B-A17B': ('915.00', '1085.80'),
    'Qwen/Qwen3-Coder-Next': ('122.00', '244.00'),
}
secret = sys.stdin.read()
def safe(value):
    text = str(value).replace(secret, '[скрыто]') if secret else str(value)
    return ''.join(c if not unicodedata.category(c).startswith('C') else ' ' for c in text)
def cost(model, prompt, completion):
    if model not in PRICES:
        return 'цена неизвестна, сверить в карточке модели'
    a, b = map(Decimal, PRICES[model])
    return f'{(prompt * a + completion * b) / 1000000:.6f} ₽ с НДС (оценка без округления биллинга)'
def tokens(value):
    if type(value) is not int or value < 0:
        raise ValueError('usage')
    return value

mode = sys.argv[1]
try:
    if mode == 'plan':
        limit, allow = int(sys.argv[2]), sys.argv[3] == '1'
        ok = True
        print(f'Платная проба: max_tokens={limit}; оценка на модель при 40 входных токенах:')
        for model in sys.argv[4:]:
            print(safe(f'  {model}: {cost(model, 40, limit)}'))
            if model not in PRICES and not allow:
                ok = False
        if not ok:
            print('Отказ: для неизвестной цены нужен CLOUDRU_FM_PROBE_ALLOW_UNPRICED=1.')
        sys.exit(0 if ok else 1)
    if mode == 'request':
        print(json.dumps({'model': sys.argv[2], 'messages': [
            {'role': 'user', 'content': 'Ответь одним словом: готово'}],
            'max_tokens': int(sys.argv[3]), 'temperature': 0, 'stream': False}, ensure_ascii=False))
        sys.exit(0)
    status = sys.argv[3]
    print(f'HTTP {status}')
    if mode == 'completion':
        print(safe(f'Модель: {sys.argv[4]}'))
    failed = not 200 <= int(status) < 300
    if failed:
        hints = {'401': 'Ключ неверный/истёк/не тот сервис/IP не в списке разрешённых.',
                 '403': 'Ключ неверный/истёк/не тот сервис/IP не в списке разрешённых; проверьте роль в проекте.',
                 '402': 'Проверьте баланс/лимит.', '429': 'Проверьте баланс/лимит; автоматического повтора нет.'}
        print(hints.get(status, 'Ошибка API; проверьте доступность сервиса и параметры запроса.'))
    try:
        with open(sys.argv[2], encoding='utf-8') as response:
            data = json.load(response)
    except (ValueError, UnicodeError):
        print('Ответ не JSON; тело не выводится.')
        sys.exit(1)
    if failed:
        error = data.get('error') if isinstance(data, dict) else None
        message = error.get('message') if isinstance(error, dict) else None
        if isinstance(message, str):
            print(safe(message)[:300])
        sys.exit(1)
    if mode == 'catalog':
        ids = {item['id'] for item in data['data'] if isinstance(item, dict) and isinstance(item.get('id'), str)}
        ok = True
        for model in sys.argv[4:]:
            present = model in ids
            print(safe(f'{model}: ' + ('есть в каталоге' if present else 'нет')))
            ok = ok and present
        sys.exit(0 if ok else 1)
    model = sys.argv[4]
    usage = data['usage']
    prompt, completion, total = (tokens(usage[k]) for k in ('prompt_tokens', 'completion_tokens', 'total_tokens'))
    print(f'prompt_tokens={prompt}; completion_tokens={completion}; total_tokens={total}')
    content = data['choices'][0]['message'].get('content')
    if content is not None and not isinstance(content, str):
        raise ValueError('content')
    print('Ответ: ' + (safe(content)[:80] if content else 'пусто; модель потратила токены на reasoning (если completion_tokens > 0)'))
    print(cost(model, prompt, completion))
except (KeyError, TypeError, ValueError, IndexError, OSError):
    # No traceback or response dump: either can contain reflected credentials.
    print('Некорректный ответ API: отсутствуют ожидаемые поля или usage.')
    sys.exit(1)
PY
report() { printf '%s' "$fm_secret" | python3 "$workdir/fm_probe_json.py" "$@"; }
if (( paid )); then
  report plan "$max_tokens" "${CLOUDRU_FM_PROBE_ALLOW_UNPRICED:-0}" "${models[@]}" || exit 1
  if [[ ${CLOUDRU_FM_PROBE_CONFIRM:-} != ДА ]]; then
    [[ -t 0 ]] || fail 'Нет терминала: требуется CLOUDRU_FM_PROBE_CONFIRM=ДА.'
    printf 'Для платных запросов введите ДА: '
    IFS= read -r confirmation || fail 'Подтверждение не получено.'
    [[ "$confirmation" == ДА ]] || fail 'Платные запросы отменены.'
  fi
fi
# Escape curl config metacharacters; the secret stays in shell memory and a pipe.
fm_header=${fm_secret//\\/\\\\}
fm_header=${fm_header//\"/\\\"}
request() {
  local endpoint=$1
  shift
  # -q must be first: ignore ~/.curlrc (redirects, verbose, retries, proxies).
  # Never print curl stderr, response headers or an error response verbatim.
  if ! http_code=$(printf 'header = "Authorization: Bearer %s"\n' "$fm_header" |
    curl -q -K - --silent --no-location --max-redirs 0 --retry 0 \
      --noproxy '*' --proto '=https,http' --connect-timeout 10 --max-time 60 \
      --output "$workdir/response.json" --write-out '%{http_code}' \
      "$@" --url "$base_url/$endpoint" 2>/dev/null); then
    printf 'HTTP %s; ошибка соединения/TLS/таймаут; повторов нет.\n' "${http_code:-000}" >&2
    return 1
  fi
}
if (( ! paid )); then
  request models || exit 1
  report catalog "$workdir/response.json" "$http_code" "${models[@]}"
else
  result=0
  # A finite single pass: exactly one POST per selected model, no polling/retries.
  for model in "${models[@]}"; do
    python3 "$workdir/fm_probe_json.py" request "$model" "$max_tokens" </dev/null > "$workdir/request.json"
    if request chat/completions --header 'Content-Type: application/json' --data-binary "@$workdir/request.json"; then
      report completion "$workdir/response.json" "$http_code" "$model" || result=1
    else
      result=1
    fi
  done
  exit "$result"
fi
