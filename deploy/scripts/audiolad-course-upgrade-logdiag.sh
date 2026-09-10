#!/usr/bin/env bash
# Draft privileged read-only Audiolad web PM2 log diagnostic.
# Intended install path: /usr/local/sbin/audiolad-course-upgrade-logdiag
# (root:root, 0755). This file is NOT installed by merging to main.
#
# Accepts NO arguments. No arbitrary command, path, or remote shell.
# Reads ONLY Audiolad web PM2 logs matching audiolad-p3000*,
# audiolad-p3001*, audiolad-p30xx* (including rotations and .gz).
# Never prints raw log lines. Emits allowlisted SAFE_SUMMARY only.
# Never restarts/starts/deletes PM2. Never writes app or DB.
# Never checkout / Tochka / deploy / cutover.
set -Eeuo pipefail

if [[ $# -ne 0 ]]; then
  printf 'ERROR: audiolad-course-upgrade-logdiag accepts no arguments.\n' >&2
  exit 1
fi

# Ignore caller PATH. Fixed safe search path only.
PATH=/usr/sbin:/usr/bin:/bin
export PATH
unset CDPATH
hash -r 2>/dev/null || true

PRIORITY_START="${AUDIOLAD_COURSE_UPGRADE_DIAG_WINDOW_START:-2026-09-10T04:25:00Z}"
PRIORITY_END="${AUDIOLAD_COURSE_UPGRADE_DIAG_WINDOW_END:-2026-09-10T04:50:00Z}"

# Fixed candidate homes only. No caller-supplied paths.
LOG_DIRS=(
  /root/.pm2/logs
  /home/deploy/.pm2/logs
)

redact_stream() {
  sed -E \
    -e 's/(GETCOURSE_API_KEY=).*/\1***/g' \
    -e 's/(GETCOURSE_CALLBACK_SECRET=).*/\1***/g' \
    -e 's/(SUPABASE_SERVICE_ROLE_KEY=).*/\1***/g' \
    -e 's/(TOCHKA_[A-Z0-9_]+=).*/\1***/g' \
    -e 's/(Authorization:[[:space:]]*).*/\1[redacted-authorization]/Ig' \
    -e 's/(Bearer[[:space:]]+)[A-Za-z0-9._~+/-]+=*/\1[redacted-token]/g' \
    -e 's/has_checkout_token=/__SAFE_HAS_CHECKOUT_FLAG=/g' \
    -e 's/has_payment_url=/__SAFE_HAS_PAYMENT_URL=/g' \
    -e 's/has_provider_metadata=/__SAFE_HAS_PROVIDER_METADATA=/g' \
    -e 's/has_provider_payment_id=/__SAFE_HAS_PROVIDER_PAYMENT_ID=/g' \
    -e 's/(^|[^[:alnum:]_])((access_token|refresh_token|checkout_token|provider_token|[A-Za-z0-9_]*_token|token)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?)[^[:space:],;"'"'"'}]+/\1\2[redacted-token]/Ig' \
    -e 's/(^|[^[:alnum:]_])((payment_url)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?)[^[:space:]"'"'"']+/\1\2[redacted-payment-url]/Ig' \
    -e 's/(^|[^[:alnum:]_])((user_id)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?)[^[:space:],;"'"'"'}]+/\1\2[redacted-user-id]/Ig' \
    -e 's/(^|[^[:alnum:]_])((cookie|cookies)["'"'"']?[[:space:]]*[:=][[:space:]]*)[^[:space:]]+/\1\2[redacted-cookie]/Ig' \
    -e 's/(^|[^[:alnum:]_])((password|passwd|secret|api_key|service_role)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"']?)[^[:space:]"'"'"']+/\1\2[redacted-secret]/Ig' \
    -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/[redacted-email]/g' \
    -e 's/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/[redacted-jwt]/g' \
    -e 's#https?://[^[:space:]\"'"'"']+#[redacted-url]#g' \
    -e 's/__SAFE_HAS_CHECKOUT_FLAG=/has_checkout_token=/g' \
    -e 's/__SAFE_HAS_PAYMENT_URL=/has_payment_url=/g' \
    -e 's/__SAFE_HAS_PROVIDER_METADATA=/has_provider_metadata=/g' \
    -e 's/__SAFE_HAS_PROVIDER_PAYMENT_ID=/has_provider_payment_id=/g'
}

scan_log_file() {
  local helper=""
  helper="$(mktemp /tmp/audiolad-course-upgrade-logdiag-scan.XXXXXX.py)"
  cat >"${helper}" <<'PY'
import gzip
import re
import sys
from collections import deque
from datetime import datetime, timezone

path = sys.argv[1]
priority_start = sys.argv[2]
priority_end = sys.argv[3]
PRIORITY_MAX = 40
RECENT_MAX = 20
LOOKAHEAD = 16

EVENT_RE = re.compile(
    r"(?<![A-Za-z0-9_])("
    r"course_upgrade_failed|"
    r"create_payment_tochka_error|"
    r"create_payment_tochka_http_error|"
    r"course_upgrade_auth_error|"
    r"course_upgrade_order_invalid_row|"
    r"course_upgrade_order_reload_error|"
    r"create_payment_metadata_update_error|"
    r"provider_checkout_failed|"
    r"createTochkaPaymentOperation|"
    r"startTochkaCheckoutForPendingOrder"
    r")(?![A-Za-z0-9_])"
)
FIELD_VALUE_PREFIX_RE = re.compile(
    r"(FAILED_STAGE|ACTUAL_API_ERROR|ACTUAL_HTTP_STATUS)\s*[:=]\s*"
)
WINDOW_RE = re.compile(
    r"20\d{2}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?"
)
FIELD_RE = re.compile(
    r"(FAILED_STAGE|ACTUAL_API_ERROR|ACTUAL_HTTP_STATUS|order_id|practice_id|target_access_level)"
    r"""["']?\s*[:=]\s*["']?([^\s,"'}]+)"""
)
HTTP_ERR_RE = re.compile(
    r"create_payment_tochka_http_error(?:\s+|:)(\d{3})(?:\s+([A-Za-z0-9_.-]{1,64}))?"
)
STAGE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,79}$")
ERROR_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,79}$")
STATUS_RE = re.compile(r"^\d{3}$")
UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
LEVEL_RE = re.compile(r"^-?\d{1,4}$")
CODE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,63}$")


def parse_ts(raw):
    text = raw.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    if re.search(r"[+-]\d{4}$", text):
        text = text[:-5] + text[-5:-2] + ":" + text[-2:]
    if "T" not in text and " " in text:
        text = text.replace(" ", "T", 1)
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", text):
        text += "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


start = parse_ts(priority_start)
end = parse_ts(priority_end)


def classify(line):
    match = WINDOW_RE.search(line)
    if not match or start is None or end is None:
        return "unknown", ""
    ts = parse_ts(match.group(0))
    if ts is None:
        return "unknown", match.group(0)
    if start <= ts <= end:
        return "priority", match.group(0)
    return "recent", match.group(0)


def sanitize(key, value):
    raw = value.strip().strip("'\"")
    if key == "FAILED_STAGE":
        return raw if STAGE_RE.fullmatch(raw) else None
    if key == "ACTUAL_API_ERROR":
        return raw if ERROR_RE.fullmatch(raw) else None
    if key == "ACTUAL_HTTP_STATUS":
        return raw if STATUS_RE.fullmatch(raw) else None
    if key in ("order_id", "practice_id"):
        return raw.lower() if UUID_RE.fullmatch(raw) else None
    if key == "target_access_level":
        return raw if LEVEL_RE.fullmatch(raw) else None
    if key == "provider_http_status":
        return raw if STATUS_RE.fullmatch(raw) else None
    if key == "provider_error_code":
        return raw if CODE_RE.fullmatch(raw) else None
    return None


def extract_allowlisted(line, fields):
    for match in FIELD_RE.finditer(line):
        cleaned = sanitize(match.group(1), match.group(2))
        if cleaned is not None:
            fields[match.group(1)] = cleaned
    http = HTTP_ERR_RE.search(line)
    if http:
        status = sanitize("provider_http_status", http.group(1))
        if status:
            fields["provider_http_status"] = status
        if http.group(2):
            code = sanitize("provider_error_code", http.group(2))
            if code:
                fields["provider_error_code"] = code


def detect_event(line):
    match = EVENT_RE.search(line)
    if not match:
        return None
    prefix = line[: match.start()]
    if FIELD_VALUE_PREFIX_RE.search(prefix):
        return None
    return match.group(1)


def is_object_close(line):
    stripped = line.strip()
    return stripped in ("}", "};", "},") or stripped.endswith("}")


def open_log(log_path):
    if log_path.endswith(".gz"):
        return gzip.open(log_path, "rt", errors="replace")
    return open(log_path, "r", errors="replace")


def emit(bucket, window, lineno, event, ts, fields):
    item = {
        "window": window,
        "line": lineno,
        "event": event or "unknown",
        "ts": ts,
        "fields": dict(fields),
    }
    bucket.append(item)


priority = deque(maxlen=PRIORITY_MAX)
recent = deque(maxlen=RECENT_MAX)
match_count = 0
priority_count = 0
other_count = 0

handle = None
try:
    handle = open_log(path)
except gzip.BadGzipFile as err:
    print("compressed_log_error path=%s" % path)
    print("scan_error_class=%s" % err.__class__.__name__)
    raise SystemExit(0)
except OSError as err:
    kind = "compressed_log_error" if path.endswith(".gz") else "log_unreadable"
    print("%s path=%s" % (kind, path))
    print("scan_error_class=%s" % err.__class__.__name__)
    raise SystemExit(0)

try:
    lineno = 0
    pending = None
    while True:
        if pending is not None:
            raw = pending
            pending = None
        else:
            raw = handle.readline()
            if raw == "":
                break
        lineno += 1
        line = raw.rstrip("\n")
        event = detect_event(line)
        if event is None:
            continue
        fields = {}
        extract_allowlisted(line, fields)
        window, ts = classify(line)
        if (event == "course_upgrade_failed" or "{" in line) and not is_object_close(line):
            for _ in range(LOOKAHEAD):
                nxt = handle.readline()
                if nxt == "":
                    break
                lineno += 1
                nxt_line = nxt.rstrip("\n")
                extract_allowlisted(nxt_line, fields)
                if is_object_close(nxt_line):
                    break
                nxt_event = detect_event(nxt_line)
                if nxt_event and WINDOW_RE.match(nxt_line.lstrip()):
                    pending = nxt
                    lineno -= 1
                    break
        match_count += 1
        if window == "priority":
            priority_count += 1
            emit(priority, window, lineno, event, ts, fields)
        else:
            other_count += 1
            emit(recent, window, lineno, event, ts, fields)
except (OSError, EOFError, gzip.BadGzipFile) as err:
    kind = "compressed_log_error" if path.endswith(".gz") else "log_unreadable"
    print("%s path=%s" % (kind, path))
    print("scan_error_class=%s" % err.__class__.__name__)
    raise SystemExit(0)
finally:
    if handle is not None:
        try:
            handle.close()
        except Exception:
            pass

print("match_count=%s" % match_count)
print("priority_match_count=%s" % priority_count)
print("other_match_count=%s" % other_count)
print("printed_match_count=%s" % (len(priority) + len(recent)))
wanted = (
    "FAILED_STAGE",
    "ACTUAL_API_ERROR",
    "ACTUAL_HTTP_STATUS",
    "provider_http_status",
    "provider_error_code",
    "order_id",
    "practice_id",
    "target_access_level",
)
for item in list(priority) + list(recent):
    parts = [
        "SAFE_SUMMARY",
        "window=%s" % item["window"],
        "line=%s" % item["line"],
        "event=%s" % item["event"],
    ]
    if item["ts"]:
        parts.append("ts=%s" % item["ts"])
    for key in wanted:
        if key in item["fields"]:
            parts.append("%s=%s" % (key, item["fields"][key]))
    print(" ".join(parts))
PY
  python3 "${helper}" "$1" "${PRIORITY_START}" "${PRIORITY_END}"
  rm -f "${helper}"
}

classify_path_state() {
  local helper=""
  helper="$(mktemp /tmp/audiolad-course-upgrade-logdiag-path.XXXXXX.py)"
  cat >"${helper}" <<'PY'
import errno
import os
import stat
import sys

def classify(path):
    path = os.path.abspath(path)
    try:
        st = os.stat(path)
    except FileNotFoundError:
        parent = os.path.dirname(path)
        if parent == path:
            return "ABSENT_PROVEN"
        parent_state = classify(parent)
        if parent_state in ("PRESENT_READABLE", "ABSENT_PROVEN"):
            return "ABSENT_PROVEN"
        return "UNKNOWN_PERMISSION_DENIED"
    except PermissionError:
        return "UNKNOWN_PERMISSION_DENIED"
    except OSError as err:
        if err.errno in (errno.EACCES, errno.EPERM):
            return "UNKNOWN_PERMISSION_DENIED"
        return "UNKNOWN_PERMISSION_DENIED"
    readable = os.access(path, os.R_OK)
    if stat.S_ISDIR(st.st_mode):
        if readable and os.access(path, os.X_OK):
            return "PRESENT_READABLE"
        return "PRESENT_NOT_READABLE"
    if readable:
        return "PRESENT_READABLE"
    return "PRESENT_NOT_READABLE"

print(classify(sys.argv[1]))
PY
  python3 "${helper}" "$1"
  rm -f "${helper}"
}

allowlisted_web_log() {
  local base
  base="$(basename -- "$1")"
  case "${base}" in
    audiolad-p3000*|audiolad-p3001*|audiolad-p30*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

echo "confirm=OPS_COURSE_UPGRADE_LOGDIAG"
echo "PRIVILEGED_LOGDIAG=OK"
echo "CUTOVER=NO"
echo "audiolad_deploy=NOT_INVOKED"
echo "checkout_post=NOT_INVOKED"
echo "tochka_calls=NOT_INVOKED"
echo "entitlement_writes=NOT_INVOKED"
echo "pm2_mutate=NOT_INVOKED"
echo "mode=read_only_privileged_web_pm2_logs"
echo "priority_window_start=${PRIORITY_START}"
echo "priority_window_end=${PRIORITY_END}"
echo "note=SAFE_SUMMARY only; raw log lines are never printed"

if ! command -v python3 >/dev/null 2>&1; then
  echo "scanner_unavailable reason=python3_not_found"
  exit 0
fi

for dir in "${LOG_DIRS[@]}"; do
  state="$(classify_path_state "${dir}")"
  echo "log_dir path=${dir} state=${state}"
  if [[ "${state}" != "PRESENT_READABLE" ]]; then
    continue
  fi
  shopt -s nullglob
  for path in \
    "${dir}"/audiolad-p3000* \
    "${dir}"/audiolad-p3001* \
    "${dir}"/audiolad-p30*
  do
    [[ -f "${path}" ]] || continue
    allowlisted_web_log "${path}" || continue
    echo "privileged_log_candidate path=${path}"
    echo "log_matches kind=privileged <<"
    scan_log_file "${path}" | redact_stream
    echo ">>log_matches"
  done
  shopt -u nullglob
done

echo "PRIVILEGED_LOGDIAG_END=OK"
