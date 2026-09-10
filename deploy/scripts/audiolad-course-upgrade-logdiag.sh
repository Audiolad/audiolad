#!/bin/bash
# Draft privileged read-only Audiolad web PM2 log diagnostic.
# Intended install path: /usr/local/sbin/audiolad-course-upgrade-logdiag
# (root:root, 0755). This file is NOT installed by merging to main.
#
# Accepts NO arguments. No arbitrary command, path, or remote shell.
# Privileged wrapper reads ONLY /root/.pm2/logs (root PM2 God namespace).
# Deploy-user PM2 logs stay with ordinary OPS_COURSE_UPGRADE_DIAG (no sudo).
# Reads ONLY Audiolad web PM2 logs matching audiolad-p3000*,
# audiolad-p3001*, audiolad-p30xx* (including rotations and .gz).
# Never follows caller/user-controlled symlinks. Never prints raw log lines.
# Emits allowlisted SAFE_SUMMARY only.
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
unset BASH_ENV || true
unset ENV || true
unset PYTHONPATH || true
unset PYTHONHOME || true
unset PYTHONSTARTUP || true
unset PYTHONUSERBASE || true
unset CDPATH || true
hash -r 2>/dev/null || true

PRIORITY_START="${AUDIOLAD_COURSE_UPGRADE_DIAG_WINDOW_START:-2026-09-10T04:25:00Z}"
PRIORITY_END="${AUDIOLAD_COURSE_UPGRADE_DIAG_WINDOW_END:-2026-09-10T04:50:00Z}"

# Fixed privileged log root only. No caller-supplied paths. No non-root homes.
PRIVILEGED_LOG_ROOT=/root/.pm2/logs

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
import io
import os
import re
import stat
import sys
from collections import deque
from datetime import datetime, timezone

path = sys.argv[1]
priority_start = sys.argv[2]
priority_end = sys.argv[3]
ALLOWED_ROOT = "/root/.pm2/logs"
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


def skip_candidate(reason):
    print("privileged_log_skip path=%s reason=%s" % (path, reason))
    raise SystemExit(0)


def canonical_inside_root(candidate, root=ALLOWED_ROOT):
    real = os.path.realpath(candidate)
    abs_root = os.path.abspath(root)
    root_real = os.path.realpath(root)
    if root_real != abs_root:
        return False
    prefix = abs_root.rstrip(os.sep) + os.sep
    return real == abs_root.rstrip(os.sep) or real.startswith(prefix)


def open_log(log_path):
    if not hasattr(os, "O_NOFOLLOW"):
        skip_candidate("ofollow_unavailable")
    try:
        lst = os.lstat(log_path)
    except OSError:
        skip_candidate("lstat_failed")
    if stat.S_ISLNK(lst.st_mode):
        skip_candidate("symlink")
    if not stat.S_ISREG(lst.st_mode):
        skip_candidate("not_regular_file")
    if not canonical_inside_root(log_path):
        skip_candidate("outside_privileged_root")
    flags = os.O_RDONLY | os.O_NOFOLLOW
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    fd = None
    raw = None
    try:
        fd = os.open(log_path, flags)
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode):
            skip_candidate("fstat_not_regular")
        raw = os.fdopen(fd, "rb")
        fd = None
        if log_path.endswith(".gz"):
            gz = gzip.GzipFile(fileobj=raw, mode="rb")
            return io.TextIOWrapper(gz, errors="replace")
        return io.TextIOWrapper(raw, errors="replace")
    except SystemExit:
        if raw is not None:
            try:
                raw.close()
            except Exception:
                pass
        elif fd is not None:
            try:
                os.close(fd)
            except Exception:
                pass
        raise
    except OSError:
        if raw is not None:
            try:
                raw.close()
            except Exception:
                pass
        elif fd is not None:
            try:
                os.close(fd)
            except Exception:
                pass
        raise
    except Exception:
        if raw is not None:
            try:
                raw.close()
            except Exception:
                pass
        elif fd is not None:
            try:
                os.close(fd)
            except Exception:
                pass
        raise


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
  python3 -I "${helper}" "$1" "${PRIORITY_START}" "${PRIORITY_END}"
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

ALLOWED_ROOT = "/root/.pm2/logs"


def classify(path):
    path = os.path.abspath(path)
    try:
        st = os.lstat(path)
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
    if stat.S_ISLNK(st.st_mode):
        return "SYMLINK_SKIP"
    if path == os.path.abspath(ALLOWED_ROOT) and os.path.realpath(path) != path:
        return "SYMLINK_SKIP"
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
  python3 -I "${helper}" "$1"
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
echo "privileged_log_root=${PRIVILEGED_LOG_ROOT}"
echo "priority_window_start=${PRIORITY_START}"
echo "priority_window_end=${PRIORITY_END}"
echo "note=SAFE_SUMMARY only; raw log lines are never printed"
echo "note=privileged wrapper reads ONLY /root/.pm2/logs; deploy-user PM2 logs stay unsudoed"

if ! command -v python3 >/dev/null 2>&1; then
  echo "scanner_unavailable reason=python3_not_found"
  exit 0
fi

state="$(classify_path_state "${PRIVILEGED_LOG_ROOT}")"
echo "log_dir path=${PRIVILEGED_LOG_ROOT} state=${state}"
if [[ "${state}" == "PRESENT_READABLE" ]]; then
  shopt -s nullglob
  for path in \
    "${PRIVILEGED_LOG_ROOT}"/audiolad-p3000* \
    "${PRIVILEGED_LOG_ROOT}"/audiolad-p3001* \
    "${PRIVILEGED_LOG_ROOT}"/audiolad-p30*
  do
    if [[ -L "${path}" ]]; then
      echo "privileged_log_skip path=${path} reason=symlink"
      continue
    fi
    [[ -f "${path}" ]] || continue
    allowlisted_web_log "${path}" || continue
    echo "privileged_log_candidate path=${path}"
    echo "log_matches kind=privileged <<"
    scan_log_file "${path}" | redact_stream
    echo ">>log_matches"
  done
  shopt -u nullglob
fi

echo "PRIVILEGED_LOGDIAG_END=OK"
